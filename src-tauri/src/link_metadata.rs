use std::io::Read;
use std::net::IpAddr;
use std::time::Duration;

use regex::Regex;
use reqwest::blocking::Client;
use reqwest::header::{CONTENT_TYPE, USER_AGENT};
use reqwest::redirect::Policy;
use serde::Serialize;
use url::Url;

const MAX_HTML_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkMetadata {
    pub url: String,
    pub title: String,
    pub domain: String,
}

pub fn validate_public_http_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "올바른 URL이 아닙니다.".to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("HTTP 또는 HTTPS 링크만 지원합니다.".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("인증 정보가 포함된 링크는 조회할 수 없습니다.".into());
    }

    let host = url
        .host_str()
        .ok_or_else(|| "링크에 호스트가 없습니다.".to_string())?;
    let lowered = host.trim_end_matches('.').to_ascii_lowercase();
    if lowered == "localhost" || lowered.ends_with(".localhost") {
        return Err("로컬 주소는 조회할 수 없습니다.".into());
    }
    if let Ok(ip) = lowered.parse::<IpAddr>() {
        let blocked = match ip {
            IpAddr::V4(v4) => {
                v4.is_private()
                    || v4.is_loopback()
                    || v4.is_link_local()
                    || v4.is_unspecified()
                    || v4.is_multicast()
                    || v4.octets()[0] == 0
            }
            IpAddr::V6(v6) => {
                v6.is_loopback()
                    || v6.is_unspecified()
                    || v6.is_unique_local()
                    || v6.is_unicast_link_local()
                    || v6.is_multicast()
            }
        };
        if blocked {
            return Err("로컬 또는 사설 주소는 조회할 수 없습니다.".into());
        }
    }
    Ok(url)
}

fn normalize_title(raw: &str) -> Option<String> {
    let decoded = html_escape::decode_html_entities(raw);
    let normalized = decoded.split_whitespace().collect::<Vec<_>>().join(" ");
    (!normalized.is_empty()).then_some(normalized)
}

/// Open Graph / Twitter / HTML title 순으로 페이지 제목을 고릅니다.
/// 많은 사이트가 `<title>`보다 `og:title`에 실제 글·영상 제목을 둡니다.
pub fn extract_title(html: &str) -> Option<String> {
    let meta_patterns = [
        r#"(?is)<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']"#,
        r#"(?is)<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']"#,
        r#"(?is)<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']"#,
        r#"(?is)<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:title["']"#,
    ];
    for pattern in meta_patterns {
        if let Ok(re) = Regex::new(pattern) {
            if let Some(caps) = re.captures(html) {
                if let Some(title) = caps.get(1).and_then(|m| normalize_title(m.as_str())) {
                    return Some(title);
                }
            }
        }
    }

    let title_pattern = Regex::new(r"(?is)<title(?:\s[^>]*)?>(.*?)</title>").ok()?;
    let raw = title_pattern.captures(html)?.get(1)?.as_str();
    normalize_title(raw)
}

/// YouTube 등은 HTML이 커서 oEmbed JSON으로 제목을 먼저 시도합니다.
fn fetch_oembed_title(client: &Client, page_url: &Url) -> Option<String> {
    let host = page_url.host_str()?.trim_end_matches('.').to_ascii_lowercase();
    let is_youtube = host == "youtu.be"
        || host == "youtube.com"
        || host.ends_with(".youtube.com")
        || host == "youtube-nocookie.com"
        || host.ends_with(".youtube-nocookie.com");
    if !is_youtube {
        return None;
    }

    let oembed = format!(
        "https://www.youtube.com/oembed?url={}&format=json",
        urlencoding_encode(page_url.as_str())
    );
    let response = client
        .get(&oembed)
        .header(
            USER_AGENT,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        )
        .send()
        .ok()?
        .error_for_status()
        .ok()?;
    let body = response.text().ok()?;
    // serde_json이 \uXXXX 유니코드 이스케이프를 실제 글자로 디코딩합니다.
    #[derive(serde::Deserialize)]
    struct OEmbed {
        title: String,
    }
    let parsed: OEmbed = serde_json::from_str(&body).ok()?;
    normalize_title(&parsed.title)
}

fn urlencoding_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for b in value.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

