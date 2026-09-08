import { useState, type CSSProperties } from 'react'
import type { PaperColor, Settings } from '../lib/types'

interface SettingsPanelProps {
  settings: Settings
  text: string
  muted: string
  border: string
  bg: string
  onChange: (next: Partial<Settings>) => void
  onClose: () => void
  onRegisterShortcut: (shortcut: string) => void
  onCheckUpdate: () => Promise<string>
}

const PAPERS: { id: PaperColor; label: string }[] = [
  { id: 'yellow', label: '노랑' },
  { id: 'cream', label: '미색' },
  { id: 'green', label: '연녹' },
  { id: 'lime', label: '초록' },
  { id: 'dark', label: '다크' },
]

export function SettingsPanel({
  settings,
  text,
  muted,
  border,
  bg,
  onChange,
  onClose,
  onRegisterShortcut,
  onCheckUpdate,
}: SettingsPanelProps) {
  const [updateMsg, setUpdateMsg] = useState('')
  const [checking, setChecking] = useState(false)
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: bg,
        zIndex: 20,
        padding: 16,
        overflow: 'auto',
        color: text,
        fontFamily: '"Segoe UI Variable", "Malgun Gothic", sans-serif',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>설정</h2>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: text,
            color: bg,
            border: 'none',
            borderRadius: 4,
            padding: '4px 10px',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          닫기
        </button>
      </div>

      <label style={rowStyle}>
        <span>항상 위</span>
        <input
          type="checkbox"
          checked={settings.alwaysOnTop}
          onChange={(e) => onChange({ alwaysOnTop: e.target.checked })}
        />
      </label>

      <label style={rowStyle}>
        <span>투명도 {Math.round(settings.opacity * 100)}%</span>
        <input
          type="range"
          min={0.4}
          max={1}
          step={0.05}
          value={settings.opacity}
          onChange={(e) => onChange({ opacity: Number(e.target.value) })}
        />
      </label>

      <label style={rowStyle}>
        <span>글자 크기 {settings.fontSize}px</span>
        <input
          type="range"
          min={10}
          max={36}
          step={1}
          value={settings.fontSize}
          onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
        />
      </label>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, marginBottom: 8, color: muted }}>용지 색</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PAPERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange({ paperColor: p.id })}
              style={{
                flex: 1,
                padding: '8px 0',
                borderRadius: 6,
                border: settings.paperColor === p.id ? `2px solid ${text}` : `1px solid ${border}`,
                background: 'transparent',
                color: text,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <label style={rowStyle}>
        <span>전역 단축키</span>
        <input
          value={settings.shortcut}
          onChange={(e) => onChange({ shortcut: e.target.value })}
          onBlur={() => onRegisterShortcut(settings.shortcut)}
          style={{
            width: 120,
            border: `1px solid ${border}`,
            borderRadius: 4,
            padding: '4px 8px',
            background: 'transparent',
            color: text,
          }}
        />
      </label>

      <label style={rowStyle}>
        <span>Windows 시작 시 실행</span>
        <input
          type="checkbox"
          checked={settings.autostart}
          onChange={(e) => onChange({ autostart: e.target.checked })}
        />
      </label>

      <div style={rowStyle}>
        <span>업데이트</span>
        <button
          type="button"
          className="chip"
          disabled={checking}
          onClick={() => {
            setChecking(true)
            setUpdateMsg('')
            void onCheckUpdate()
              .then((msg) => setUpdateMsg(msg))
              .finally(() => setChecking(false))
          }}
        >
          {checking ? '확인 중…' : '지금 확인'}
        </button>
      </div>
      {updateMsg ? (
        <p style={{ fontSize: 12, color: muted, margin: '-6px 0 14px' }}>{updateMsg}</p>
      ) : null}

      <p style={{ fontSize: 12, color: muted, lineHeight: 1.5, marginTop: 20 }}>
        사용법: 다른 앱에서 텍스트/이미지를 선택한 뒤 전역 단축키({settings.shortcut})를 누르거나,
        복사 후 「붙여넣기」/트레이 「메모에 붙여넣기」를 누르세요.
        <br />
        날짜는 왼쪽 달력 버튼으로 넣을 수 있습니다.
        <br />
        계산: <code>23*5=</code> 입력 후 스페이스를 두 번 누르면 결과가 붙습니다.
        <br />
        개발 모드에서는 Windows 시작 등록을 하지 않습니다. 재부팅 때 터미널이 뜨던 원인입니다.
        <br />
        Ctrl+마우스 휠로 글자 크기를 바꿀 수 있습니다.
      </p>
    </div>
  )
}

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 14,
  fontSize: 13,
  gap: 12,
}
