interface FindBarProps {
  query: string
  onChange: (q: string) => void
  onFind: () => void
  onClose: () => void
  text: string
  muted: string
  border: string
  bg: string
}

export function FindBar({ query, onChange, onFind, onClose, text, muted, border, bg }: FindBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        padding: '6px 10px',
        borderBottom: `1px solid ${border}`,
        background: bg,
      }}
    >
      <input
        autoFocus
        value={query}
        placeholder="찾기…"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onFind()
          if (e.key === 'Escape') onClose()
        }}
        style={{
          flex: 1,
          border: `1px solid ${border}`,
          borderRadius: 4,
          padding: '4px 8px',
          background: 'transparent',
          color: text,
          fontSize: 13,
        }}
      />
      <button
        type="button"
        onClick={onFind}
        style={{
          border: `1px solid ${border}`,
          borderRadius: 4,
          background: 'transparent',
          color: text,
          padding: '4px 10px',
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        다음
      </button>
      <button
        type="button"
        onClick={onClose}
        style={{
          border: 'none',
          background: 'transparent',
          color: muted,
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        닫기
      </button>
    </div>
  )
}