pub fn fetch(value: &str) -> Result<LinkMetadata, String> {
    let url = validate_public_http_url(value)?;
    let domain = url
        .host_str()
        .ok_or_else(|| "링크에 호스트가 없습니다.".to_string())?
        .trim_end_matches('.')
        .to_string();

    let client = Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(10))
        .redirect(Policy::custom(|attempt| {
            if attempt.previous().len() >= 3
                || validate_public_http_url(attempt.url().as_str()).is_err()
            {
                attempt.stop()
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|e| format!("링크 조회 준비 실패: {e}"))?;

    if let Some(title) = fetch_oembed_title(&client, &url) {
        return Ok(LinkMetadata {
            url: url.to_string(),
            title,
            domain,
        });
    }

    // 봇 UA는 제목 없는 차단/동의 페이지만 주는 사이트가 많아 일반 브라우저로 위장합니다.
    let response = client
        .get(url.clone())
        .header(
            USER_AGENT,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        )
        .header("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7")
        .send()
        .map_err(|e| format!("링크 조회 실패: {e}"))?
        .error_for_status()
        .map_err(|e| format!("링크 응답 오류: {e}"))?;

    if let Some(content_type) = response.headers().get(CONTENT_TYPE) {
        let content_type = content_type.to_str().unwrap_or_default();
        if !content_type.contains("text/html") && !content_type.contains("application/xhtml+xml") {
            return Err("HTML 페이지가 아닌 링크입니다.".into());
        }
    }

    let final_url = response.url().clone();
    let mut bytes = Vec::new();
    response
        .take(MAX_HTML_BYTES)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("페이지 읽기 실패: {e}"))?;

    // 큰 페이지는 앞부분만 받아도 head의 og:title / <title>로 충분한 경우가 많습니다.
    let html = String::from_utf8_lossy(&bytes);
    let title = extract_title(&html).unwrap_or_else(|| domain.clone());
    Ok(LinkMetadata {
        url: final_url.to_string(),
        title,
        domain,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_title_and_decodes_entities() {
        assert_eq!(
            extract_title("<html><head><title>Memo &amp; Notes</title></head></html>"),
            Some("Memo & Notes".into())
        );
    }

    #[test]
    fn prefers_og_title_over_html_title() {
        let html = r#"
            <html><head>
              <title>Site Name</title>
              <meta property="og:title" content="실제 글 제목 &amp; 부제" />
            </head></html>
        "#;
        assert_eq!(extract_title(html), Some("실제 글 제목 & 부제".into()));
    }

    #[test]
    fn rejects_local_and_unsupported_urls() {
        assert!(validate_public_http_url("file:///tmp/a").is_err());
        assert!(validate_public_http_url("http://localhost/a").is_err());
        assert!(validate_public_http_url("http://127.0.0.1/a").is_err());
    }

    #[test]
    fn fetches_public_page_title() {
        let meta = fetch("https://example.com").expect("example.com 조회");
        assert_eq!(meta.domain, "example.com");
        assert!(!meta.title.is_empty());
        assert!(meta.title.to_ascii_lowercase().contains("example"));
    }

    #[test]
    fn extracts_og_title_from_truncated_youtube_like_html() {
        // 큰 페이지의 앞부분만 받아도 og:title이 있으면 충분합니다.
        let mut html = String::from(
            r#"<html><head><meta property="og:title" content="테스트 영상 제목" />"#,
        );
        html.push_str(&"x".repeat(600_000));
        assert_eq!(extract_title(&html), Some("테스트 영상 제목".into()));
    }

    #[test]
    fn decodes_oembed_unicode_escapes_via_json() {
        let body = r#"{"title":"[\uc5d0\uc774\ud305] \uc624\ub298\ub9c8\uc740","author_name":"x"}"#;
        #[derive(serde::Deserialize)]
        struct OEmbed {
            title: String,
        }
        let parsed: OEmbed = serde_json::from_str(body).unwrap();
        assert!(!parsed.title.contains("\\u"));
        assert!(parsed.title.contains("에이팅"));
        assert!(parsed.title.contains("오늘마은"));
    }

    #[test]
    fn fetches_youtube_title_from_partial_page() {
        let meta = fetch("https://www.youtube.com/watch?v=dQw4w9WgXcQ").expect("youtube 조회");
        assert!(meta.domain.contains("youtube.com"));
        assert_ne!(meta.title, meta.domain);
        assert!(!meta.title.eq_ignore_ascii_case("youtube"));
        assert!(!meta.title.contains("\\u"));
        assert!(meta.title.to_ascii_lowercase().contains("rick"));
    }
}
