import {
  contentFromPlainTextWithTables,
  parseTableFromHtml,
  parseTableFromPlainText,
  rowsToTableContent,
  tableContentFromClipboard,
} from './tablePaste'

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

{
  const rows = parseTableFromPlainText('이름\t점수\n철수\t90\n영희\t85\n')
  assert(rows?.length === 3, 'TSV는 3행이어야 합니다')
  assert(rows?.[0][0] === '이름' && rows?.[1][1] === '90', 'TSV 셀 값이 맞아야 합니다')
}

{
  const content = contentFromPlainTextWithTables(
    '제목  유치원 과목경정\n1. 관련: 와석초등학교\n구명\t금액\t과목\n로봇 구입\t1,620,000원\t교과활동\n끝.',
  )
  assert(content?.length === 4, '표 앞뒤 본문을 포함한 노드 수가 맞아야 합니다')
  assert(content?.[0].type === 'paragraph', '표 앞의 제목은 문단이어야 합니다')
  assert(content?.[2].type === 'table', '탭 구간만 표여야 합니다')
  assert(content?.[3].type === 'paragraph', '표 뒤의 본문은 문단이어야 합니다')
}

{
  assert(
    contentFromPlainTextWithTables('표가 없는 일반 본문\n둘째 줄') === null,
    '탭이 없는 본문은 기본 붙여넣기에 맡겨야 합니다',
  )
}

{
  assert(parseTableFromPlainText('그냥 한 줄') === null, '탭 없는 텍스트는 표가 아닙니다')
  assert(parseTableFromPlainText('한칸만') === null, '한 열은 표로 보지 않습니다')
}

{
  const html = `
    <html><body>
    <table>
      <tr><th>과목</th><th>점수</th></tr>
      <tr><td>수학</td><td>95</td></tr>
    </table>
    </body></html>
  `
  const rows = parseTableFromHtml(html)
  assert(rows?.length === 2, 'HTML 표는 2행이어야 합니다')
  assert(rows?.[0][0] === '과목' && rows?.[1][1] === '95', 'HTML 셀 값이 맞아야 합니다')
}

{
  const node = tableContentFromClipboard('', 'A\tB\n1\t2')
  assert(node?.type === 'table', '클립보드 TSV는 table 노드여야 합니다')
  const table = rowsToTableContent([
    ['A', 'B'],
    ['1', '2'],
  ])
  assert(table.content?.length === 2, '표 JSON 행 수가 맞아야 합니다')
}

console.log('table paste tests: OK')
