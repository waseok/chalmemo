import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { readImage, readText, writeText } from '@tauri-apps/plugin-clipboard-manager'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MemoEditor, type EditorApi } from './components/Editor'
import { FindBar } from './components/FindBar'
import { SettingsPanel } from './components/Settings'
import { TabBar } from './components/TabBar'
import { TitleBar } from './components/TitleBar'
import { exportMd, exportPdf, exportTxt } from './lib/export'
import { extractSingleUrl, resolveLinkMetadata } from './lib/linkMetadata'
import { tableContentFromClipboard } from './lib/tablePaste'
import {
  EMPTY_DOC,
  PAPER_COLORS,
  type AppState,
  type PasteRequest,
  type Settings,
  type Tab,
} from './lib/types'
import './App.css'

function uid() {
  return crypto.randomUUID()
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showFind, setShowFind] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [charCount, setCharCount] = useState(0)
  const [copied, setCopied] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<{
    available: boolean
    latestVersion: string
    notes: string
    downloadUrl?: string | null
  } | null>(null)
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const editorApi = useRef<EditorApi | null>(null)
  const saveTimer = useRef<number | null>(null)
  const stateRef = useRef<AppState | null>(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const persist = useCallback((next: AppState) => {
    setState(next)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void invoke('save_app_state', { data: next })
    }, 400)
  }, [])

  useEffect(() => {
    void (async () => {
      const loaded = await invoke<AppState>('load_app_state')
      setState(loaded)
      try {
        if (import.meta.env.DEV) {
          // 개발 실행을 시작프로그램에 넣으면 재부팅 때 터미널이 뜹니다.
          await disable()
        } else {
          const auto = await isEnabled()
          if (auto !== loaded.settings.autostart) {
            if (loaded.settings.autostart) await enable()
            else await disable()
          }
        }
        // 설치된 0.1.0은 검사 기능이 없습니다. 이 버전부터 GitHub 새 릴리스를 확인합니다.
        const info = await invoke<{
          available: boolean
          currentVersion: string
          latestVersion: string
          notes: string
          downloadUrl?: string | null
        }>('check_app_update')
        if (info.available) setUpdateInfo(info)
      } catch {
        /* 미리보기·오프라인에서는 무시 */
      }
    })()
  }, [])

  const paper = PAPER_COLORS[state?.settings.paperColor ?? 'yellow']
  const activeTab = useMemo(
    () => state?.tabs.find((t) => t.id === state.activeTabId) ?? state?.tabs[0],
    [state],
  )

  const updateSettings = async (partial: Partial<Settings>) => {
    if (!state) return
    const settings = { ...state.settings, ...partial }
    const next = { ...state, settings }
    persist(next)

    if (partial.alwaysOnTop !== undefined) {
      await invoke('set_always_on_top', { enabled: settings.alwaysOnTop })
    }
    if (partial.opacity !== undefined) {
      await invoke('set_window_opacity', { opacity: settings.opacity })
    }
    if (partial.autostart !== undefined) {
      try {
        if (import.meta.env.DEV) {
          await disable()
        } else if (settings.autostart) {
          await enable()
        } else {
          await disable()
        }
      } catch {
        /* ignore */
      }
    }
  }

  const updateTabContent = (content: Record<string, unknown>) => {
    if (!state || !activeTab) return
    const tabs = state.tabs.map((t) => (t.id === activeTab.id ? { ...t, content } : t))
    persist({ ...state, tabs })
    const text = editorApi.current?.getText() ?? ''
    setCharCount(text.replace(/\s/g, '').length)
  }

  const addTab = () => {
    if (!state) return
    const tab: Tab = {
      id: uid(),
      title: `메모 ${state.tabs.length + 1}`,
      content: EMPTY_DOC,
      order: state.tabs.length,
      stickyBlockCount: 0,
    }
    persist({ ...state, tabs: [...state.tabs, tab], activeTabId: tab.id })
  }

  const closeTab = (id: string) => {
    if (!state || state.tabs.length <= 1) return
    const tabs = state.tabs.filter((t) => t.id !== id).map((t, i) => ({ ...t, order: i }))
    const activeTabId = state.activeTabId === id ? tabs[0].id : state.activeTabId
    persist({ ...state, tabs, activeTabId })
  }

  const setStickyBlockCount = (count: number) => {
    if (!state || !activeTab) return
    const tabs = state.tabs.map((t) =>
      t.id === activeTab.id ? { ...t, stickyBlockCount: Math.max(0, count) } : t,
    )
    persist({ ...state, tabs })
  }

  const toggleStickyHeader = () => {
    if (!state || !activeTab) return
    if ((activeTab.stickyBlockCount ?? 0) > 0) {
      setStickyBlockCount(0)
      return
    }
    const count = editorApi.current?.stickyCountThroughCursor() ?? 1
    setStickyBlockCount(count)
  }

  const reorderTabs = (fromId: string, toId: string) => {
    if (!state || fromId === toId) return
    const sorted = [...state.tabs].sort((a, b) => a.order - b.order)
    const fromIdx = sorted.findIndex((t) => t.id === fromId)
    const toIdx = sorted.findIndex((t) => t.id === toId)
    if (fromIdx < 0 || toIdx < 0) return
    const next = [...sorted]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    persist({
      ...state,
      tabs: next.map((t, i) => ({ ...t, order: i })),
    })
  }

  const nudgeFontSize = (delta: number) => {
    if (!state) return
    const next = Math.min(36, Math.max(10, state.settings.fontSize + delta))
    if (next === state.settings.fontSize) return
    void updateSettings({ fontSize: next })
  }

  const handlePasteToMemo = useCallback(async (_unused?: boolean, payload?: PasteRequest) => {
    try {
      const withStamp =
        payload?.timestamp ?? stateRef.current?.settings.captureTimestamp ?? false

      const insertText = async (text: string) => {
        const url = extractSingleUrl(text)
        if (url) {
          const linkCard = await resolveLinkMetadata(url)
          editorApi.current?.insertCapture({ linkCard, timestamp: withStamp })
        } else {
          editorApi.current?.insertCapture({ text, timestamp: withStamp })
        }
      }

      // Rust에서 이미 캡처한 내용이 있으면 그걸 씁니다 (스테일 클립보드 방지)
      if (payload?.error) {
        console.warn(payload.error)
        return
      }
      if (payload?.contentKind === 'text' && payload.text?.trim()) {
        await insertText(payload.text)
        return
      }
      if (payload?.contentKind === 'image' && payload.imageBase64) {
        const saved = await invoke<{ path: string; dataUrl: string }>('save_image_bytes', {
          base64Data: payload.imageBase64,
          ext: 'png',
        })
        editorApi.current?.insertCapture({ imageSrc: saved.dataUrl, timestamp: withStamp })
        return
      }

      // 창의「붙여넣기」버튼: 텍스트 우선, 없으면 이미지
      try {
        const text = await readText()
        if (text?.trim()) {
          const looksHtml =
            text.trim().startsWith('<html') || text.trim().startsWith('<!--StartFragment')
          const isTable = Boolean(tableContentFromClipboard(text, text))
          if (!looksHtml || isTable) {
            await insertText(text)
            return
          }
        }
      } catch {
        /* 텍스트 없음 */
      }

      try {
        const img = await readImage()
        const rgba = await img.rgba()
        const size = await img.size()
        const canvas = document.createElement('canvas')
        canvas.width = size.width
        canvas.height = size.height
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), size.width, size.height), 0, 0)
          const dataUrl = canvas.toDataURL('image/png')
          const saved = await invoke<{ path: string; dataUrl: string }>('save_image_bytes', {
            base64Data: dataUrl,
            ext: 'png',
          })
          editorApi.current?.insertCapture({ imageSrc: saved.dataUrl, timestamp: withStamp })
        }
      } catch {
        /* 이미지 없음 */
      }
    } catch (err) {
      console.error(err)
    }
  }, [])

  const handlePasteRef = useRef(handlePasteToMemo)
  handlePasteRef.current = handlePasteToMemo

  // 리스너는 한 번만 등록 (StrictMode/의존성 변경으로 2번 붙는 것 방지)
  useEffect(() => {
    let alive = true
    let unlisten: (() => void) | undefined
    void listen<PasteRequest>('memo-paste-request', (event) => {
      void handlePasteRef.current(undefined, event.payload)
    }).then((fn) => {
      if (!alive) {
        fn()
        return
      }
      unlisten = fn
    })
    return () => {
      alive = false
      unlisten?.()
    }
  }, [])

  // 앱 단축키
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!state) return
      if (e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        addTab()
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'w') {
        e.preventDefault()
        closeTab(state.activeTabId)
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setShowFind(true)
      }
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        const sorted = [...state.tabs].sort((a, b) => a.order - b.order)
        const idx = sorted.findIndex((t) => t.id === state.activeTabId)
        const next = sorted[(idx + 1) % sorted.length]
        persist({ ...state, activeTabId: next.id })
      }
      // Ctrl+= / Ctrl+- / Ctrl+숫자패드± 글자 크기
      if (e.ctrlKey && (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd')) {
        e.preventDefault()
        nudgeFontSize(1)
      }
      if (e.ctrlKey && (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract')) {
        e.preventDefault()
        nudgeFontSize(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  // 창 위치/크기 저장
  useEffect(() => {
    const win = getCurrentWindow()
    let timer: number | null = null
    const saveBounds = async () => {
      if (!stateRef.current) return
      try {
        const pos = await win.outerPosition()
        const size = await win.outerSize()
        const factor = await win.scaleFactor()
        const next: AppState = {
          ...stateRef.current,
          window: {
            x: Math.round(pos.x / factor),
            y: Math.round(pos.y / factor),
            width: Math.round(size.width / factor),
            height: Math.round(size.height / factor),
          },
        }
        persist(next)
      } catch {
        /* ignore */
      }
    }
    const unsubs = Promise.all([
      win.onMoved(() => {
        if (timer) window.clearTimeout(timer)
        timer = window.setTimeout(() => void saveBounds(), 500)
      }),
      win.onResized(() => {
        if (timer) window.clearTimeout(timer)
        timer = window.setTimeout(() => void saveBounds(), 500)
      }),
    ])
    return () => {
      void unsubs.then((fns) => fns.forEach((u) => u()))
    }
  }, [persist])

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !stateRef.current) return
      event.preventDefault()
      const current = stateRef.current.settings.fontSize
      const next = Math.min(36, Math.max(10, current + (event.deltaY < 0 ? 1 : -1)))
      if (next === current) return
      persist({
        ...stateRef.current,
        settings: { ...stateRef.current.settings, fontSize: next },
      })
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [persist])

  if (!state || !activeTab) {
    return (
      <div className="boot" style={{ background: '#FBF3DB', color: '#2F3437' }}>
        불러오는 중…
      </div>
    )
  }

  return (
    <div
      className="app-shell"
      style={{
        background: paper.bg,
        color: paper.text,
        opacity: state.settings.opacity,
      }}
    >
      <TitleBar
        alwaysOnTop={state.settings.alwaysOnTop}
        stickyActive={(activeTab.stickyBlockCount ?? 0) > 0}
        muted={paper.muted}
        text={paper.text}
        border={paper.border}
        onTogglePin={() => void updateSettings({ alwaysOnTop: !state.settings.alwaysOnTop })}
        onToggleSticky={toggleStickyHeader}
        onOpenSettings={() => setShowSettings(true)}
        onFind={() => setShowFind(true)}
        onExportMenu={() => setShowExport((v) => !v)}
        onPasteToMemo={() => void handlePasteToMemo()}
        onCopyAll={() => {
          const body = editorApi.current?.getCopyText?.() ?? editorApi.current?.getText() ?? ''
          const text = [activeTab.title, body].filter(Boolean).join('\n\n')
          void writeText(text).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          })
        }}
        onInsertDate={() => editorApi.current?.insertDate()}
        onMinimize={() => void getCurrentWindow().hide()}
        onClose={() => void getCurrentWindow().hide()}
      />

      {updateInfo?.available && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            padding: '6px 10px',
            borderBottom: `1px solid ${paper.border}`,
            fontSize: 12,
          }}
        >
          <span style={{ flex: 1 }}>
            새 버전 {updateInfo.latestVersion}이 있습니다.
            {updateError ? ` (${updateError})` : ''}
          </span>
          <button
            type="button"
            className="chip"
            disabled={updating}
            onClick={() => {
              if (!updateInfo.downloadUrl) return
              setUpdating(true)
              setUpdateError(null)
              void invoke('install_app_update', { url: updateInfo.downloadUrl }).catch((err) => {
                setUpdating(false)
                setUpdateError(err instanceof Error ? err.message : String(err))
              })
            }}
          >
            {updating ? '받는 중…' : '업데이트'}
          </button>
          {updateInfo.downloadUrl ? (
            <button
              type="button"
              className="chip"
              onClick={() => {
                if (updateInfo.downloadUrl) void openUrl(updateInfo.downloadUrl)
              }}
            >
              브라우저에서 받기
            </button>
          ) : null}
          <button type="button" className="chip" onClick={() => setUpdateInfo(null)}>
            나중에
          </button>
        </div>
      )}

      {showExport && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: '6px 10px',
            borderBottom: `1px solid ${paper.border}`,
            fontSize: 12,
          }}
        >
          <button type="button" className="chip" onClick={() => void exportTxt(activeTab.title, activeTab.content as never)}>
            TXT
          </button>
          <button type="button" className="chip" onClick={() => void exportMd(activeTab.title, activeTab.content as never)}>
            MD
          </button>
          <button type="button" className="chip" onClick={() => exportPdf()}>
            PDF
          </button>
          <button type="button" className="chip" onClick={() => setShowExport(false)}>
            닫기
          </button>
        </div>
      )}

      <TabBar
        tabs={state.tabs}
        activeTabId={state.activeTabId}
        text={paper.text}
        muted={paper.muted}
        border={paper.border}
        onSelect={(id) => persist({ ...state, activeTabId: id })}
        onAdd={addTab}
        onClose={closeTab}
        onReorder={reorderTabs}
        onRename={(id, title) => {
          const tabs = state.tabs.map((t) => (t.id === id ? { ...t, title } : t))
          persist({ ...state, tabs })
        }}
      />

      {showFind && (
        <FindBar
          query={findQuery}
          onChange={setFindQuery}
          onFind={() => editorApi.current?.focusFind(findQuery)}
          onClose={() => setShowFind(false)}
          text={paper.text}
          muted={paper.muted}
          border={paper.border}
          bg={paper.bg}
        />
      )}

      <MemoEditor
        key={activeTab.id}
        content={activeTab.content}
        fontSize={state.settings.fontSize}
        textColor={paper.text}
        mutedColor={paper.muted}
        paperBg={paper.bg}
        paperBorder={paper.border}
        stickyBlockCount={activeTab.stickyBlockCount ?? 0}
        onChange={updateTabContent}
        onReady={(api) => {
          editorApi.current = api
          setCharCount(api.getText().replace(/\s/g, '').length)
        }}
      />

      <footer
        style={{
          padding: '4px 12px',
          borderTop: `1px solid ${paper.border}`,
          fontSize: 11,
          color: paper.muted,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>
          {copied
            ? '복사됨'
            : `${charCount}자${(activeTab.stickyBlockCount ?? 0) > 0 ? ` · 상단 ${activeTab.stickyBlockCount}줄 고정` : ''}`}
        </span>
        <span>{state.settings.alwaysOnTop ? '항상 위' : '일반'}</span>
      </footer>

      {showSettings && (
        <SettingsPanel
          settings={state.settings}
          text={paper.text}
          muted={paper.muted}
          border={paper.border}
          bg={paper.bg}
          onChange={(p) => void updateSettings(p)}
          onClose={() => setShowSettings(false)}
          onRegisterShortcut={(shortcut) => {
            void invoke('register_shortcut', { shortcut })
            void updateSettings({ shortcut })
          }}
          onCheckUpdate={async () => {
            const info = await invoke<{
              available: boolean
              currentVersion: string
              latestVersion: string
              notes: string
              downloadUrl?: string | null
            }>('check_app_update')
            if (info.available) {
              setUpdateInfo(info)
              setShowSettings(false)
              return `새 버전 ${info.latestVersion}이 있습니다.`
            }
            return `이미 최신입니다. (현재 ${info.currentVersion}, GitHub ${info.latestVersion})`
          }}
        />
      )}
    </div>
  )
}
