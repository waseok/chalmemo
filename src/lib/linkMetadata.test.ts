import { extractSingleUrl, fallbackMetadata } from './linkMetadata'

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

assert(
  extractSingleUrl('https://example.com/a') === 'https://example.com/a',
  'URL 하나만 있는 텍스트를 감지해야 합니다.',
)
assert(
  extractSingleUrl('참고 https://example.com') === null,
  '설명이 섞인 텍스트는 링크 카드로 바꾸면 안 됩니다.',
)
assert(
  fallbackMetadata('https://example.com/a').domain === 'example.com',
  '조회 실패 시 URL 호스트를 도메인으로 사용해야 합니다.',
)

console.log('link metadata tests: OK')
