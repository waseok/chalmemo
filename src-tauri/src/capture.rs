use std::thread;
use std::time::Duration;

use serde::Serialize;

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

#[derive(Clone, Copy, PartialEq, Eq)]
struct ImageFp {
    width: usize,
    height: usize,
    len: usize,
}

fn image_fp(img: &arboard::ImageData) -> ImageFp {
    ImageFp {
        width: img.width,
        height: img.height,
        len: img.bytes.len(),
    }
}

/// 전경 창의 선택을 복사한 뒤, 바뀐 클립보드 내용을 반환합니다.
/// 텍스트·이미지 모두 지원. 예전 스테일 클립보드는 사용하지 않습니다.
pub fn capture_selection() -> Result<CapturedContent, String> {
    // GlobalShortcut의 Released는 M 키가 올라온 시점입니다. 사용자가 Ctrl/Alt를
    // 아직 누르고 있을 수 있으므로 모두 올라올 때까지 기다린 뒤 Ctrl+C를 보냅니다.
    wait_for_modifiers_release()?;

    let mut clipboard =
        arboard::Clipboard::new().map_err(|e| format!("클립보드 열기 실패: {e}"))?;

    // 기존 클립보드와 선택 내용이 같아도 복사 성공을 판별할 수 있도록
    // 고유 표식으로 초기화합니다. 이 과정에서 이전 이미지도 제거되어
    // 새 이미지가 들어왔는지 정확히 알 수 있습니다.
    let sentinel = format!("__MEMO_CAPTURE_{}__", uuid::Uuid::new_v4());
    clipboard
        .set_text(sentinel.clone())
        .map_err(|e| format!("클립보드 초기화 실패: {e}"))?;
    let before_text = sentinel;
    let before_image = None;

    // 이미지는 Ctrl+C가 더 잘 먹는 앱이 많아 Ctrl+C를 먼저 시도합니다.
    // (엑셀 텍스트는 둘 다 동작)
    simulate_ctrl_c()?;
    if let Some(hit) = poll_clipboard_change(&mut clipboard, &before_text, before_image, 16) {
        return Ok(hit);
    }

    Err(
        "선택 영역을 복사하지 못했습니다. 텍스트나 이미지를 선택한 뒤 다시 시도하세요.".into(),
    )
}

fn poll_clipboard_change(
    clipboard: &mut arboard::Clipboard,
    before_text: &str,
    before_image: Option<ImageFp>,
    attempts: u32,
) -> Option<CapturedContent> {
    for _ in 0..attempts {
        thread::sleep(Duration::from_millis(50));

        let text_now = clipboard.get_text().unwrap_or_default();
        let text_changed =
            !text_now.trim().is_empty() && text_now.trim() != before_text.trim();

        let image_now = clipboard.get_image().ok();
        let image_changed = match (&image_now, before_image) {
            (Some(img), Some(prev)) => image_fp(img) != prev,
            (Some(_), None) => true,
            _ => false,
        };

        // 텍스트만 바뀜 → 텍스트 (엑셀 셀 등)
        if text_changed && !image_changed {
            return Some(CapturedContent {
                kind: "text".into(),
                text: Some(text_now),
                image_base64: None,
            });
        }

        // 이미지만 바뀜 → 이미지 (스크린샷·그림 복사)
        if image_changed && !text_changed {
            if let Some(img) = &image_now {
                if let Some(png) = rgba_to_png(&img.bytes, img.width, img.height) {
                    let b64 =
                        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &png);
                    return Some(CapturedContent {
                        kind: "image".into(),
                        text: None,
                        image_base64: Some(b64),
                    });
                }
            }
        }

        // 둘 다 바뀜 → URL/HTML이면 이미지(브라우저 그림), 그 외는 텍스트(엑셀)
        if text_changed && image_changed {
            let prefer_image = looks_like_image_sidecar_text(&text_now)
                || looks_like_lone_url(&text_now)
                || image_is_photo_sized(image_now.as_ref()) && text_now.trim().chars().count() < 40;
            if prefer_image {
                if let Some(img) = &image_now {
                    if let Some(png) = rgba_to_png(&img.bytes, img.width, img.height) {
                        let b64 = base64::Engine::encode(
                            &base64::engine::general_purpose::STANDARD,
                            &png,
                        );
                        return Some(CapturedContent {
                            kind: "image".into(),
                            text: None,
                            image_base64: Some(b64),
                        });
                    }
                }
            }
            return Some(CapturedContent {
                kind: "text".into(),
                text: Some(text_now),
                image_base64: None,
            });
        }
    }
    None
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

#[cfg(windows)]
fn wait_for_modifiers_release() -> Result<(), String> {
    let modifiers = [VK_CONTROL, VK_MENU, VK_SHIFT, VK_LWIN, VK_RWIN];
    for _ in 0..200 {
        let any_down = modifiers
            .iter()
            .any(|vk| unsafe { GetAsyncKeyState(vk.0 as i32) } < 0);
        if !any_down {
            // 키 업 메시지가 대상 앱까지 처리될 짧은 여유
            thread::sleep(Duration::from_millis(35));
            return Ok(());
        }
        thread::sleep(Duration::from_millis(10));
    }
    Err("Ctrl/Alt 키를 뗀 뒤 다시 시도하세요.".into())
}

#[cfg(not(windows))]
fn wait_for_modifiers_release() -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
fn simulate_ctrl_c() -> Result<(), String> {
    unsafe {
        send_vk(VK_CONTROL.0, false)?;
        send_vk(0x43u16, false)?;
        send_vk(0x43u16, true)?;
        send_vk(VK_CONTROL.0, true)?;
    }
    thread::sleep(Duration::from_millis(80));
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
        Err("SendInput 실패".into())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn simulate_ctrl_c() -> Result<(), String> {
    Err("Windows에서만 지원됩니다".into())
}

/// 메뉴「메모에 붙여넣기」용: 텍스트·이미지 둘 다 (텍스트가 있으면 텍스트, 없으면 이미지)
pub fn read_clipboard_prefer_text() -> Result<CapturedContent, String> {
    let mut clipboard =
        arboard::Clipboard::new().map_err(|e| format!("클립보드 열기 실패: {e}"))?;

    // 이미지만 있는 경우(텍스트 없음) → 이미지
    let text = clipboard.get_text().unwrap_or_default();
    let has_text = !text.trim().is_empty();

    if let Ok(img) = clipboard.get_image() {
        // 텍스트가 없거나, 텍스트가 파일 경로/HTML 찌꺼기처럼 짧고 이미지가 있으면 이미지 우선
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
        || t.contains("xmlns:x") // 일부 Office HTML
        || (t.len() < 8 && !t.contains('\n'))
}

fn looks_like_lone_url(text: &str) -> bool {
    let t = text.trim();
    let lines: Vec<_> = t.lines().filter(|l| !l.trim().is_empty()).collect();
    if lines.len() != 1 {
        return false;
    }
    let u = lines[0].trim();
    u.starts_with("http://") || u.starts_with("https://") || u.starts_with("www.")
}

fn image_is_photo_sized(img: Option<&arboard::ImageData>) -> bool {
    img.map(|i| i.width >= 48 && i.height >= 48).unwrap_or(false)
}
