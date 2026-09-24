import { invoke } from '@tauri-apps/api/core'

/** 붙여넣은 링크를 Windows 기본 브라우저로 열 수 있는 안전한 URL로 정규화합니다. */
export function normalizeExternalUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('열 링크가 없습니다.')

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  const parsed = new URL(candidate)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('http 또는 https 링크만 열 수 있습니다.')
  }
  return parsed.href
}

export async function openExternalUrl(value: string): Promise<void> {
  await invoke('open_external_url', { url: normalizeExternalUrl(value) })
}

export function openExternalUrlInBackground(value: string): void {
  void openExternalUrl(value).catch((error: unknown) => {
    console.error('링크 열기 실패:', error)
    window.alert(`링크를 열지 못했습니다.\n${String(error)}`)
  })
}

export function externalUrlFromTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  const linkTarget = target.closest<HTMLElement>('a[href], [data-external-url]')
  return linkTarget?.dataset.externalUrl ?? linkTarget?.getAttribute('href') ?? null
}
