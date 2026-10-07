import type { WindowState } from './types'

export const MIN_MAIN_WINDOW_WIDTH = 280
export const MIN_MAIN_WINDOW_HEIGHT = 320

/**
 * Windows는 최소화된 창을 화면 밖(-32000 부근)으로 옮기고 축소된 크기를 보고할 수 있습니다.
 * 그 값을 저장하면 다음 실행부터 창이 보이지 않으므로 정상 복원 가능한 값만 보존합니다.
 */
export function isRestorableWindowBounds(bounds: WindowState): boolean {
  return (
    bounds.x !== null &&
    bounds.y !== null &&
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    bounds.x > -10_000 &&
    bounds.y > -10_000 &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    bounds.width >= MIN_MAIN_WINDOW_WIDTH &&
    bounds.height >= MIN_MAIN_WINDOW_HEIGHT
  )
}
