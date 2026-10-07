import { isRestorableWindowBounds } from './windowBounds'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

assert(
  isRestorableWindowBounds({ x: 200, y: 200, width: 380, height: 520 }),
  '정상적인 창 위치와 크기는 저장해야 합니다.',
)
assert(
  !isRestorableWindowBounds({ x: -32000, y: -32000, width: 208, height: 55 }),
  'Windows 최소화 좌표와 축소 크기는 저장하면 안 됩니다.',
)
assert(
  isRestorableWindowBounds({ x: -1920, y: 0, width: 380, height: 520 }),
  '왼쪽 보조 모니터의 정상적인 음수 좌표는 허용해야 합니다.',
)

console.log('window bounds tests: OK')
