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

/** 네트워크 조회가 실패해도 항상 삽입할 수 있는 기본 카드 정보입니다. */
export function fallbackMetadata(value: string): LinkMetadata {
  const url = new URL(value)
  return {
    url: value,
    title: url.hostname,
    domain: url.hostname,
  }
}

export async function resolveLinkMetadata(value: string): Promise<LinkMetadata> {
  try {
    return await invoke<LinkMetadata>('fetch_link_metadata', { url: value })
  } catch (error) {
    console.warn('링크 미리보기를 불러오지 못해 기본 카드를 사용합니다.', error)
    return fallbackMetadata(value)
  }
}
