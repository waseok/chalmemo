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
assert(
  fallbackMetadata(
    'https://item.gmarket.co.kr/Item?utparam-url=%7B%22query%22%3A%22%EB%A7%A5%EC%84%B8%EC%9D%B4%ED%94%84%20%EC%82%BC%EA%B0%81%EB%8C%80%22%7D',
  ).title === '맥세이프 삼각대',
  '페이지 조회를 차단하는 쇼핑몰 링크는 URL의 검색어를 제목 후보로 사용해야 합니다.',
)
assert(
  fallbackMetadata('https://example.com/a', '복사한 페이지 제목').title ===
    '복사한 페이지 제목',
  '클립보드에 표시 제목이 있으면 그 제목을 우선 사용해야 합니다.',
)

console.log('link metadata tests: OK')
