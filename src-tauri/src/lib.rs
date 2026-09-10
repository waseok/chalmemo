mod capture;
mod link_metadata;
mod store;
mod update;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use base64::Engine;
use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

struct AppStore(Mutex<store::AppState>);

/// 전역 단축키 연타/중복 콜백 방지
static HOTKEY_BUSY: AtomicBool = AtomicBool::new(false);
static LAST_HOTKEY: Mutex<Option<Instant>> = Mutex::new(None);

fn should_handle_hotkey(state: ShortcutState) -> bool {
    // M 키가 올라온 시점에 작업 예약. 실제 캡처는 모든 보조키가 올라올 때까지 기다립니다.
    matches!(state, ShortcutState::Released)
}

fn dispatch_background<F>(task: F)
where
    F: FnOnce() + Send + 'static,
{
    std::thread::spawn(task);
}

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

#[tauri::command]
fn load_app_state(state: State<'_, AppStore>) -> Result<store::AppState, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
fn save_app_state(state: State<'_, AppStore>, data: store::AppState) -> Result<(), String> {
    store::save_state(&data)?;
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = data;
    Ok(())
}

#[tauri::command]
fn set_always_on_top(app: AppHandle, enabled: bool) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.set_always_on_top(enabled)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
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
        win.show().map_err(|e| e.to_string())?;
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

#[tauri::command]
fn register_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    let _ = app.global_shortcut().unregister_all();
    let parsed: Shortcut = shortcut
        .parse()
        .map_err(|e| format!("단축키 파싱 실패: {e}"))?;
    app.global_shortcut()
        .on_shortcut(parsed, move |app, _shortcut, event| {
            if should_handle_hotkey(event.state) {
                schedule_hotkey_capture(app.clone());
            }
        })
        .map_err(|e| e.to_string())?;
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
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
    }
}

fn schedule_hotkey_capture(app: AppHandle) {
    // 이벤트 콜백에서는 중복 검사와 작업 예약만 수행합니다.
    // 클립보드 대기는 별도 스레드에서 처리해 UI 이벤트 루프를 막지 않습니다.
    if HOTKEY_BUSY.swap(true, Ordering::SeqCst) {
        return;
    }
    {
        let mut last = LAST_HOTKEY.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(t) = *last {
            if t.elapsed() < Duration::from_millis(450) {
                HOTKEY_BUSY.store(false, Ordering::SeqCst);
                return;
            }
        }
        *last = Some(Instant::now());
    }

    dispatch_background(move || {
        emit_hotkey_capture(&app);
        HOTKEY_BUSY.store(false, Ordering::SeqCst);
    });
}

fn emit_hotkey_capture(app: &AppHandle) {
    log::info!("global shortcut callback: capture started");
    let stamp = capture_timestamp(app);
    let payload = match capture::capture_selection() {
        Ok(c) => {
            log::info!("global shortcut capture succeeded: kind={}", c.kind);
            PastePayload {
                kind: "hotkey".into(),
                timestamp: stamp,
                content_kind: Some(c.kind),
                text: c.text,
                image_base64: c.image_base64,
                error: None,
            }
        }
        Err(e) => {
            log::error!("global shortcut capture failed: {e}");
            PastePayload {
                kind: "hotkey".into(),
                timestamp: stamp,
                content_kind: None,
                text: None,
                image_base64: None,
                error: Some(e),
            }
        }
    };
    match app.emit("memo-paste-request", payload) {
        Ok(()) => log::info!("global shortcut payload emitted"),
        Err(e) => log::error!("global shortcut payload emit failed: {e}"),
    }
    if let Err(e) = activate_main_window(app) {
        log::error!("failed to activate main window after capture: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn global_shortcut_runs_after_modifiers_are_released() {
        assert!(!should_handle_hotkey(ShortcutState::Pressed));
        assert!(should_handle_hotkey(ShortcutState::Released));
    }

    #[test]
    fn capture_work_is_dispatched_without_blocking_shortcut_callback() {
        let (tx, rx) = std::sync::mpsc::channel();
        let started = Instant::now();

        dispatch_background(move || {
            std::thread::sleep(Duration::from_millis(250));
            tx.send(()).unwrap();
        });

        assert!(
            started.elapsed() < Duration::from_millis(50),
            "단축키 콜백이 캡처 작업을 기다리면 UI가 멈춥니다"
        );
        assert!(rx.recv_timeout(Duration::from_secs(1)).is_ok());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial = store::load_state().unwrap_or_default();
    let initial_shortcut = initial.settings.shortcut.clone();
    let start_hidden = std::env::args().any(|arg| arg == "--hidden");

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .max_file_size(1_000_000)
                .build(),
        )
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
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
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(AppStore(Mutex::new(initial.clone())))
        .invoke_handler(tauri::generate_handler![
            load_app_state,
            save_app_state,
            set_always_on_top,
            set_window_opacity,
            save_image_bytes,
            fetch_link_metadata,
            show_main_window,
            register_shortcut,
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
                if start_hidden {
                    let _ = win.hide();
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
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
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
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                })
                .build(app)?;

            // 설정에 저장된 전역 단축키 등록
            let parsed: Result<Shortcut, _> = initial_shortcut.parse();
            if let Ok(shortcut) = parsed {
                let handle = app.handle().clone();
                match app.global_shortcut().on_shortcut(shortcut, move |_app, _, event| {
                    log::info!("global shortcut event: state={:?}", event.state);
                    if should_handle_hotkey(event.state) {
                        schedule_hotkey_capture(handle.clone());
                    }
                }) {
                    Ok(()) => log::info!("global shortcut registered: {initial_shortcut}"),
                    Err(e) => log::error!(
                        "global shortcut registration failed ({initial_shortcut}): {e}"
                    ),
                }
            } else {
                log::error!("global shortcut parse failed: {initial_shortcut}");
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
