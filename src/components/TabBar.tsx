import { Plus, X } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import type { Tab } from '../lib/types'

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onClose: (id: string) => void
  onRename: (id: string, title: string) => void
  /** fromId를 toId 자리로 옮깁니다 (드래그 정렬). */
  onReorder: (fromId: string, toId: string) => void
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
  onReorder,
  text,
  muted,
  border,
}: TabBarProps) {
  const sorted = [...tabs].sort((a, b) => a.order - b.order)
  const dragId = useRef<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

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
        const isOver = overId === tab.id && draggingId !== tab.id
        return (
          <div
            key={tab.id}
            draggable
            title="드래그해서 순서 변경 · 더블클릭으로 이름 변경"
            onDragStart={(e) => {
              dragId.current = tab.id
              setDraggingId(tab.id)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', tab.id)
            }}
            onDragEnd={() => {
              dragId.current = null
              setDraggingId(null)
              setOverId(null)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (overId !== tab.id) setOverId(tab.id)
            }}
            onDragLeave={() => {
              if (overId === tab.id) setOverId(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              const from = dragId.current || e.dataTransfer.getData('text/plain')
              setOverId(null)
              dragId.current = null
              setDraggingId(null)
              if (from && from !== tab.id) onReorder(from, tab.id)
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              borderBottom: active ? `2px solid ${text}` : '2px solid transparent',
              outline: isOver ? `1px dashed ${text}` : 'none',
              color: active ? text : muted,
              fontSize: 12,
              cursor: 'grab',
              whiteSpace: 'nowrap',
              opacity: draggingId === tab.id ? 0.55 : 1,
            }}
            onClick={() => onSelect(tab.id)}
            onDoubleClick={() => {
              const next = window.prompt('탭 이름', tab.title)
              if (next != null && next.trim()) onRename(tab.id, next.trim())
            }}
          >
            <span>{tab.title}</span>
            {tabs.length > 1 && (
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
