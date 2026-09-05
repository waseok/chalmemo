import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import type { JSONContent } from '@tiptap/react'

/** TipTap JSON → 일반 텍스트 */
export function toPlainText(doc: JSONContent): string {
  const parts: string[] = []

  const walk = (node?: JSONContent) => {
    if (!node) return
    if (node.type === 'text' && node.text) {
      parts.push(node.text)
      return
    }
    if (node.type === 'hardBreak') {
      parts.push('\n')
      return
    }
    if (node.type === 'image') {
      parts.push('[이미지]')
      return
    }
    if (node.content) node.content.forEach(walk)
    if (
      node.type === 'paragraph' ||
      node.type === 'heading' ||
      node.type === 'listItem' ||
      node.type === 'taskItem' ||
      node.type === 'blockquote'
    ) {
      parts.push('\n')
    }
  }

  walk(doc)
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim()
}

/** TipTap JSON → 마크다운 (간단 변환) */
export function toMarkdown(doc: JSONContent): string {
  const lines: string[] = []

  const inline = (nodes?: JSONContent[]): string => {
    if (!nodes) return ''
    return nodes
      .map((n) => {
        if (n.type === 'text') {
          let t = n.text ?? ''
          const marks = n.marks ?? []
          for (const m of marks) {
            if (m.type === 'bold') t = `**${t}**`
            if (m.type === 'italic') t = `*${t}*`
            if (m.type === 'code') t = `\`${t}\``
            if (m.type === 'link') t = `[${t}](${m.attrs?.href ?? ''})`
          }
          return t
        }
        if (n.type === 'hardBreak') return '\n'
        if (n.type === 'image') return `![image](${n.attrs?.src ?? ''})`
        return inline(n.content)
      })
      .join('')
  }

  const walkBlock = (node: JSONContent) => {
    switch (node.type) {
      case 'paragraph':
        lines.push(inline(node.content))
        lines.push('')
        break
      case 'heading': {
        const level = Number(node.attrs?.level ?? 1)
        lines.push(`${'#'.repeat(level)} ${inline(node.content)}`)
        lines.push('')
        break
      }
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        node.content?.forEach((item) => {
          const checked = item.attrs?.checked
          const prefix =
            node.type === 'taskList'
              ? `- [${checked ? 'x' : ' '}] `
              : node.type === 'orderedList'
                ? '1. '
                : '- '
          lines.push(prefix + inline(item.content))
        })
        lines.push('')
        break
      case 'image':
        lines.push(`![image](${node.attrs?.src ?? ''})`)
        lines.push('')
        break
      default:
        node.content?.forEach(walkBlock)
    }
  }

  doc.content?.forEach(walkBlock)
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

export async function exportTxt(title: string, doc: JSONContent) {
  const path = await save({
    defaultPath: `${title || 'memo'}.txt`,
    filters: [{ name: 'Text', extensions: ['txt'] }],
  })
  if (!path) return
  await writeTextFile(path, toPlainText(doc))
}

export async function exportMd(title: string, doc: JSONContent) {
  const path = await save({
    defaultPath: `${title || 'memo'}.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })
  if (!path) return
  await writeTextFile(path, toMarkdown(doc))
}

export function exportPdf() {
  // Windows "Microsoft Print to PDF" 인쇄 대화상자 사용
  window.print()
}
