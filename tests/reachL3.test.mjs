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
      "export { ReachFindingTable, deploymentGroupStarts } from '@/components/ReachFindingTable'",
      "export { compareFindings } from '@/lib/reach'",
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
  assert.match(l3.l3Headline({ reached: 'NONE', regionsChecked: true, startupOnly: false }), /취약 조건 미충족의 근거는 아니에요/)
  assert.match(l3.l3Headline({ reached: 'NOT_RECORDED', regionsChecked: false, startupOnly: false }), /확인하지 못했어요/)
})

test('the headline says when the run does not show the condition of the vulnerability', () => {
  // e.g. a Tomcat line that runs for every response write: the run does not show the AJP connector the rule needs
  assert.match(l3.l3Headline({ reached: 'REGION', regionsChecked: true, startupOnly: false, raiseLimit: 'NONE' }), /판정 근거로 쓰지 않아요/)
  assert.match(l3.l3Headline({ reached: 'REGION', regionsChecked: true, startupOnly: false, raiseLimit: 'UNKNOWN' }), /확인 못 함보다 높이지 않아요/)
  assert.match(l3.l3Headline({ reached: 'REGION', regionsChecked: true, startupOnly: false, raiseLimit: 'REACHABLE' }), /취약 구간이 실제로 실행/)
  assert.match(l3.l3Headline({ reached: 'FUNCTION', regionsChecked: false, startupOnly: false, raiseLimit: 'NONE' }), /판정 근거로 쓰지 않아요/)
  // an older server without the field: the region raises as before
  assert.equal(l3.l3RaiseLimit({ reached: 'REGION', regionsChecked: true, startupOnly: false }), 'REACHABLE')
  assert.equal(l3.l3RaiseLimit({ reached: 'FUNCTION', regionsChecked: false, startupOnly: false }), 'UNKNOWN')
  assert.equal(l3.l3RaiseLimit({ reached: 'NONE', regionsChecked: true, startupOnly: false }), 'NONE')
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

test('an unreachable verdict that L3 contradicts is flagged, nothing else is', () => {
  assert.equal(l3.l3DiffersFromL2('UNREACHABLE', { reached: 'REGION' }), true)
  // the vulnerable function ran but its region could not be checked
  assert.equal(l3.l3DiffersFromL2('UNREACHABLE', { reached: 'FUNCTION', regionsChecked: false }), true)
  assert.equal(l3.l3DiffersFromL2('UNREACHABLE', { reached: 'FUNCTION', regionsChecked: true }), false)
  assert.equal(l3.l3DiffersFromL2('REACHABLE', { reached: 'REGION' }), false)
  assert.equal(l3.l3DiffersFromL2('UNREACHABLE', null), false)
  // the region ran but does not show the condition: the server keeps the verdict on purpose, nothing to flag
  assert.equal(l3.l3DiffersFromL2('UNREACHABLE', { reached: 'REGION', raiseLimit: 'NONE' }), false)
  assert.equal(l3.l3DiffersFromL2('UNREACHABLE', { reached: 'REGION', raiseLimit: 'UNKNOWN' }), true)
})

test('a verdict L3 raised before the limits of the rule data is told apart', () => {
  const raised = { order: 2, kind: 'RUNTIME', summary: 'L3: ...', l2Status: 'UNREACHABLE' }
  // CVE-2026-103119 raised to reachable by the old rule: now the run is no evidence, the next scan puts it back
  assert.equal(l3.l3RaiseOutdated('REACHABLE', { reached: 'REGION', regionsChecked: true, raiseLimit: 'NONE' }, raised), 'UNREACHABLE')
  assert.equal(l3.l3RaiseOutdated('REACHABLE', { reached: 'REGION', regionsChecked: true, raiseLimit: 'UNKNOWN' }, raised), 'UNKNOWN')
  // raised as far as the limit allows now
  assert.equal(l3.l3RaiseOutdated('REACHABLE', { reached: 'REGION', regionsChecked: true, raiseLimit: 'REACHABLE' }, raised), undefined)
  assert.equal(l3.l3RaiseOutdated('UNKNOWN', { reached: 'REGION', regionsChecked: true, raiseLimit: 'UNKNOWN' }, raised), undefined)
  // not raised by L3
  assert.equal(l3.l3RaiseOutdated('REACHABLE', { reached: 'REGION', regionsChecked: true, raiseLimit: 'NONE' }, undefined), undefined)
})

test('a verdict raised by L3 shows the tag and the L2 verdict it replaced', () => {
  const runtime = { order: 2, kind: 'RUNTIME', summary: 'L3: ...', executed: true, reached: 'REGION', regionsChecked: true,
    startupOnly: false, l2Status: 'UNREACHABLE' }
  assert.equal(l3.l3Raise([{ order: 1, kind: 'NOTE', summary: 'x' }]), undefined)
  assert.equal(l3.l3Raise([{ order: 1, kind: 'NOTE', summary: 'x' }, runtime]), runtime)

  const detail = l3.sampleReachFinding(8)
  const raised = { ...detail, verdict: { ...detail.verdict, status: 'REACHABLE', evidence: [...detail.verdict.evidence, runtime] },
    l3: region }
  const html = renderToStaticMarkup(createElement(l3.ReachFindingDetailView, { detail: raised }))
  assert.match(html, />L3로 올림</)
  assert.match(html, /L3가 실제 실행을 확인해 판정을 올렸어요\(코드 분석 L2 판정: 취약 조건 미충족\)/)
  assert.doesNotMatch(html, /≠ 판정/)
  assert.doesNotMatch(renderToStaticMarkup(createElement(l3.ReachFindingDetailView, { detail })), /L3로 올림/)
})

test('the list sends the l3 filter and the table shows the level next to the verdict', () => {
  const filter = { status: ['UNREACHABLE'], severity: [], reviewState: [], deployment: [], cveContains: '', l3: ['REGION', 'FUNCTION'] }
  assert.match(l3.reachFindingQuery(filter, null), /l3=REGION%2CFUNCTION/)
  assert.doesNotMatch(l3.reachFindingQuery({ ...filter, l3: [] }, null), /l3=/)

  const items = l3.sampleReachFindings({ status: [], severity: [], reviewState: [], deployment: [], cveContains: '' }, null, 3).items
  items[0] = { ...items[0], verdict: { ...items[0].verdict, status: 'UNREACHABLE' }, l3: { reached: 'REGION', regionsChecked: true, startupOnly: false } }
  items[1] = { ...items[1], l3: { reached: 'FUNCTION', regionsChecked: false, startupOnly: true } }
  const html = renderToStaticMarkup(createElement(l3.ReachFindingTable, { items, onSelect: () => {} }))
  assert.match(html, /<th[^>]*>실행 상태<\/th>/)
  assert.match(html, /reach-l3 region[^>]*>구간 실행</)
  assert.match(html, /≠ 판정/)
  assert.match(html, /reach-l3 function[^>]*title="[^"]*기동 중에만[^"]*"[^>]*>함수까지 실행</)
  // the third row has no L3 result: a dash, not "no run"
  assert.equal((html.match(/이 이미지를 띄워 본 결과가 없어요/g) ?? []).length, 1)
})

test('running images come first and the table marks where the deployment changes', () => {
  const sample = l3.sampleReachFindings({ status: [], severity: [], reviewState: [], deployment: [], cveContains: '' }, null, 3).items
  const row = (item, id, deployment, status) => ({ ...item, id, deployment, verdict: { ...item.verdict, status } })
  const items = [
    row(sample[0], 1, 'NOT_RUNNING', 'REACHABLE'),
    row(sample[1], 2, 'UNKNOWN', 'REACHABLE'),
    row(sample[2], 3, 'RUNNING', 'UNREACHABLE'),
  ].sort(l3.compareFindings)
  assert.deepEqual(items.map((item) => item.id), [3, 2, 1])
  assert.deepEqual([...l3.deploymentGroupStarts(items)], [3, 2, 1])

  const html = renderToStaticMarkup(createElement(l3.ReachFindingTable, { items, onSelect: () => {} }))
  assert.equal((html.match(/reach-group-row/g) ?? []).length, 3)
  assert.match(html, /colSpan="5"|colspan="5"/)
  assert.ok(html.indexOf('지금 돌고 있는 이미지') < html.indexOf('실행 여부를 모르는 대상'))

  // one deployment only (a single scan, or the deployment filter): no group rows
  const same = items.map((item) => ({ ...item, deployment: 'RUNNING' }))
  assert.equal(l3.deploymentGroupStarts(same).size, 0)
  assert.doesNotMatch(renderToStaticMarkup(createElement(l3.ReachFindingTable, { items: same, onSelect: () => {} })), /reach-group-row/)
})

test('the detail shows the request, the functions, the executed lines and the run', () => {
  const html = renderToStaticMarkup(createElement(l3.ReachL3Section, { l3: region }))
  assert.match(html, /취약 구간이 실제로 실행됐어요/)
  assert.match(html, /조건을 보여 주는 만큼만 서버가 판정을 올려요/)
  assert.match(html, /<code>POST \/api\/v1\/listings<\/code>/)
  assert.match(html, /price as text/)
  assert.match(html, /NumberInput\.looksLikeValidNumber/)
  assert.match(html, /취약 구간 626~627줄 · 실행됨 \(626, 627줄\)/)
  assert.match(html, /시나리오 2026-11-18\.1/)
  assert.match(html, /abc57ee51d27…/)
  assert.match(html, /KAKAO_STUB/)
  assert.match(html, /MAIL_ENABLED \(꺼짐\)/)
})

test('a result matched again from a kept record says the app was not run again', () => {
  const again = renderToStaticMarkup(createElement(l3.ReachL3Section, { l3: { ...region, run: { ...run, scanId: 12, rematch: true } } }))
  assert.match(again, /앱을 다시 띄운 것이 아니에요/)
  assert.match(again, /검사 #12에서 지금의 판정 데이터로 다시 대조/)
  assert.doesNotMatch(renderToStaticMarkup(createElement(l3.ReachL3Section, { l3: region })), /다시 띄운 것이 아니에요/)
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
  assert.match(html, /<dt>실제 실행 기록<\/dt>/)
  const withL3 = renderToStaticMarkup(createElement(l3.ReachFindingDetailView, { detail: { ...detail, l3: region } }))
  assert.match(withL3, /<dt>실제 실행 기록<\/dt><dd><span class="badge reach-l3 region"/)
})
