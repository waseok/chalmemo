import {
  CalendarBlank,
  ClipboardText,
  CornersOut,
  Export as ExportIcon,
  GearSix,
  MagnifyingGlass,
  Minus,
  PushPin,
  PushPinSlash,
  TextB,
  X,
} from '@phosphor-icons/react'

interface TitleBarProps {
  alwaysOnTop: boolean
  onTogglePin: () => void
  onOpenSettings: () => void
  onFind: () => void
  onExportMenu: () => void
  onPasteToMemo: () => void
  onCopyAll: () => void
  onInsertDate: () => void
  onToggleBold: () => void
  onMinimize: () => void
  onToggleMaximize: () => void
  onClose: () => void
  muted: string
  text: string
  border: string
}

export function TitleBar({
  alwaysOnTop,
  onTogglePin,
  onOpenSettings,
  onFind,
  onExportMenu,
  onPasteToMemo,
  onCopyAll,
  onInsertDate,
  onToggleBold,
  onMinimize,
  onToggleMaximize,
  onClose,
  muted,
  text,
  border,
}: TitleBarProps) {
  const btn = {
    background: 'transparent',
    border: 'none',
    color: muted,
    cursor: 'pointer',
    padding: '4px 6px',
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 4,
  } as const

  return (
    <header
      className="titlebar"
      data-tauri-drag-region
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 10px 6px',
        borderBottom: `1px solid ${border}`,
        userSelect: 'none',
      }}
    >
      <div data-tauri-drag-region style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <strong data-tauri-drag-region style={{ fontSize: 13, color: text, letterSpacing: '-0.02em', marginRight: 4 }}>
          찰메모
        </strong>
        <button type="button" style={btn} title="오늘 날짜 넣기" onClick={onInsertDate}>
          <CalendarBlank size={16} weight="bold" />
        </button>
        <button type="button" style={btn} title="굵게 (Ctrl+B)" onClick={onToggleBold}>
          <TextB size={16} weight="bold" />
        </button>
        <button type="button" style={btn} title="메모에 붙여넣기" onClick={onPasteToMemo}>
          붙여넣기
        </button>
        <button type="button" style={btn} title="이 탭 전체 복사" onClick={onCopyAll}>
          <ClipboardText size={16} weight="bold" />
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button type="button" style={btn} title="찾기" onClick={onFind}>
          <MagnifyingGlass size={16} weight="bold" />
        </button>
        <button type="button" style={btn} title="내보내기" onClick={onExportMenu}>
          <ExportIcon size={16} weight="bold" />
        </button>
        <button
          type="button"
          style={{ ...btn, color: alwaysOnTop ? text : muted }}
          title={alwaysOnTop ? '항상 위 ON' : '항상 위 OFF'}
          onClick={onTogglePin}
        >
          {alwaysOnTop ? <PushPin size={16} weight="fill" /> : <PushPinSlash size={16} weight="bold" />}
        </button>
        <button type="button" style={btn} title="설정" onClick={onOpenSettings}>
          <GearSix size={16} weight="bold" />
        </button>
        <button type="button" style={btn} title="트레이로 숨기기" onClick={onMinimize}>
          <Minus size={16} weight="bold" />
        </button>
        <button type="button" style={btn} title="최대화 / 이전 크기" onClick={onToggleMaximize}>
          <CornersOut size={15} weight="bold" />
        </button>
        <button type="button" style={btn} title="닫기" onClick={onClose}>
          <X size={16} weight="bold" />
        </button>
      </div>
    </header>
  )
}
