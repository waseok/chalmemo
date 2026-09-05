import { tryEvaluateBeforeEquals } from './calc'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

// 기본 곱셈
{
  const r = tryEvaluateBeforeEquals('23*5=')
  assert(r?.result === '115', `23*5= → 115, got ${r?.result}`)
}

// 덧셈·공백
{
  const r = tryEvaluateBeforeEquals('비용 10 + 20=')
  assert(r?.result === '30', `10+20= → 30, got ${r?.result}`)
}

// '=' 뒤에 이미 결과 있으면 null
{
  const r = tryEvaluateBeforeEquals('23*5=115')
  assert(r === null, '이미 결과 있으면 null')
}

// 수식 아님
{
  const r = tryEvaluateBeforeEquals('hello=')
  assert(r === null, '문자만 있으면 null')
}

// 나눗셈·소수점
{
  const r = tryEvaluateBeforeEquals('7/2=')
  assert(r?.result === '3.5', `7/2= → 3.5, got ${r?.result}`)
}

console.log('calc tests: OK')
