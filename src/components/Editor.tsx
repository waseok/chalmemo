import { TableKit } from '@tiptap/extension-table'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { openUrl } from '@tauri-apps/plugin-opener'
import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { tryEvaluateBeforeEquals } from '../lib/calc'
import { tableContentFromClipboard } from '../lib/tablePaste'
import { toPlainText } from '../lib/export'
import {
  extractSingleUrl,
  resolveLinkMetadata,
  type LinkMetadata,
} from '../lib/linkMetadata'
import { LinkCard, linkCardWithTrailingParagraph } from './LinkCard'
import { ResizableImage } from './ResizableImage'

interface EditorProps {
  content: Record<string, unknown>
  fontSize: number
  textColor: string
  mutedColor: string
  /** 용지 배경색 — sticky 블록이 아래 내용을 가릴 때 씀 */
  paperBg: string
  paperBorder: string
  /** 고정할 최상위 문단의 1부터 시작하는 번호. 0이면 고정 없음 */
  stickyBlockIndex: number
  onStickyChange: (index: number) => void
  onChange: (json: Record<string, unknown>) => void
  onReady?: (api: EditorApi) => void
}

export interface EditorApi {
  insertCapture: (opts: {
    text?: string
    imageSrc?: string
    linkCard?: LinkMetadata
  }) => void
  insertDate: () => void
  toggleTask: () => void
  focusFind: (query: string) => void
  getJSON: () => JSONContent
  getText: () => string
  getCopyText: () => string
}

interface EditorContextMenu {
  x: number
  y: number
  blockIndex: number
}

function todayLabel() {
  return new Date().toLocaleDateString('ko-KR')
}

