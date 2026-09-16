mod capture;
mod link_metadata;
mod store;
mod update;

use std::sync::Mutex;

use base64::Engine;
use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WebviewWindow, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

struct AppStore(Mutex<store::AppState>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PastePayload {
    kind: String,
    timestamp: bool,
    content_kind: Option<String>,
    text: Option<String>,
    image_base64: Option<String>,
    error: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppStateChangedPayload {
    source_window_label: String,
    state: store::AppState,
}

#[tauri::command]
fn load_app_state(
    window: WebviewWindow,
    state: State<'_, AppStore>,
) -> Result<store::AppState, String> {
    log::info!("app state requested by window={}", window.label());
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
fn save_app_state(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppStore>,
    data: store::AppState,
) -> Result<(), String> {
    store::save_state(&data)?;
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = data.clone();
    drop(guard);
    let _ = app.emit(
        "app-state-changed",
        AppStateChangedPayload {
            source_window_label: window.label().to_string(),
            state: data,
        },
    );
    Ok(())
}

#[tauri::command]
fn save_tab_state(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppStore>,
    tab: store::Tab,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let Some(index) = guard.tabs.iter().position(|item| item.id == tab.id) else {
        return Err("저장할 메모 탭을 찾을 수 없습니다.".into());
    };
    let mut next = guard.clone();
    next.tabs[index] = tab;
    store::save_state(&next)?;
    *guard = next.clone();
    drop(guard);
    let _ = app.emit(
        "app-state-changed",
        AppStateChangedPayload {
            source_window_label: window.label().to_string(),
            state: next,
        },
    );
    Ok(())
}

#[tauri::command]
fn set_always_on_top(window: WebviewWindow, enabled: bool) -> Result<(), String> {
    window
        .set_always_on_top(enabled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn detached_window_smoke_test() -> bool {
    std::env::args().any(|arg| arg == "--smoke-test-detached-window")
}

#[tauri::command]
fn log_detached_window_stage(stage: String, label: String, detail: Option<String>) {
    match detail {
        Some(detail) => log::info!("detached memo frontend: stage={stage} label={label} detail={detail}"),
        None => log::info!("detached memo frontend: stage={stage} label={label}"),
    }
}

#[tauri::command]
fn set_window_opacity(_app: AppHandle, _opacity: f64) -> Result<(), String> {
    // Tauri 2 Windows에는 window opacity API가 없어 UI(CSS)에서 처리합니다.
    Ok(())
}

#[tauri::command]
fn save_image_bytes(base64_data: String, ext: String) -> Result<serde_json::Value, String> {
    let cleaned = base64_data
        .split(',')
        .last()
        .unwrap_or(&base64_data)
        .trim();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(cleaned)
        .map_err(|e| e.to_string())?;
    let path = store::save_attachment(&bytes, &ext)?;
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/png",
    };
    let data_url = format!(
        "data:{};base64,{}",
        mime,
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    );
    Ok(serde_json::json!({ "path": path, "dataUrl": data_url }))
}

#[tauri::command]
async fn fetch_link_metadata(url: String) -> Result<link_metadata::LinkMetadata, String> {
    tauri::async_runtime::spawn_blocking(move || link_metadata::fetch(&url))
        .await
        .map_err(|e| format!("링크 조회 작업 실패: {e}"))?
}

#[tauri::command]
fn show_main_window(app: AppHandle) -> Result<(), String> {
    activate_main_window(&app)
}

fn activate_main_window(app: &AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        // --hidden 자동 시작 뒤 창을 열 때 Windows 작업표시줄 버튼도 확실히 복구합니다.
        win.set_skip_taskbar(false).map_err(|e| e.to_string())?;
        win.show().map_err(|e| e.to_string())?;
        win.unminimize().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn check_app_update() -> Result<update::UpdateInfo, String> {
    tauri::async_runtime::spawn_blocking(update::check)
        .await
        .map_err(|e| format!("업데이트 확인 작업 실패: {e}"))?
}

#[tauri::command]
async fn install_app_update(app: AppHandle, url: String) -> Result<(), String> {
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || update::download_and_run_installer(&handle, &url))
        .await
        .map_err(|e| format!("업데이트 설치 작업 실패: {e}"))??;
    app.exit(0);
    Ok(())
}

fn capture_timestamp(app: &AppHandle) -> bool {
    app.try_state::<AppStore>()
        .and_then(|s| s.0.lock().ok().map(|g| g.settings.capture_timestamp))
        .unwrap_or(true)
}

fn emit_paste_from_menu(app: &AppHandle) {
    let stamp = capture_timestamp(app);
    let payload = match capture::read_clipboard_prefer_text() {
        Ok(c) => PastePayload {
            kind: "clipboard".into(),
            timestamp: stamp,
            content_kind: Some(c.kind),
            text: c.text,
            image_base64: c.image_base64,
            error: None,
        },
        Err(e) => PastePayload {
            kind: "clipboard".into(),
            timestamp: stamp,
            content_kind: None,
            text: None,
            image_base64: None,
            error: Some(e),
        },
    };
    let _ = app.emit("memo-paste-request", payload);
    let _ = activate_main_window(app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial = store::load_state().unwrap_or_default();
    let start_hidden = std::env::args().any(|arg| arg == "--hidden");

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .max_file_size(1_000_000)
                .build(),
        )
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            let _ = activate_main_window(app);
        }))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .manage(AppStore(Mutex::new(initial.clone())))
        .invoke_handler(tauri::generate_handler![
            load_app_state,
            save_app_state,
            save_tab_state,
            set_always_on_top,
            set_window_opacity,
            save_image_bytes,
            fetch_link_metadata,
            show_main_window,
            detached_window_smoke_test,
            log_detached_window_stage,
            check_app_update,
            install_app_update,
        ])
        .setup(move |app| {
            // 개발 실행이 시작프로그램에 남으면 재부팅 때 콘솔이 뜹니다.
            // 설치된 앱만 자동 실행하고, 개발 빌드는 등록을 지웁니다.
            let autostart = app.autolaunch();
            if cfg!(debug_assertions) {
                let _ = autostart.disable();
            } else if initial.settings.autostart {
                let _ = autostart.enable();
            }

            if let Some(win) = app.get_webview_window("main") {
                let w = &initial.window;
                let _ = win.set_size(tauri::LogicalSize::new(w.width, w.height));
                if let (Some(x), Some(y)) = (w.x, w.y) {
                    let _ = win.set_position(tauri::LogicalPosition::new(x as f64, y as f64));
                }
                let _ = win.set_always_on_top(initial.settings.always_on_top);
                if let Some(icon) = app.default_window_icon() {
                    let _ = win.set_icon(icon.clone());
                }
                if start_hidden {
                    let _ = win.hide();
                } else {
                    let _ = win.set_skip_taskbar(false);
                }
            }

            let paste_i =
                MenuItem::with_id(app, "paste", "메모에 붙여넣기", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "열기", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&paste_i, &show_i, &quit_i])?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("찰메모")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "paste" => emit_paste_from_menu(app),
                    "show" => {
                        let _ = activate_main_window(app);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        let _ = activate_main_window(app);
                    }
                })
                .build(app)?;

            log::info!("safe compatibility mode: no startup network or global shortcut");

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
