import { Parser } from 'expr-eval'

const parser = new Parser({
  operators: {
    add: true,
    concatenate: false,
    conditional: false,
    divide: true,
    factorial: false,
    multiply: true,
    power: true,
    remainder: true,
    subtract: true,
    logical: false,
    comparison: false,
  },
})

/**
 * 커서 앞 텍스트에서 `수식=` 패턴을 찾아 계산합니다.
 * 예: "비용 23*5=" → { start, end, result: "115" }
 * 수식이 아니거나 실패하면 null.
 */
export function tryEvaluateBeforeEquals(
  textBeforeCursor: string,
): { start: number; end: number; result: string } | null {
  // 커서 바로 앞이 '=' 이거나 '=' 뒤에 공백만 있는 경우도 허용하지 않음 — '=' 바로 앞에서만
  const eq = textBeforeCursor.lastIndexOf('=')
  if (eq < 0) return null

  // '=' 뒤에 이미 결과가 있으면 스킵
  const afterEq = textBeforeCursor.slice(eq + 1)
  if (afterEq.trim().length > 0) return null

  // '=' 앞에서 수식 후보를 왼쪽으로 훑습니다.
  let start = eq - 1
  while (start >= 0) {
    const ch = textBeforeCursor[start]
    if (/[0-9+\-*/%^().\s]/.test(ch)) {
      start -= 1
      continue
    }
    break
  }
  start += 1

  const expr = textBeforeCursor.slice(start, eq).trim()
  if (!expr || !/[0-9]/.test(expr)) return null
  // 숫자/연산자만 허용 (보안: eval 금지, expr-eval만 사용)
  if (!/^[0-9+\-*/%^().\s]+$/.test(expr)) return null

  try {
    const value = parser.evaluate(expr)
    if (typeof value !== 'number' || !Number.isFinite(value)) return null
    // 불필요한 소수점 제거
    const result = Number.isInteger(value)
      ? String(value)
      : String(Math.round(value * 1e10) / 1e10)
    return { start, end: eq + 1, result }
  } catch {
    return null
  }
}
