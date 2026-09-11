export type PaperColor =
  | 'yellow'
  | 'cream'
  | 'green'
  | 'pink'
  | 'blue'
  | 'purple'
  | 'orange'
  | 'neonYellow'
  | 'neonGreen'
  | 'neonPink'
  | 'neonCyan'
  | 'lime'
  | 'dark'

export interface Tab {
  id: string
  title: string
  // TipTap JSON 문서
  content: Record<string, unknown>
  order: number
  /** 이 메모만의 포스트잇 색. 없으면 기존 전역 색을 사용 */
  paperColor?: PaperColor
  /** 스크롤해도 위에 남는 본문 문단의 1부터 시작하는 번호. 0이면 고정 없음 */
  stickyBlockIndex?: number
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
  pink: { bg: '#FFE5ED', text: '#3D2930', muted: '#856A73', border: 'rgba(92,31,53,0.12)' },
  blue: { bg: '#E2F0FF', text: '#243448', muted: '#66788D', border: 'rgba(34,79,128,0.12)' },
  purple: { bg: '#EEE5FF', text: '#352B47', muted: '#75678A', border: 'rgba(83,52,128,0.12)' },
  orange: { bg: '#FFE6C7', text: '#422F1F', muted: '#866B54', border: 'rgba(122,70,28,0.13)' },
  neonYellow: { bg: '#F3FF63', text: '#292D19', muted: '#676C38', border: 'rgba(67,76,0,0.18)' },
  neonGreen: { bg: '#BFFF72', text: '#203018', muted: '#587044', border: 'rgba(42,87,9,0.18)' },
  neonPink: { bg: '#FF9FD4', text: '#3C1E30', muted: '#814F6B', border: 'rgba(112,21,73,0.18)' },
  neonCyan: { bg: '#8FF4FF', text: '#173238', muted: '#49747A', border: 'rgba(0,82,94,0.18)' },
  lime: { bg: '#1C3328', text: '#F3E8C8', muted: '#A8B89A', border: 'rgba(255,255,255,0.12)' },
  dark: { bg: '#2F3437', text: '#F7F6F3', muted: '#A0A0A0', border: 'rgba(255,255,255,0.1)' },
}
