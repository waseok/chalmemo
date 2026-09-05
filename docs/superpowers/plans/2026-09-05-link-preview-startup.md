# Memo Link Preview and Startup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** URL을 제목·도메인 카드로 삽입하고, Windows 시작 시 트레이에서 실행하며, 전역 단축키 캡처 후 창을 활성화한다.

**Architecture:** Rust가 제한된 HTTP 요청으로 링크 메타데이터를 조회하고 React/TipTap은 전용 `linkCard` 노드로 렌더링한다. 자동 실행은 기존 Tauri autostart 플러그인에 `--hidden` 인수를 추가하고 저장 상태를 버전 2로 마이그레이션한다. 캡처는 기존 백그라운드 작업을 유지하고 완료 후에만 창을 표시한다.

**Tech Stack:** Tauri 2, Rust, reqwest, scraper, url, React 19, TypeScript, TipTap 3

## Global Constraints

- 메모와 설정은 `%APPDATA%\Memo\`에만 저장한다.
- 별도 서버나 클라우드 저장소를 사용하지 않는다.
- 링크 조회 제한은 3초, HTML 최대 512KB이다.
- 전역 단축키 콜백에서 네트워크나 클립보드 대기로 UI 스레드를 막지 않는다.
- 현재 폴더는 Git 저장소가 아니므로 커밋 단계는 수행하지 않는다.

---

### Task 1: 로컬 링크 메타데이터 조회

**Files:**
- Create: `src-tauri/src/link_metadata.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `fetch_link_metadata(url: String) -> Result<LinkMetadata, String>`
- `LinkMetadata`: `{ url: String, title: String, domain: String }`

- [ ] **Step 1: 실패 테스트 작성**

```rust
#[test]
fn extracts_title_and_decodes_entities() {
    assert_eq!(
        extract_title("<html><title>Memo &amp; Notes</title></html>"),
        Some("Memo & Notes".into())
    );
}

#[test]
fn rejects_local_and_unsupported_urls() {
    assert!(validate_public_http_url("file:///tmp/a").is_err());
    assert!(validate_public_http_url("http://localhost/a").is_err());
    assert!(validate_public_http_url("http://127.0.0.1/a").is_err());
}
```

- [ ] **Step 2: RED 확인**

Run: `cargo test link_metadata`
Expected: FAIL — 모듈/함수가 아직 없음

- [ ] **Step 3: 최소 구현**

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkMetadata {
    pub url: String,
    pub title: String,
    pub domain: String,
}

#[tauri::command]
async fn fetch_link_metadata(url: String) -> Result<LinkMetadata, String> {
    tauri::async_runtime::spawn_blocking(move || link_metadata::fetch(&url))
        .await
        .map_err(|e| e.to_string())?
}
```

`reqwest::blocking::Client`에 3초 timeout, redirect 3회, 512KB `Read::take`를 적용한다. 조회 실패 시 호출부가 도메인 기반 카드로 대체할 수 있도록 URL 검증과 도메인 추출을 분리한다.

- [ ] **Step 4: GREEN 확인**

Run: `cargo test link_metadata`
Expected: 관련 테스트 모두 PASS

### Task 2: TipTap 링크 카드

**Files:**
- Create: `src/components/LinkCard.tsx`
- Create: `src/lib/linkMetadata.ts`
- Create: `src/lib/linkMetadata.test.ts`
- Modify: `src/components/Editor.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- `fetchLinkMetadata(url: string): Promise<{url:string; title:string; domain:string}>`
- `EditorApi.insertCapture({ text, imageSrc, linkCard })`

- [ ] **Step 1: 실패 테스트 작성**

```ts
assert(extractSingleUrl('https://example.com/a') === 'https://example.com/a')
assert(extractSingleUrl('참고 https://example.com') === null)
assert(fallbackMetadata('https://example.com/a').domain === 'example.com')
```

- [ ] **Step 2: RED 확인**

Run: `npx tsx src/lib/linkMetadata.test.ts`
Expected: FAIL — 함수가 아직 없음

- [ ] **Step 3: 최소 구현**

단일 URL이면 `fetch_link_metadata`를 호출하고 실패 시 `URL.hostname`을 제목·도메인으로 사용한다. `LinkCard` 노드는 `href`, `title`, `domain` 속성을 저장하며 클릭 시 `openUrl(href)`를 실행한다.

```ts
if (linkCard) {
  nodes.push({ type: 'linkCard', attrs: linkCard })
}
```

- [ ] **Step 4: GREEN 확인**

Run: `npx tsx src/lib/linkMetadata.test.ts && npm run build && npm run lint`
Expected: 테스트, 빌드, 린트 모두 exit 0

### Task 3: 자동 시작·트레이 숨김·단축키 활성화

**Files:**
- Modify: `src-tauri/src/store.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/App.tsx`

**Interfaces:**
- 앱 인수: `--hidden`
- 상태 버전: `2`
- 기본 `settings.autostart`: `true`

- [ ] **Step 1: 실패 테스트 작성**

```rust
#[test]
fn version_one_state_migrates_to_autostart_enabled() {
    let migrated = migrate_state(old_version_one_state());
    assert_eq!(migrated.version, 2);
    assert!(migrated.settings.autostart);
}
```

- [ ] **Step 2: RED 확인**

Run: `cargo test version_one_state_migrates_to_autostart_enabled`
Expected: FAIL — 마이그레이션 함수가 없음

- [ ] **Step 3: 최소 구현**

- autostart 플러그인 인수에 `--hidden` 추가
- 버전 1 상태는 한 번만 버전 2로 마이그레이션하며 autostart ON
- setup에서 `--hidden`이면 메인 창 숨김
- 캡처 이벤트 발행 후 `show()`와 `set_focus()` 호출
- setup 시 설정이 ON이면 autostart `enable()` 호출

- [ ] **Step 4: 통합 검증**

Run:

```powershell
npm run build
npm run lint
cargo test
```

실사용 확인:
- 공개 URL 붙여넣기 → 제목·도메인 카드
- `Memo.exe --hidden` → 창 숨김, 프로세스/트레이 실행
- 메모장·Excel·Edge 선택 후 `Ctrl+Alt+M` → 1회 삽입 후 창 활성화

