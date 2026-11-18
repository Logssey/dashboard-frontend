import assert from 'node:assert/strict'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { build } from 'esbuild'

const bundled = await build({
  stdin: {
    contents: [
      "export * from '@/lib/reachL3'",
      "export { ReachL3Section } from '@/components/ReachL3Section'",
      "export { ReachL3Badge } from '@/components/ReachBadges'",
      "export { ReachFindingTable } from '@/components/ReachFindingTable'",
      "export { ReachFindingDetailView } from '@/components/ReachFindingDrawer'",
      "export { sampleReachFinding, sampleReachFindings } from '@/api/reachSample'",
      "export { reachFindingQuery } from '@/api/reach'",
    ].join('\n'),
    resolveDir: resolve('.'),
    loader: 'ts',
  },
  loader: { '.css': 'empty' },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  packages: 'external',
  alias: { '@': resolve('src') },
})
const bundlePath = resolve('node_modules/.reach-l3-test.mjs')
await writeFile(bundlePath, bundled.outputFiles[0].contents)
const l3 = await import(pathToFileURL(bundlePath).href)
after(() => unlink(bundlePath))

const run = {
  scanId: 7,
  scenario: '2026-11-18.1',
  observationMethod: 'COVERAGE',
  observedAt: '2026-11-18T13:01:58Z',
  build: { imageDigest: 'sha256:abc57ee51d2702ba23d42223a8e2a2586dd576aaf401c02d9915c5eb2e206c9f' },
  configKeys: [
    { name: 'KAKAO_STUB', enabled: true },
    { name: 'MAIL_ENABLED', enabled: false },
  ],
  invocations: [
    { segment: '001', name: 'categories', request: 'GET /api/v1/categories', count: 1 },
    { segment: '002', name: 'create listing', request: 'POST /api/v1/listings', count: 22 },
    { segment: '003', name: 'price as text', request: 'POST /api/v1/listings', count: 1 },
  ],
}
const region = {
  reached: 'REGION',
  regionsChecked: true,
  startupOnly: false,
  during: ['003'],
  functions: [
    { function: 'tools.jackson.core.io.NumberInput#looksLikeValidNumber(Ljava/lang/String;)Z', during: ['003'] },
    { function: 'tools.jackson.databind.deser.jdk.NumberDeserializers$BigDecimalDeserializer#deserialize', during: ['002', '003'] },
  ],
  regions: [
    { class: 'tools.jackson.core.io.NumberInput', method: 'looksLikeValidNumber', lines: [[626, 627]], executedLines: [626, 627], executed: true, during: ['003'] },
  ],
  run,
}

test('the headline says how far the run got and never calls "no run" unreachable', () => {
  assert.match(l3.l3Headline({ reached: 'REGION', regionsChecked: true, startupOnly: false }), /취약 구간이 실제로 실행/)
  assert.match(l3.l3Headline({ reached: 'FUNCTION', regionsChecked: true, startupOnly: false }), /취약 구간은 실행되지 않았어요/)
  assert.match(l3.l3Headline({ reached: 'FUNCTION', regionsChecked: false, startupOnly: false }), /확인하지 못했어요/)
  assert.match(l3.l3Headline({ reached: 'FUNCTION', regionsChecked: false, startupOnly: true }), /앱이 뜨는 동안에만/)
  assert.match(l3.l3Headline({ reached: 'NONE', regionsChecked: true, startupOnly: false }), /도달 불가의 근거는 아니에요/)
  assert.match(l3.l3Headline({ reached: 'NOT_RECORDED', regionsChecked: false, startupOnly: false }), /확인하지 못했어요/)
})

test('segments become the requests of that run', () => {
  assert.deepEqual(l3.l3Requests(['startup', '002', '009'], run), [
    { segment: 'startup', name: '앱 기동 중' },
    { segment: '002', name: 'create listing', request: 'POST /api/v1/listings', count: 22 },
    { segment: '009', name: '구간 009' },
  ])
  assert.equal(l3.l3RequestSummary(['003'], run), '시나리오 3단계 중 1단계')
  assert.equal(l3.l3RequestSummary(['001', '002', '003'], run), '시나리오 3단계 모두')
  assert.equal(l3.l3RequestSummary(['startup', '001', '002', '003'], run), '시나리오 3단계 모두 + 앱 기동 중')
  assert.equal(l3.l3RequestSummary(['startup'], run), '앱 기동 중에만')
  assert.equal(l3.l3RequestSummary([], run), '없음')
  assert.equal(l3.l3RequestSummary(null, null), '없음')
})

test('names are shortened for reading', () => {
  assert.equal(l3.shortFunction('tools.jackson.core.io.NumberInput#looksLikeValidNumber(Ljava/lang/String;)Z'), 'NumberInput.looksLikeValidNumber')
  assert.equal(l3.shortFunction('a.b.Outer$Inner#run'), 'Outer$Inner.run')
  assert.equal(l3.shortPathStep('com.reused.common.pagination.CursorCodec.decode(Ljava/lang/String;)Ljava/lang/Object;'), 'CursorCodec.decode')
  assert.equal(l3.l3RegionText({ lines: [[626, 627], [639, 639]] }), '626~627줄, 639줄')
  assert.equal(l3.l3RegionText({ wholeMethod: true }), '메서드 전체')
  assert.equal(l3.l3PathText({ reachedStep: 2, of: 5 }), '5단계 중 2단계까지 실행')
  assert.match(l3.l3PathText({ reachedStep: 0, of: 15 }), /진입점이 실행되지 않음/)
})

