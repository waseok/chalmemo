use std::thread;
use std::time::Duration;

use serde::Serialize;

#[cfg(windows)]
use windows::Win32::System::DataExchange::GetClipboardSequenceNumber;
#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBD_EVENT_FLAGS,
    KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturedContent {
    pub kind: String,
    pub text: Option<String>,
    pub image_base64: Option<String>,
}

fn rgba_to_png(rgba: &[u8], width: usize, height: usize) -> Option<Vec<u8>> {
    let mut buf = Vec::new();
    let mut encoder = png::Encoder::new(&mut buf, width as u32, height as u32);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().ok()?;
    writer.write_image_data(rgba).ok()?;
    drop(writer);
    Some(buf)
}

/// 전경 앱에서 현재 선택 영역을 Ctrl+C로 복사해 가져옵니다.
/// 기존 클립보드를 미리 지우지 않고 Windows 변경 번호로 복사 성공을 확인합니다.
#[cfg(windows)]
pub fn capture_selection() -> Result<CapturedContent, String> {
    wait_for_modifiers_release()?;
    let before = unsafe { GetClipboardSequenceNumber() };
    simulate_ctrl_c()?;

    for _ in 0..20 {
        thread::sleep(Duration::from_millis(50));
        let current = unsafe { GetClipboardSequenceNumber() };
        if current != 0 && current != before {
            if let Ok(content) = read_clipboard_prefer_text() {
                return Ok(content);
            }
        }
    }

    Err("선택 내용을 복사하지 못했습니다. 내용을 선택한 뒤 다시 시도하세요.".into())
}

#[cfg(not(windows))]
pub fn capture_selection() -> Result<CapturedContent, String> {
    Err("Windows에서만 지원됩니다".into())
}

#[cfg(windows)]
fn wait_for_modifiers_release() -> Result<(), String> {
    let modifiers = [VK_CONTROL, VK_MENU, VK_SHIFT, VK_LWIN, VK_RWIN];
    for _ in 0..200 {
        let any_down = modifiers
            .iter()
            .any(|vk| unsafe { GetAsyncKeyState(vk.0 as i32) } < 0);
        if !any_down {
            thread::sleep(Duration::from_millis(35));
            return Ok(());
        }
        thread::sleep(Duration::from_millis(10));
    }
    Err("Ctrl/Alt 키를 뗀 뒤 다시 시도하세요.".into())
}

#[cfg(windows)]
fn simulate_ctrl_c() -> Result<(), String> {
    unsafe {
        send_vk(VK_CONTROL.0, false)?;
        send_vk(0x43u16, false)?;
        send_vk(0x43u16, true)?;
        send_vk(VK_CONTROL.0, true)?;
    }
    Ok(())
}

#[cfg(windows)]
unsafe fn send_vk(vk: u16, key_up: bool) -> Result<(), String> {
    let flags = if key_up {
        KEYEVENTF_KEYUP
    } else {
        KEYBD_EVENT_FLAGS(0)
    };
    let mut input = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: windows::Win32::UI::Input::KeyboardAndMouse::KEYBDINPUT {
                wVk: VIRTUAL_KEY(vk),
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    let sent = unsafe {
        SendInput(
            std::slice::from_mut(&mut input),
            std::mem::size_of::<INPUT>() as i32,
        )
    };
    if sent == 0 {
        Err("선택 내용 복사 키 입력에 실패했습니다.".into())
    } else {
        Ok(())
    }
}

/// 이미 사용자가 복사한 클립보드만 읽습니다.
/// 다른 앱에 키 입력을 보내거나 기존 클립보드를 초기화하지 않습니다.
pub fn read_clipboard_prefer_text() -> Result<CapturedContent, String> {
    let mut clipboard =
        arboard::Clipboard::new().map_err(|e| format!("클립보드 열기 실패: {e}"))?;

    let text = clipboard.get_text().unwrap_or_default();
    let has_text = !text.trim().is_empty();

    if let Ok(img) = clipboard.get_image() {
        if !has_text || looks_like_image_sidecar_text(&text) {
            let png = rgba_to_png(&img.bytes, img.width, img.height).ok_or("이미지 인코딩 실패")?;
            let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &png);
            return Ok(CapturedContent {
                kind: "image".into(),
                text: None,
                image_base64: Some(b64),
            });
        }
    }

    if has_text {
        return Ok(CapturedContent {
            kind: "text".into(),
            text: Some(text),
            image_base64: None,
        });
    }

    Err("클립보드가 비어 있습니다".into())
}

fn looks_like_image_sidecar_text(text: &str) -> bool {
    let t = text.trim();
    t.starts_with("<html")
        || t.starts_with("<!--StartFragment")
        || t.starts_with("data:image")
        || t.contains("xmlns:x")
        || (t.len() < 8 && !t.contains('\n'))
}
