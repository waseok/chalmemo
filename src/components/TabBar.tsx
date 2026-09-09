import { Plus, PushPin, X } from '@phosphor-icons/react'
import { sortTabs, type Tab } from '../lib/types'

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onClose: (id: string) => void
  onRename: (id: string, title: string) => void
  onTogglePin: (id: string) => void
  text: string
  muted: string
  border: string
}

export function TabBar({
  tabs,
  activeTabId,
  onSelect,
  onAdd,
  onClose,
  onRename,
  onTogglePin,
  text,
  muted,
  border,
}: TabBarProps) {
  const sorted = sortTabs(tabs)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '4px 8px',
        borderBottom: `1px solid ${border}`,
        overflowX: 'auto',
      }}
    >
      {sorted.map((tab) => {
        const active = tab.id === activeTabId
        const pinned = Boolean(tab.pinned)
        return (
          <div
            key={tab.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: pinned ? '4px 6px' : '4px 8px',
              borderBottom: active ? `2px solid ${text}` : '2px solid transparent',
              color: active ? text : muted,
              fontSize: 12,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            onClick={() => onSelect(tab.id)}
            onDoubleClick={() => {
              const next = window.prompt('탭 이름', tab.title)
              if (next != null && next.trim()) onRename(tab.id, next.trim())
            }}
          >
            <button
              type="button"
              title={pinned ? '탭 고정 해제' : '탭 상단 고정'}
              onClick={(e) => {
                e.stopPropagation()
                onTogglePin(tab.id)
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: pinned ? text : muted,
                cursor: 'pointer',
                padding: 0,
                display: 'inline-flex',
              }}
            >
              <PushPin size={11} weight={pinned ? 'fill' : 'bold'} />
            </button>
            <span>{tab.title}</span>
            {tabs.length > 1 && !pinned && (
              <button
                type="button"
                title="탭 닫기"
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(tab.id)
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: muted,
                  cursor: 'pointer',
                  padding: 0,
                  display: 'inline-flex',
                }}
              >
                <X size={12} weight="bold" />
              </button>
            )}
          </div>
        )
      })}
      <button
        type="button"
        title="새 탭"
        onClick={onAdd}
        style={{
          background: 'transparent',
          border: 'none',
          color: muted,
          cursor: 'pointer',
          padding: '4px 6px',
          display: 'inline-flex',
        }}
      >
        <Plus size={14} weight="bold" />
      </button>
    </div>
  )
}