test('L2 unreachable with an executed region is flagged, nothing else is', () => {
  assert.equal(l3.l3DiffersFromL2('UNREACHABLE', { reached: 'REGION' }), true)
  assert.equal(l3.l3DiffersFromL2('UNREACHABLE', { reached: 'FUNCTION' }), false)
  assert.equal(l3.l3DiffersFromL2('REACHABLE', { reached: 'REGION' }), false)
  assert.equal(l3.l3DiffersFromL2('UNREACHABLE', null), false)
})

test('the list sends the l3 filter and the table shows the level next to the verdict', () => {
  const filter = { status: ['UNREACHABLE'], severity: [], reviewState: [], deployment: [], cveContains: '', l3: ['REGION', 'FUNCTION'] }
  assert.match(l3.reachFindingQuery(filter, null), /l3=REGION%2CFUNCTION/)
  assert.doesNotMatch(l3.reachFindingQuery({ ...filter, l3: [] }, null), /l3=/)

  const items = l3.sampleReachFindings({ status: [], severity: [], reviewState: [], deployment: [], cveContains: '' }, null, 3).items
  items[0] = { ...items[0], verdict: { ...items[0].verdict, status: 'UNREACHABLE' }, l3: { reached: 'REGION', regionsChecked: true, startupOnly: false } }
  items[1] = { ...items[1], l3: { reached: 'FUNCTION', regionsChecked: false, startupOnly: true } }
  const html = renderToStaticMarkup(createElement(l3.ReachFindingTable, { items, onSelect: () => {} }))
  assert.match(html, /<th[^>]*>실행<\/th>/)
  assert.match(html, /reach-l3 region[^>]*>실행 확인</)
  assert.match(html, /≠ 판정/)
  assert.match(html, /reach-l3 function[^>]*title="[^"]*기동 중에만[^"]*"[^>]*>함수까지 실행</)
  // the third row has no L3 result: a dash, not "no run"
  assert.equal((html.match(/이 이미지를 띄워 본 결과가 없어요/g) ?? []).length, 1)
})

test('the detail shows the request, the functions, the executed lines and the run', () => {
  const html = renderToStaticMarkup(createElement(l3.ReachL3Section, { l3: region }))
  assert.match(html, /취약 구간이 실제로 실행됐어요/)
  assert.match(html, /판정과 검토는 이 결과로 바뀌지 않아요/)
  assert.match(html, /<code>POST \/api\/v1\/listings<\/code>/)
  assert.match(html, /price as text/)
  assert.match(html, /NumberInput\.looksLikeValidNumber/)
  assert.match(html, /취약 구간 626~627줄 · 실행됨 \(626, 627줄\)/)
  assert.match(html, /시나리오 2026-11-18\.1/)
  assert.match(html, /abc57ee51d27…/)
  assert.match(html, /KAKAO_STUB/)
  assert.match(html, /MAIL_ENABLED \(꺼짐\)/)
})

test('a function-level result, an unchecked region and an L2 path are spelled out', () => {
  const functionOnly = {
    reached: 'FUNCTION',
    regionsChecked: true,
    startupOnly: false,
    during: ['startup', '001', '002', '003'],
    functions: [{ function: 'org.apache.catalina.realm.RealmBase#findSecurityConstraints', during: ['startup', '001', '002', '003'] }],
    regions: [{ class: 'org.apache.catalina.realm.RealmBase', method: 'findSecurityConstraints', lines: [[639, 639]], executedLines: [], executed: false, during: [] }],
    paths: [
      { target: 'a.B#far', reachedStep: 0, of: 9 },
      { target: 'a.B#near', reachedStep: 2, of: 3, steps: [
        { method: 'com.app.Ctl.list()V', executed: true },
        { method: 'java.util.ArrayList.forEach(Ljava/util/function/Consumer;)V', executed: null },
        { method: 'a.B.near()V', executed: false },
      ] },
    ],
    run,
  }
  const html = renderToStaticMarkup(createElement(l3.ReachL3Section, { l3: functionOnly }))
  assert.match(html, /취약 함수까지 실행됐고, 취약 구간은 실행되지 않았어요/)
  assert.match(html, /시나리오 3단계 모두 \+ 앱 기동 중/)
  assert.match(html, /취약 구간 639줄 · 실행 안 됨/)
  assert.ok(html.indexOf('B.near') < html.indexOf('B.far'), 'the path that got further comes first')
  assert.match(html, /3단계 중 2단계까지 실행/)
  assert.match(html, /ArrayList\.forEach<\/code><span class="caption"> 확인 못 함/)

  const unchecked = { ...functionOnly, reached: 'NOT_RECORDED', regionsChecked: false, during: [], functions: [], paths: [],
    regions: [{ class: 'a.B', method: 'm', wholeMethod: true, executed: false, during: [], unchecked: 'NO_CLASS_FILE' }] }
  assert.match(renderToStaticMarkup(createElement(l3.ReachL3Section, { l3: unchecked })), /확인 못 함 — 클래스 파일이 없어요/)
})

test('without an L3 result the detail says so and the verdict band shows a dash', () => {
  assert.match(renderToStaticMarkup(createElement(l3.ReachL3Section, { l3: null })), /띄워 시나리오를 보낸 결과가 없어요/)
  const detail = l3.sampleReachFinding(8)
  const html = renderToStaticMarkup(createElement(l3.ReachFindingDetailView, { detail }))
  assert.match(html, /<dt>실행\(L3\)<\/dt>/)
  const withL3 = renderToStaticMarkup(createElement(l3.ReachFindingDetailView, { detail: { ...detail, l3: region } }))
  assert.match(withL3, /<dt>실행\(L3\)<\/dt><dd><span class="badge reach-l3 region"/)
})
