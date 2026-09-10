use std::error::Error as _;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

use reqwest::blocking::Client;
use reqwest::header::USER_AGENT;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use url::Url;

const GITHUB_LATEST: &str = "https://api.github.com/repos/waseok/chalmemo/releases/latest";
const RAW_UPDATER_ROOT: &str =
    "https://raw.githubusercontent.com/waseok/chalmemo/updater";
const UA: &str = "chalmemo-updater";

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

/// GitHub 자산 다운로드가 HTTP/2에서 멈추는 경우가 있어 HTTP/1.1만 씁니다.
fn http_client(timeout_secs: u64) -> Result<Client, String> {
    Client::builder()
        .user_agent(UA)
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(timeout_secs))
        .http1_only()
        .tcp_nodelay(true)
        .pool_max_idle_per_host(0)
        .build()
        .map_err(|e| format!("업데이트 확인 준비 실패: {e}"))
}

fn mirror_download_url(version: &str) -> String {
    format!(
        "{RAW_UPDATER_ROOT}/chalmemo_{}_x64-setup.exe",
        normalize_version(version)
    )
}

fn request_error(context: &str, error: reqwest::Error) -> String {
    let mut message = format!("{context}: {error}");
    let mut source = error.source();
    while let Some(cause) = source {
        message.push_str(&format!(" → {cause}"));
        source = cause.source();
    }
    message
}

pub fn check() -> Result<UpdateInfo, String> {
    let current = normalize_version(env!("CARGO_PKG_VERSION"));
    let client = http_client(30)?;
    let release: GithubRelease = client
        .get(GITHUB_LATEST)
        .header(USER_AGENT, UA)
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(|e| request_error("업데이트 확인 실패", e))?
        .error_for_status()
        .map_err(|e| format!("업데이트 응답 오류: {e}"))?
        .json()
        .map_err(|e| format!("업데이트 정보 파싱 실패: {e}"))?;

    let latest = normalize_version(&release.tag_name);
    // 한글 productName 설치 파일보다 ASCII(chalmemo_*)를 우선합니다.
    let has_windows_installer = release
        .assets
        .iter()
        .find(|a| {
            let name = a.name.to_ascii_lowercase();
            name.starts_with("chalmemo") && name.ends_with("setup.exe")
        })
        .or_else(|| {
            release
                .assets
                .iter()
                .find(|a| a.name.to_ascii_lowercase().ends_with("setup.exe"))
        })
        .is_some();

    // 학교·기관 네트워크에서 GitHub release-assets CDN 연결이 끊기는 경우가 있습니다.
    // 릴리스 워크플로가 같은 설치 파일을 raw.githubusercontent.com에도 게시합니다.
    let download_url = has_windows_installer.then(|| mirror_download_url(&latest));

    Ok(UpdateInfo {
        available: version_newer(&latest, &current) && download_url.is_some(),
        current_version: current,
        latest_version: latest,
        notes: release.body.unwrap_or_default(),
        download_url,
    })
}

fn looks_like_exe(header: &[u8]) -> bool {
    header.len() >= 2 && header[0] == b'M' && header[1] == b'Z'
}

fn installer_path() -> PathBuf {
    std::env::temp_dir().join("chalmemo-setup.exe")
}

fn validate_download_url(value: &str) -> Result<(), String> {
    let url = Url::parse(value).map_err(|e| format!("설치 파일 주소 오류: {e}"))?;
    let path = url.path().to_ascii_lowercase();
    let trusted_release = url.host_str() == Some("github.com")
        && path.starts_with("/waseok/chalmemo/releases/download/");
    let trusted_mirror = url.host_str() == Some("raw.githubusercontent.com")
        && path.starts_with("/waseok/chalmemo/updater/chalmemo_");
    let trusted = url.scheme() == "https"
        && (trusted_release || trusted_mirror)
        && path.ends_with("_x64-setup.exe");
    if trusted {
        Ok(())
    } else {
        Err("신뢰할 수 없는 설치 파일 주소입니다.".into())
    }
}

fn validate_installer(path: &Path) -> Result<(), String> {
    let mut file = File::open(path).map_err(|e| format!("설치 파일 열기 실패: {e}"))?;
    let mut first = [0u8; 2];
    let n = file
        .read(&mut first)
        .map_err(|e| format!("설치 파일 읽기 실패: {e}"))?;
    if n == 0 {
        return Err("설치 파일이 비어 있습니다.".into());
    }
    if !looks_like_exe(&first[..n]) {
        return Err("설치 파일이 실행 파일이 아닙니다. 브라우저에서 받아 주세요.".into());
    }
    Ok(())
}

