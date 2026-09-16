use serde::Serialize;

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
