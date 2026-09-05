# 찰메모

Windows용 로컬 스티키 메모 앱입니다.  
항상 위 · 탭 · 전역 단축키 캡처 · 링크 미리보기 · 트레이 상주.

## 기능

- 항상 위 창 + 탭 메모
- `Ctrl+Alt+M`으로 다른 앱 선택 내용을 현재 탭에 붙여넣기
- URL 붙여넣기 시 글 제목·도메인 카드
- 이미지·계산식·날짜 삽입, TXT/MD/PDF 내보내기
- 닫아도 트레이에 남음 (로컬 `%APPDATA%\찰메모`)

## 설치

[Releases](https://github.com/waseok/chalmemo/releases)에서 `찰메모_…_x64-setup.exe`를 받아 설치하세요.  
Windows WebView2가 필요합니다(Windows 10/11 대부분 기본 포함).

## 개발

```bash
npm install
npm run tauri:dev
```

설치형 빌드:

```bash
npm run tauri:build
```

산출물: `src-tauri/target/release/bundle/nsis/`

## 라이선스

개인 사용·배포용으로 자유롭게 쓰세요.