fn download_installer_with_reqwest(url: &str, path: &Path) -> Result<(), String> {
    let client = http_client(180)?;
    let mut response = client
        .get(url)
        .header(USER_AGENT, UA)
        .header("Accept", "application/octet-stream")
        .header("Accept-Encoding", "identity")
        .send()
        .map_err(|e| request_error("설치 파일 받기 실패", e))?
        .error_for_status()
        .map_err(|e| format!("설치 파일 응답 오류: {e}"))?;

    let mut file = File::create(path).map_err(|e| format!("설치 파일 저장 실패: {e}"))?;
    let mut first = [0u8; 2];
    let n = response
        .read(&mut first)
        .map_err(|e| format!("설치 파일 읽기 실패: {e}"))?;
    if n == 0 {
        return Err("설치 파일이 비어 있습니다.".into());
    }
    if !looks_like_exe(&first[..n]) {
        return Err("설치 파일이 실행 파일이 아닙니다. 브라우저에서 받아 주세요.".into());
    }
    file.write_all(&first[..n])
        .map_err(|e| format!("설치 파일 저장 실패: {e}"))?;

    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = response
            .read(&mut buf)
            .map_err(|e| format!("설치 파일 읽기 실패: {e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n])
            .map_err(|e| format!("설치 파일 저장 실패: {e}"))?;
    }
    file.flush()
        .map_err(|e| format!("설치 파일 저장 실패: {e}"))?;
    Ok(())
}

#[cfg(windows)]
fn download_installer_with_windows(url: &str, path: &Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const DOWNLOAD_SCRIPT: &str = r#"& { $ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new(); [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; for($attempt=1; $attempt -le 3; $attempt++){ try { Invoke-WebRequest -UseBasicParsing -Headers @{'User-Agent'='chalmemo-updater'; 'Accept-Encoding'='identity'} -Uri $args[0] -OutFile $args[1] -TimeoutSec 60; exit 0 } catch { if(Test-Path -LiteralPath $args[1]){ Remove-Item -LiteralPath $args[1] -Force -ErrorAction SilentlyContinue }; if($attempt -eq 3){ [Console]::Error.WriteLine(('{0}: {1}' -f $_.Exception.GetType().FullName, $_.Exception.Message)); exit 1 }; Start-Sleep -Seconds (2 * $attempt) } } }"#;

    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("이전 설치 파일 정리 실패: {e}"))?;
    }

    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", DOWNLOAD_SCRIPT])
        .arg(url)
        .arg(path)
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("Windows 다운로드 실행 실패: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = stderr.trim();
        return Err(if detail.is_empty() {
            format!("Windows 다운로드 실패: 종료 코드 {:?}", output.status.code())
        } else {
            format!("Windows 다운로드 실패: {detail}")
        });
    }

    validate_installer(path)
}

fn download_installer(url: &str, path: &Path) -> Result<(), String> {
    log::info!("updater: installer download started");

    #[cfg(windows)]
    {
        match download_installer_with_windows(url, path) {
            Ok(()) => {
                log::info!("updater: installer downloaded through Windows network stack");
                return Ok(());
            }
            Err(windows_error) => {
                log::warn!("updater: Windows download failed, trying reqwest: {windows_error}");
                return download_installer_with_reqwest(url, path).map_err(|fallback_error| {
                    format!("{windows_error} / 대체 다운로드 실패: {fallback_error}")
                });
            }
        }
    }

    #[cfg(not(windows))]
    download_installer_with_reqwest(url, path)
}

fn run_installer(path: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        // cmd /C start "" "경로" 는 Windows에서 따옴표가 깨져 '\\'만 실행하려다 실패합니다.
        // 설치 파일을 새 프로세스 그룹으로 직접 띄웁니다.
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;

        Command::new(path)
            .creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("설치 프로그램 실행 실패: {e}"))?;
        return Ok(());
    }
    #[cfg(not(windows))]
    {
        Command::new(path)
            .spawn()
            .map_err(|e| format!("설치 프로그램 실행 실패: {e}"))?;
        Ok(())
    }
}

pub fn download_and_run_installer(app: &AppHandle, url: &str) -> Result<(), String> {
    validate_download_url(url)?;
    let path = installer_path();
    if let Err(error) = download_installer(url, &path) {
        log::error!("updater: installer download failed: {error}");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            if Command::new("explorer.exe")
                .arg(url)
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .is_ok()
            {
                return Err(format!(
                    "{error}\n\n자동 다운로드가 되지 않아 브라우저 다운로드를 열었습니다. 받은 설치 파일을 실행해 주세요."
                ));
            }
        }
        return Err(error);
    }

    // 항상 위 창이 SmartScreen/설치 창을 가리지 않게 먼저 내립니다.
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_always_on_top(false);
        let _ = win.hide();
    }

    if let Err(error) = run_installer(&path) {
        log::error!("updater: installer launch failed: {error}");
        return Err(error);
    }
    log::info!("updater: installer launched");
    thread::sleep(Duration::from_millis(800));
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

    #[test]
    fn exe_magic_is_mz() {
        assert!(looks_like_exe(b"MZ"));
        assert!(!looks_like_exe(b"<html>"));
        assert!(!looks_like_exe(b""));
    }

    #[test]
    fn accepts_only_project_release_installers() {
        assert!(validate_download_url(
            "https://github.com/waseok/chalmemo/releases/download/v0.1.8/chalmemo_0.1.8_x64-setup.exe"
        )
        .is_ok());
        assert!(validate_download_url("https://example.com/setup.exe").is_err());
        assert!(validate_download_url(
            "http://github.com/waseok/chalmemo/releases/download/v0.1.8/setup.exe"
        )
        .is_err());
        assert!(validate_download_url(
            "https://raw.githubusercontent.com/waseok/chalmemo/updater/chalmemo_0.1.10_x64-setup.exe"
        )
        .is_ok());
        assert!(validate_download_url(
            "https://raw.githubusercontent.com/other/project/updater/chalmemo_0.1.10_x64-setup.exe"
        )
        .is_err());
    }
}
