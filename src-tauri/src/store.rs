use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    pub version: u32,
    pub active_tab_id: String,
    pub tabs: Vec<Tab>,
    pub settings: Settings,
    pub window: WindowState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tab {
    pub id: String,
    pub title: String,
    pub content: Value,
    pub order: u32,
    /// 스크롤해도 위에 남는 문단의 1부터 시작하는 번호. 0이면 고정 없음
    #[serde(default, rename = "stickyBlockIndex", alias = "stickyBlockCount")]
    pub sticky_block_index: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub always_on_top: bool,
    pub opacity: f64,
    pub paper_color: String,
    pub font_size: u32,
    pub shortcut: String,
    pub capture_timestamp: bool,
    pub autostart: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub width: f64,
    pub height: f64,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            always_on_top: true,
            opacity: 1.0,
            paper_color: "yellow".into(),
            font_size: 14,
            shortcut: "Ctrl+Alt+M".into(),
            capture_timestamp: false,
            autostart: true,
        }
    }
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            x: None,
            y: None,
            width: 380.0,
            height: 520.0,
        }
    }
}

fn empty_doc() -> Value {
    serde_json::json!({
        "type": "doc",
        "content": [{ "type": "paragraph" }]
    })
}

impl Default for AppState {
    fn default() -> Self {
        let id = uuid::Uuid::new_v4().to_string();
        Self {
            version: 3,
            active_tab_id: id.clone(),
            tabs: vec![Tab {
                id,
                title: "메모 1".into(),
                content: empty_doc(),
                order: 0,
                sticky_block_index: 0,
            }],
            settings: Settings::default(),
            window: WindowState::default(),
        }
    }
}

pub fn data_dir() -> Result<PathBuf, String> {
    let base = dirs::data_dir().ok_or("AppData 경로를 찾을 수 없습니다")?;
    let dir = base.join("찰메모");
    // 예전 Memo 폴더가 있으면 한 번만 이전합니다.
    let legacy = base.join("Memo");
    if !dir.exists() && legacy.exists() {
        fs::rename(&legacy, &dir).map_err(|e| format!("데이터 폴더 이전 실패: {e}"))?;
    }
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(dir.join("attachments")).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn state_path() -> Result<PathBuf, String> {
    Ok(data_dir()?.join("notes.json"))
}

pub fn load_state() -> Result<AppState, String> {
    let path = state_path()?;
    if !path.exists() {
        let state = AppState::default();
        save_state(&state)?;
        return Ok(state);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut state: AppState = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    if migrate_state(&mut state) {
        save_state(&state)?;
    }
    Ok(state)
}

fn migrate_state(state: &mut AppState) -> bool {
    let mut changed = false;
    if state.version < 2 {
        state.settings.autostart = true;
        changed = true;
    }
    if state.version < 3 {
        // 0.1.13까지는 첫 문단부터 N개를 고정해 화면을 덮을 수 있었습니다.
        // 새 단일 문단 방식과 의미가 다르므로 기존 잘못된 범위는 안전하게 해제합니다.
        for tab in &mut state.tabs {
            tab.sticky_block_index = 0;
        }
        changed = true;
    }
    if changed {
        state.version = 3;
    }
    changed
}

pub fn save_state(state: &AppState) -> Result<(), String> {
    let path = state_path()?;
    let raw = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}

pub fn save_attachment(bytes: &[u8], ext: &str) -> Result<String, String> {
    let dir = data_dir()?.join("attachments");
    let name = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    let path = dir.join(&name);
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_one_state_migrates_to_autostart_enabled() {
        let mut old = AppState::default();
        old.version = 1;
        old.settings.autostart = false;

        assert!(migrate_state(&mut old));
        assert_eq!(old.version, 3);
        assert!(old.settings.autostart);
    }

    #[test]
    fn legacy_multi_block_sticky_state_is_cleared() {
        let mut old = AppState::default();
        old.version = 2;
        old.tabs[0].sticky_block_index = 9;

        assert!(migrate_state(&mut old));
        assert_eq!(old.version, 3);
        assert_eq!(old.tabs[0].sticky_block_index, 0);
    }
}
