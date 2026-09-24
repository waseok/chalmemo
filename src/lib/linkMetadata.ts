import { invoke } from '@tauri-apps/api/core'

export interface LinkMetadata {
  url: string
  title: string
  domain: string
}

/** 텍스트 전체가 HTTP(S) URL 하나일 때만 링크 카드 후보로 인정합니다. */
export function extractSingleUrl(text: string): string | null {
  const value = text.trim()
  if (!value || /\s/.test(value)) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null
  } catch {
    return null
  }
}

function normalizedUrl(value: string): string {
  try {
    const parsed = new URL(value)
    parsed.hash = ''
    return parsed.href
  } catch {
    return value
  }
}

/** 브라우저나 문서에서 복사된 HTML 링크의 표시 텍스트를 페이지 제목 후보로 사용합니다. */
export function extractClipboardLinkTitle(html: string, value: string): string | null {
  if (!html || typeof DOMParser === 'undefined') return null
  const document = new DOMParser().parseFromString(html, 'text/html')
  const expected = normalizedUrl(value)
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = normalizedUrl(anchor.href)
    if (href !== expected) continue
    const title = (anchor.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!title || normalizedUrl(title) === expected || title.length > 240) continue
    return title
  }
  return null
}

function usefulQueryLabel(url: URL): string | null {
  const directKeys = ['title', 'name', 'query', 'keyword', 'q']
  for (const key of directKeys) {
    const value = url.searchParams.get(key)?.trim()
    if (value && value.length <= 120 && !/^https?:\/\//i.test(value)) return value
  }

  const nested = url.searchParams.get('utparam-url')
  if (nested) {
    try {
      const parsed = JSON.parse(nested) as Record<string, unknown>
      for (const key of ['title', 'name', 'query', 'keyword']) {
        const value = parsed[key]
        if (typeof value === 'string' && value.trim() && value.length <= 120) {
          return value.trim()
        }
      }
    } catch {
      // JSON이 아닌 추적값이면 다른 후보를 사용합니다.
    }
  }
  return null
}

/** 네트워크 조회가 실패해도 항상 삽입할 수 있는 기본 카드 정보입니다. */
export function fallbackMetadata(value: string, preferredTitle?: string | null): LinkMetadata {
  const url = new URL(value)
  const domain = url.hostname
  return {
    url: value,
    title: preferredTitle?.trim() || usefulQueryLabel(url) || domain,
    domain,
  }
}

export function isGenericLinkTitle(meta: LinkMetadata): boolean {
  const title = meta.title.trim()
  return !title || title === meta.domain || normalizedUrl(title) === normalizedUrl(meta.url)
}

export async function resolveLinkMetadata(
  value: string,
  preferredTitle?: string | null,
): Promise<LinkMetadata> {
  const fallback = fallbackMetadata(value, preferredTitle)
  try {
    const metadata = await invoke<LinkMetadata>('fetch_link_metadata', { url: value })
    return isGenericLinkTitle(metadata) && !isGenericLinkTitle(fallback) ? fallback : metadata
  } catch (error) {
    console.warn('링크 미리보기를 불러오지 못해 기본 카드를 사용합니다.', error)
    return fallback
  }
}
