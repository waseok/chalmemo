export type PaperColor = 'yellow' | 'cream' | 'green' | 'lime' | 'dark'

export interface Tab {
  id: string
  title: string
  // TipTap JSON 문서
  content: Record<string, unknown>
  order: number
  pinned?: boolean
}

export interface Settings {
  alwaysOnTop: boolean
  opacity: number
  paperColor: PaperColor
  fontSize: number
  shortcut: string
  captureTimestamp: boolean
  autostart: boolean
}

export interface WindowState {
  x: number | null
  y: number | null
  width: number
  height: number
}

export interface AppState {
  version: number
  activeTabId: string
  tabs: Tab[]
  settings: Settings
  window: WindowState
}

export interface PasteRequest {
  kind: 'clipboard' | 'hotkey'
  timestamp: boolean
  contentKind?: string | null
  text?: string | null
  imageBase64?: string | null
  error?: string | null
}

export const EMPTY_DOC: Record<string, unknown> = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}

export const PAPER_COLORS: Record<PaperColor, { bg: string; text: string; muted: string; border: string }> = {
  yellow: { bg: '#FBF3DB', text: '#2F3437', muted: '#787774', border: 'rgba(0,0,0,0.08)' },
  cream: { bg: '#F7F6F3', text: '#2F3437', muted: '#787774', border: 'rgba(0,0,0,0.08)' },
  green: { bg: '#EDF3EC', text: '#2F3437', muted: '#787774', border: 'rgba(0,0,0,0.08)' },
  lime: { bg: '#1C3328', text: '#F3E8C8', muted: '#A8B89A', border: 'rgba(255,255,255,0.12)' },
  dark: { bg: '#2F3437', text: '#F7F6F3', muted: '#A0A0A0', border: 'rgba(255,255,255,0.1)' },
}

/** 고정 탭이 왼쪽(앞)에 오도록 정렬합니다. */
export function sortTabs(tabs: Tab[]): Tab[] {
  return [...tabs].sort((a, b) => {
    const pin = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
    if (pin !== 0) return pin
    return a.order - b.order
  })
}
