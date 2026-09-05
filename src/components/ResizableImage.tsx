/* oxlint-disable react/only-export-components */
import type { MouseEvent as ReactMouseEvent } from 'react'
import Image from '@tiptap/extension-image'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { useCallback, useRef } from 'react'

/** 모서리 드래그로 가로 크기를 조절하는 이미지 노드 뷰 */
function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const width = (node.attrs.width as number | null) ?? null

  const onResizeStart = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const startWidth =
        imgRef.current?.getBoundingClientRect().width ??
        (typeof width === 'number' ? width : 240)

      const onMove = (ev: MouseEvent) => {
        const next = Math.round(Math.min(Math.max(80, startWidth + (ev.clientX - startX)), 1200))
        updateAttributes({ width: next })
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [updateAttributes, width],
  )

  return (
    <NodeViewWrapper className="memo-img-wrap" data-drag-handle>
      <span
        className={`memo-img-box${selected ? ' is-selected' : ''}`}
        style={{ width: width ? `${width}px` : 'auto', maxWidth: '100%' }}
      >
        <img
          ref={imgRef}
          src={node.attrs.src as string}
          alt={(node.attrs.alt as string) || ''}
          style={{
            width: width ? '100%' : 'auto',
            maxWidth: '100%',
            height: 'auto',
            display: 'block',
            borderRadius: 4,
          }}
          draggable={false}
        />
        <span
          className="memo-img-handle"
          title="드래그해서 크기 조절"
          onMouseDown={onResizeStart}
        />
      </span>
    </NodeViewWrapper>
  )
}

export const ResizableImage = Image.extend({
  name: 'image',
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const w = element.getAttribute('width') || element.style.width
          if (!w) return null
          const n = parseInt(String(w), 10)
          return Number.isFinite(n) ? n : null
        },
        renderHTML: (attributes) => {
          if (!attributes.width) return {}
          return {
            width: attributes.width,
            style: `width: ${attributes.width}px; max-width: 100%; height: auto;`,
          }
        },
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },
}).configure({
  inline: false,
  allowBase64: true,
})
