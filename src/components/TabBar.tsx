import { ArrowSquareOut, Plus, X } from '@phosphor-icons/react'
import type { Tab } from '../lib/types'

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onClose: (id: string) => void
  onDetach: (id: string) => void
  onRename: (id: string, title: string) => void
  text: string
  muted: string
  border: string
  detached?: boolean
}

export function TabBar({
  tabs,
  activeTabId,
  onSelect,
  onAdd,
  onClose,
  onDetach,
  onRename,
  text,
  muted,
  border,
  detached = false,
}: TabBarProps) {
  const sorted = [...tabs]
    .filter((tab) => !detached || tab.id === activeTabId)
    .sort((a, b) => a.order - b.order)

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
        return (
          <div
            key={tab.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
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
            <span>{tab.title}</span>
            {!detached ? (
              <button
                type="button"
                title="새창으로 열기"
                onClick={(e) => {
                  e.stopPropagation()
                  onDetach(tab.id)
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
                <ArrowSquareOut size={12} weight="bold" />
              </button>
            ) : null}
            {!detached && tabs.length > 1 && (
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
      {!detached ? (
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
      ) : null}
    </div>
  )
}