export function MemoEditor({
  content,
  fontSize,
  textColor,
  mutedColor,
  paperBg,
  paperBorder,
  stickyBlockIndex,
  onStickyChange,
  onChange,
  onReady,
}: EditorProps) {
  const composing = useRef(false)
  const spaceStreak = useRef(0)
  const stickyIndexRef = useRef(stickyBlockIndex)
  const onStickyChangeRef = useRef(onStickyChange)
  const [contextMenu, setContextMenu] = useState<EditorContextMenu | null>(null)
  const [pinnedPreview, setPinnedPreview] = useState<string | null>(null)

  useEffect(() => {
    onStickyChangeRef.current = onStickyChange
  }, [onStickyChange])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          class: 'memo-link',
        },
      }),
      LinkCard,
      ResizableImage,
      TableKit.configure({
        table: { resizable: false },
      }),
      Placeholder.configure({
        placeholder: '메모를 입력하세요…  23*5=  후 스페이스 두 번으로 계산',
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: content as JSONContent,
    editorProps: {
      attributes: {
        class: 'memo-editor',
      },
      handleKeyDown: (view, event) => {
        if (composing.current) {
          spaceStreak.current = 0
          return false
        }

        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault()
          editor?.chain().focus().toggleTaskList().run()
          return true
        }

        if (event.key === ';' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault()
          editor?.chain().focus().insertContent(todayLabel()).run()
          return true
        }

        if (event.key === ' ' || event.code === 'Space') {
          spaceStreak.current += 1
          if (spaceStreak.current >= 2) {
            const { from } = view.state.selection
            const textBefore = view.state.doc.textBetween(Math.max(0, from - 200), from, '\n', '\n')
            const hit = tryEvaluateBeforeEquals(textBefore)
            if (hit && editor) {
              event.preventDefault()
              spaceStreak.current = 0
              const spacesAfterEq = textBefore.length - hit.end
              const deleteFrom = from - spacesAfterEq
              editor
                .chain()
                .focus()
                .deleteRange({ from: deleteFrom, to: from })
                .insertContent(hit.result)
                .run()
              return true
            }
          }
          return false
        }

        spaceStreak.current = 0
        return false
      },
      handleClick: (_view, _pos, event) => {
        const target = event.target as HTMLElement
        const anchor = target.closest('a')
        if (anchor?.href) {
          event.preventDefault()
          void openUrl(anchor.href)
          return true
        }
        return false
      },
      handlePaste: (_view, event) => {
        const html = event.clipboardData?.getData('text/html') ?? ''
        const plain = event.clipboardData?.getData('text/plain') ?? ''
        const table = tableContentFromClipboard(html, plain)
        if (table) {
          event.preventDefault()
          editor?.chain().focus().insertContent(table).run()
          return true
        }

        const items = event.clipboardData?.items
        if (items) {
          for (const item of items) {
            if (item.type.startsWith('image/')) {
              event.preventDefault()
              const file = item.getAsFile()
              if (!file) return true
              void (async () => {
                const buf = await file.arrayBuffer()
                const bytes = new Uint8Array(buf)
                let binary = ''
                bytes.forEach((b) => {
                  binary += String.fromCharCode(b)
                })
                const b64 = btoa(binary)
                const ext = item.type.split('/')[1] || 'png'
                const saved = await invoke<{ path: string; dataUrl: string }>('save_image_bytes', {
                  base64Data: b64,
                  ext,
                })
                editor?.chain().focus().setImage({ src: saved.dataUrl }).run()
              })()
              return true
            }
          }
        }

        // URL만 붙여넣으면 페이지 제목·도메인 카드로 삽입합니다.
        const pasted = event.clipboardData?.getData('text/plain') ?? ''
        const url = extractSingleUrl(pasted)
        if (url) {
          event.preventDefault()
          void (async () => {
            const linkCard = await resolveLinkMetadata(url)
            editor
              ?.chain()
              .focus()
              .insertContent(
                linkCardWithTrailingParagraph({
                  href: linkCard.url,
                  title: linkCard.title,
                  domain: linkCard.domain,
                }),
              )
              .run()
          })()
          return true
        }
        return false
      },
      handleDOMEvents: {
        contextmenu: (view, event) => {
          const mouseEvent = event as MouseEvent
          const position = view.posAtCoords({ left: mouseEvent.clientX, top: mouseEvent.clientY })
          if (!position) return false

          const resolved = view.state.doc.resolve(position.pos)
          const blockIndex = Math.min(
            Math.max(resolved.index(0) + 1, 1),
            view.state.doc.childCount,
          )
          mouseEvent.preventDefault()
          setContextMenu({
            x: Math.min(mouseEvent.clientX, window.innerWidth - 210),
            y: Math.min(mouseEvent.clientY, window.innerHeight - 104),
            blockIndex,
          })
          return true
        },
      },
    },
    onUpdate: ({ editor: ed }) => {
      // 문서가 링크 카드로 끝나면 빈 문단을 붙여 아래에 입력할 수 있게 합니다.
      const last = ed.state.doc.lastChild
      if (last?.type.name === 'linkCard') {
        ed.commands.insertContentAt(ed.state.doc.content.size, { type: 'paragraph' })
        return
      }
      onChange(ed.getJSON() as Record<string, unknown>)
    },
  })

  /** 지정한 문단을 본문 스크롤과 분리된 제목 영역에 즉시 복제합니다. */
  const syncPinnedPreview = useCallback(() => {
    if (!editor) return
    const root = editor.view.dom
    const indexToPin = Math.max(0, stickyIndexRef.current) - 1
    const target = indexToPin >= 0 ? (root.children.item(indexToPin) as HTMLElement | null) : null
    const next = target?.outerHTML ?? null
    setPinnedPreview((current) => (current === next ? current : next))
  }, [editor])

  useEffect(() => {
    stickyIndexRef.current = stickyBlockIndex
    syncPinnedPreview()
  }, [stickyBlockIndex, syncPinnedPreview])

  useEffect(() => {
    if (!editor) return
    const rerun = () => {
      requestAnimationFrame(syncPinnedPreview)
    }
    editor.on('update', rerun)
    rerun()
    return () => {
      editor.off('update', rerun)
    }
  }, [editor, syncPinnedPreview])

  useEffect(() => {
    if (!editor) return
    const current = JSON.stringify(editor.getJSON())
    const next = JSON.stringify(content)
    if (current !== next) {
      editor.commands.setContent(content as JSONContent, { emitUpdate: false })
      requestAnimationFrame(syncPinnedPreview)
    }
  }, [content, editor, syncPinnedPreview])

  useEffect(() => {
    if (!editor) return
    const el = editor.view.dom
    const onStart = () => {
      composing.current = true
    }
    const onEnd = () => {
      composing.current = false
    }
    el.addEventListener('compositionstart', onStart)
    el.addEventListener('compositionend', onEnd)
    return () => {
      el.removeEventListener('compositionstart', onStart)
      el.removeEventListener('compositionend', onEnd)
    }
  }, [editor])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [contextMenu])

  useEffect(() => {
    if (!editor || !onReady) return
    const api: EditorApi = {
      insertCapture: ({ text, imageSrc, linkCard }) => {
        const insertLinkCard = (meta: LinkMetadata) => {
          editor
            .chain()
            .focus('end')
            .insertContent(
              linkCardWithTrailingParagraph({
                href: meta.url,
                title: meta.title,
                domain: meta.domain,
              }),
            )
            .run()
        }

        if (linkCard) {
          insertLinkCard(linkCard)
          return
        }
        if (imageSrc) {
          editor
            .chain()
            .focus('end')
            .insertContent({ type: 'image', attrs: { src: imageSrc, width: 280 } })
            .run()
          return
        }
        if (!text) return

        const table = tableContentFromClipboard(text, text)
        if (table) {
          editor.chain().focus('end').insertContent(table).run()
          return
        }

        const trimmed = text.trim()
        // 단일 URL이면 페이지 제목을 조회한 뒤 카드로 넣습니다.
        if (extractSingleUrl(trimmed)) {
          void resolveLinkMetadata(trimmed).then(insertLinkCard)
          return
        }

        const nodes: JSONContent[] = []
        trimmed.split(/\r?\n/).forEach((line) => {
          const lineUrl = extractSingleUrl(line)
          if (lineUrl) {
            // 여러 줄 혼합 시 URL은 호스트명으로 즉시 넣고, 본문은 동기 삽입을 유지합니다.
            nodes.push(
              ...linkCardWithTrailingParagraph({
                href: lineUrl,
                title: new URL(lineUrl).hostname,
                domain: new URL(lineUrl).hostname,
              }),
            )
          } else {
            nodes.push({
              type: 'paragraph',
              content: line ? [{ type: 'text', text: line }] : undefined,
            })
          }
        })
        if (nodes.length) {
          editor.chain().focus('end').insertContent(nodes).run()
        }
      },
      insertDate: () => {
        editor.chain().focus().insertContent(todayLabel() + ' ').run()
      },
      toggleTask: () => {
        editor.chain().focus().toggleTaskList().run()
      },
      focusFind: (query) => {
        if (!query) return
        const findFn = (
          window as unknown as {
            find?: (
              a: string,
              b: boolean,
              c: boolean,
              d: boolean,
              e: boolean,
              f: boolean,
              g: boolean,
            ) => boolean
          }
        ).find
        findFn?.(query, false, false, true, false, true, false)
      },
      getJSON: () => editor.getJSON(),
      getText: () => editor.getText(),
      getCopyText: () => toPlainText(editor.getJSON()),
    }
    onReady(api)
  }, [editor, onReady])

  return (
    <div
      className="memo-editor-shell"
      style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column' }}
    >
      {pinnedPreview ? (
        <div
          className="memo-pinned-header"
          aria-label="상단 고정 문단"
          style={{ color: textColor, background: paperBg, borderColor: paperBorder }}
        >
          <div
            className="memo-editor memo-pinned-preview"
            onClick={(event) => event.preventDefault()}
            dangerouslySetInnerHTML={{ __html: pinnedPreview }}
          />
        </div>
      ) : null}
      <div
        className="memo-scroll-host"
        style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '10px 14px 20px' }}
        onScroll={() => setContextMenu(null)}
      >
        <EditorContent editor={editor} />
      </div>
      {contextMenu ? (
        <div
          className="memo-context-menu"
          role="menu"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            color: textColor,
            background: paperBg,
            borderColor: paperBorder,
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              stickyIndexRef.current = contextMenu.blockIndex
              onStickyChangeRef.current(contextMenu.blockIndex)
              setContextMenu(null)
              requestAnimationFrame(syncPinnedPreview)
            }}
          >
            이 문단을 상단 고정
          </button>
          {stickyBlockIndex > 0 ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                stickyIndexRef.current = 0
                onStickyChangeRef.current(0)
                setContextMenu(null)
                requestAnimationFrame(syncPinnedPreview)
              }}
            >
              상단 고정 해제
            </button>
          ) : null}
        </div>
      ) : null}
      <style>{`
        .memo-editor {
          outline: none;
          min-height: 100%;
          color: ${textColor};
          font-size: ${fontSize}px;
          line-height: 1.55;
          font-family: "Segoe UI Variable", "Malgun Gothic", sans-serif;
          caret-color: ${textColor};
          word-break: break-word;
        }
        .memo-editor p { margin: 0 0 0.4em; }
        .memo-pinned-header {
          flex: 0 1 45%;
          max-height: 45%;
          padding: 8px 14px 6px;
          overflow: auto;
          border-bottom: 1px solid ${paperBorder};
          box-shadow: 0 3px 8px rgba(47, 52, 55, 0.08);
        }
        .memo-pinned-preview {
          min-height: 0;
        }
        .memo-pinned-preview > :first-child {
          margin-top: 0;
        }
        .memo-pinned-preview > :last-child {
          margin-bottom: 0;
        }
        .memo-context-menu {
          position: fixed;
          z-index: 100;
          display: grid;
          min-width: 190px;
          padding: 5px;
          border: 1px solid;
          border-radius: 8px;
          box-shadow: 0 10px 28px rgba(47, 52, 55, 0.2);
        }
        .memo-context-menu button {
          padding: 8px 10px;
          color: inherit;
          font: inherit;
          text-align: left;
          background: transparent;
          border: 0;
          border-radius: 5px;
          cursor: pointer;
        }
        .memo-context-menu button:hover,
        .memo-context-menu button:focus-visible {
          background: rgba(127, 127, 127, 0.14);
          outline: none;
        }
        .memo-editor a.memo-link,
        .memo-editor a {
          color: #1F6C9F;
          text-decoration: underline;
          cursor: pointer;
        }
        .memo-link-card {
          margin: 8px 0;
        }
        .memo-link-card.is-selected .memo-link-card-button {
          outline: 2px solid #1F6C9F;
          outline-offset: 1px;
        }
        .memo-link-card-row {
          display: flex;
          align-items: stretch;
          gap: 2px;
          width: 100%;
        }
        .memo-link-card-button {
          display: flex;
          flex: 1 1 auto;
          min-width: 0;
          flex-direction: column;
          gap: 3px;
          padding: 10px 12px;
          overflow: hidden;
          color: inherit;
          text-align: left;
          background: rgba(255, 255, 255, 0.28);
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 7px;
          cursor: pointer;
        }
        .memo-link-card-gutter {
          flex: 0 0 1ch;
          align-self: stretch;
          user-select: none;
        }
        .memo-link-card-remove {
          flex: 0 0 auto;
          min-width: 1.6em;
          padding: 0 6px;
          color: ${mutedColor};
          font-size: 1.1em;
          line-height: 1;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 6px;
          cursor: pointer;
          opacity: 0.55;
        }
        .memo-link-card-remove:hover {
          color: inherit;
          background: rgba(0, 0, 0, 0.06);
          opacity: 1;
        }
        .memo-link-card-button:hover {
          background: rgba(255, 255, 255, 0.48);
        }
        .memo-link-card-title {
          width: 100%;
          overflow: hidden;
          font-weight: 600;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .memo-link-card-domain {
          width: 100%;
          overflow: hidden;
          color: ${mutedColor};
          font-size: 0.82em;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .memo-img-wrap {
          display: block;
          margin: 8px 0;
          line-height: 0;
        }
        .memo-img-row {
          display: inline-flex;
          align-items: flex-start;
          gap: 2px;
          max-width: 100%;
        }
        .memo-img-box {
          position: relative;
          display: inline-block;
          max-width: calc(100% - 1.8em);
        }
        .memo-img-box.is-selected {
          outline: 2px solid #1F6C9F;
          outline-offset: 2px;
        }
        .memo-img-handle {
          position: absolute;
          right: 0;
          bottom: 0;
          width: 14px;
          height: 14px;
          cursor: nwse-resize;
          background: #2F3437;
          border: 2px solid #fff;
          border-radius: 2px 0 4px 0;
          opacity: 0.85;
        }
        .memo-img-remove {
          flex: 0 0 auto;
          min-width: 1.6em;
          padding: 0 6px;
          color: ${mutedColor};
          font-size: 1.1em;
          line-height: 1.4;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 6px;
          cursor: pointer;
          opacity: 0.55;
        }
        .memo-img-remove:hover {
          color: inherit;
          background: rgba(0, 0, 0, 0.06);
          opacity: 1;
        }
        .memo-editor table {
          width: 100%;
          margin: 0.5em 0;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .memo-editor th,
        .memo-editor td {
          padding: 4px 6px;
          overflow: hidden;
          font-size: inherit;
          text-align: left;
          vertical-align: top;
          word-break: break-word;
          border: 1px solid rgba(47, 52, 55, 0.28);
        }
        .memo-editor ul[data-type="taskList"] {
          list-style: none;
          padding-left: 0;
        }
        .memo-editor ul[data-type="taskList"] li {
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }
        .memo-editor .is-empty::before {
          color: ${mutedColor};
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}
