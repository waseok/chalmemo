import type { JSONContent } from '@tiptap/react'

/** 셀 문자열을 TipTap 문단 노드로 만듭니다. */
function cellNode(text: string): JSONContent {
  const trimmed = text.trim()
  return {
    type: 'tableCell',
    content: [
      {
        type: 'paragraph',
        content: trimmed ? [{ type: 'text', text: trimmed }] : undefined,
      },
    ],
  }
}

/** 2차원 배열을 TipTap table JSON으로 바꿉니다. */
export function rowsToTableContent(rows: string[][]): JSONContent {
  const width = Math.max(...rows.map((row) => row.length), 0)
  return {
    type: 'table',
    content: rows.map((row) => {
      const cells = [...row]
      while (cells.length < width) cells.push('')
      return {
        type: 'tableRow',
        content: cells.map(cellNode),
      }
    }),
  }
}

/**
 * 엑셀·구글시트 등에서 복사하면 탭으로 칸이 구분됩니다.
 * 칸이 2개 이상인 행이 있어야 표로 인정합니다.
 */
export function parseTableFromPlainText(text: string): string[][] | null {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.length > 0)
  if (lines.length === 0 || !text.includes('\t')) return null

  const rows = lines.map((line) => line.split('\t').map((cell) => cell.trim()))
  const width = Math.max(...rows.map((row) => row.length))
  if (width < 2) return null
  return rows
}

function decodeEntities(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Word/Excel HTML 조각에서 첫 번째 <table>을 행·열 배열로 읽습니다.
 */
export function parseTableFromHtml(html: string): string[][] | null {
  if (!/<table[\s>]/i.test(html)) return null
  const tableMatch = html.match(/<table[\s\S]*?<\/table>/i)
  const table = tableMatch?.[0] ?? html
  const rowHtmls = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) => m[0])
  const rows = rowHtmls
    .map((row) =>
      [...row.matchAll(/<t[dh][\s\S]*?<\/t[dh]>/gi)].map((cell) => decodeEntities(cell[0])),
    )
    .filter((row) => row.length > 0)
  if (rows.length === 0) return null
  const width = Math.max(...rows.map((row) => row.length))
  if (width < 1) return null
  return rows
}

/** HTML 또는 탭 구분 텍스트에서 표를 찾아 TipTap 노드로 만듭니다. */
export function tableContentFromClipboard(html: string, plain: string): JSONContent | null {
  const rows = parseTableFromHtml(html) ?? parseTableFromPlainText(plain)
  if (!rows) return null
  return rowsToTableContent(rows)
}
