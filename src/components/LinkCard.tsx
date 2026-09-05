/* oxlint-disable react/only-export-components */
import { openUrl } from '@tauri-apps/plugin-opener'
import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'

/** oEmbed 등에서 이스케이프가 남은 제목을 사람이 읽을 수 있는 글자로 바꿉니다. */
export function decodeLinkTitle(value: string): string {
  return value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
}

function LinkCardView({ node, selected, deleteNode }: NodeViewProps) {
  const href = String(node.attrs.href ?? '')
  const title = decodeLinkTitle(String(node.attrs.title ?? href))
  const domain = String(node.attrs.domain ?? '')

  return (
    <NodeViewWrapper className={`memo-link-card${selected ? ' is-selected' : ''}`}>
      <div className="memo-link-card-row">
        <button
          type="button"
          className="memo-link-card-button"
          title={href}
          onClick={() => void openUrl(href)}
        >
          <span className="memo-link-card-title">{title}</span>
          <span className="memo-link-card-domain">{domain}</span>
        </button>
        {/* 카드 옆 클릭·커서용 한 글자 여백 */}
        <span className="memo-link-card-gutter" contentEditable={false} aria-hidden>
          {'\u00a0'}
        </span>
        <button
          type="button"
          className="memo-link-card-remove"
          title="링크 삭제"
          aria-label="링크 삭제"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            deleteNode()
          }}
        >
          ×
        </button>
      </div>
    </NodeViewWrapper>
  )
}

/** URL, 페이지 제목, 도메인을 메모 문서에 함께 보존하는 블록 노드입니다. */
export const LinkCard = Node.create({
  name: 'linkCard',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      href: { default: '' },
      title: { default: '' },
      domain: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-link-card]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-link-card': '',
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(LinkCardView)
  },
})

/** 링크 카드 뒤에 빈 문단을 붙여, 바로 아래에 글을 쓸 수 있게 합니다. */
export function linkCardWithTrailingParagraph(attrs: {
  href: string
  title: string
  domain: string
}) {
  return [
    {
      type: 'linkCard',
      attrs: {
        href: attrs.href,
        title: decodeLinkTitle(attrs.title),
        domain: attrs.domain,
      },
    },
    { type: 'paragraph' },
  ]
}
