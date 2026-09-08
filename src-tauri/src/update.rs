use std::fs;
use std::process::Command;
use std::time::Duration;

use reqwest::blocking::Client;
use reqwest::header::USER_AGENT;
use serde::{Deserialize, Serialize};

const GITHUB_LATEST: &str = "https://api.github.com/repos/waseok/chalmemo/releases/latest";
const UA: &str = "찰메모-updater";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub available: bool,
    pub current_version: String,
    pub latest_version: String,
    pub notes: String,
    pub download_url: Option<String>,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    body: Option<String>,
    assets: Vec<GithubAsset>,
}

#[derive(Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

fn normalize_version(value: &str) -> String {
    value.trim().trim_start_matches('v').trim().to_string()
}

fn version_newer(latest: &str, current: &str) -> bool {
    let parse = |v: &str| {
        normalize_version(v)
            .split('.')
            .filter_map(|p| p.parse::<u64>().ok())
            .collect::<Vec<_>>()
    };
    let a = parse(latest);
    let b = parse(current);
    let len = a.len().max(b.len());
    for i in 0..len {
        let left = a.get(i).copied().unwrap_or(0);
        let right = b.get(i).copied().unwrap_or(0);
        if left != right {
            return left > right;
        }
    }
    false
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| format!("업데이트 확인 준비 실패: {e}"))
}

pub fn check() -> Result<UpdateInfo, String> {
    let current = normalize_version(env!("CARGO_PKG_VERSION"));
    let client = http_client()?;
    let release: GithubRelease = client
        .get(GITHUB_LATEST)
        .header(USER_AGENT, UA)
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(|e| format!("업데이트 확인 실패: {e}"))?
        .error_for_status()
        .map_err(|e| format!("업데이트 응답 오류: {e}"))?
        .json()
        .map_err(|e| format!("업데이트 정보 파싱 실패: {e}"))?;

    let latest = normalize_version(&release.tag_name);
    let download_url = release
        .assets
        .iter()
        .find(|a| a.name.to_ascii_lowercase().ends_with("setup.exe"))
        .map(|a| a.browser_download_url.clone());

    Ok(UpdateInfo {
        available: version_newer(&latest, &current) && download_url.is_some(),
        current_version: current,
        latest_version: latest,
        notes: release.body.unwrap_or_default(),
        download_url,
    })
}

pub fn download_and_run_installer(url: &str) -> Result<(), String> {
    let client = http_client()?;
    let bytes = client
        .get(url)
        .header(USER_AGENT, UA)
        .send()
        .map_err(|e| format!("설치 파일 받기 실패: {e}"))?
        .error_for_status()
        .map_err(|e| format!("설치 파일 응답 오류: {e}"))?
        .bytes()
        .map_err(|e| format!("설치 파일 읽기 실패: {e}"))?;

    let path = std::env::temp_dir().join("chalmemo-setup.exe");
    fs::write(&path, &bytes).map_err(|e| format!("설치 파일 저장 실패: {e}"))?;

    Command::new(&path)
        .spawn()
        .map_err(|e| format!("설치 프로그램 실행 실패: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_newer_semver() {
        assert!(version_newer("0.2.0", "0.1.0"));
        assert!(version_newer("0.1.2", "0.1.1"));
        assert!(!version_newer("0.1.0", "0.1.0"));
        assert!(!version_newer("0.1.0", "0.2.0"));
        assert!(version_newer("v1.0.0", "0.9.9"));
    }
}
