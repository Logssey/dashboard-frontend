import assert from 'node:assert/strict'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { build } from 'esbuild'

const bundled = await build({
  stdin: {
    contents: [
      "export * from '@/lib/reach'",
      "export * from '@/api/reachSample'",
      "export { ReachSummaryView } from '@/components/ReachSummaryView'",
      "export { ReachFindingDetailView } from '@/components/ReachFindingDrawer'",
      "export { ReachReviewForm } from '@/components/ReachReviewForm'",
      "export { reachEvidenceText } from '@/components/ReachFindingTable'",
      "export { VulnerabilitySummaryPage, VulnerabilityFindingsPage } from '@/pages/VulnerabilitiesPage'",
      "export { AppLayout } from '@/layout/AppLayout'",
      "export { ME_QUERY_KEY } from '@/layout/useMe'",
      "export { isVulnerabilityPath } from '@/lib/reachRoutes'",
      "export { ApiError } from '@/api/client'",
      "export { isMissingEndpoint } from '@/api/reach'",
      "export { labelOf, reachNotAnalyzedReasonLabel } from '@/lib/reachLabels'",
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
const bundlePath = resolve('node_modules/.reach-test.mjs')
await writeFile(bundlePath, bundled.outputFiles[0].contents)
const reach = await import(pathToFileURL(bundlePath).href)
after(() => unlink(bundlePath))

const noFilter = { status: [], severity: [], reviewState: [], deployment: [], cveContains: '' }

test('nearest fixed version is the smallest fixed version above the installed one', () => {
  assert.equal(reach.nearestFixedVersion('1.81', ['1.80.2', '1.81.1', '1.84']), '1.81.1')
  assert.equal(reach.nearestFixedVersion('11.0.24', ['11.0.25', '10.1.58', '9.0.121']), '11.0.25')
  assert.equal(reach.nearestFixedVersion('2.21.5', ['2.18.11', '2.21.7', '2.22.3']), '2.21.7')
  assert.equal(reach.nearestFixedVersion('1.6.58-r1', ['1.6.59-r0']), '1.6.59-r0')
  assert.equal(reach.nearestFixedVersion('3.1.7', ['3.1.6']), null)
})

test('package group comes from the purl namespace', () => {
  assert.equal(reach.packageGroup('pkg:maven/org.bouncycastle/bcprov-jdk18on@1.81'), 'org.bouncycastle')
  assert.equal(reach.packageGroup('pkg:apk/alpine/zlib@1.3.2-r0'), 'alpine')
})

test('sample summary matches the API-08 example (23 rows)', () => {
  const summary = reach.sampleReachSummary()
  assert.equal(summary.totals.findings, 23)
  assert.deepEqual(summary.byStatus, { REACHABLE: 0, UNKNOWN: 0, UNREACHABLE: 14, NOT_ANALYZED: 9 })
  assert.deepEqual(summary.byNotAnalyzedReason, { UNANALYZED_COPY: 7, OS_PACKAGE: 2, NO_VULN_FUNCTION_DATA: 0, UNSUPPORTED_ECOSYSTEM: 0 })
  assert.deepEqual(summary.bySeverity, { CRITICAL: 5, HIGH: 11, MEDIUM: 7, LOW: 0, UNKNOWN: 0 })
  assert.deepEqual(summary.byMethod, { CALLGRAPH: 5, RULE: 9, MANUAL: 0 })
  assert.deepEqual(summary.byReviewState, { UNREVIEWED: 9, PROVISIONAL: 1, CONFIRMED: 13 })
  assert.deepEqual(summary.noiseReduction, { unreachable: 14, judged: 14, ratio: 1 })
  assert.deepEqual(summary.coverage, { judged: 14, total: 23, ratio: 0.609 })
  assert.deepEqual(summary.severityByStatus, {
    CRITICAL: { UNREACHABLE: 5 },
    HIGH: { UNREACHABLE: 6, NOT_ANALYZED: 5 },
    MEDIUM: { UNREACHABLE: 3, NOT_ANALYZED: 4 },
  })
})

test('summary counts equal the list count under the same filter (FR-12 acceptance 5)', () => {
  const summary = reach.sampleReachSummary()
  for (const status of ['REACHABLE', 'UNKNOWN', 'UNREACHABLE', 'NOT_ANALYZED']) {
    const page = reach.sampleReachFindings({ ...noFilter, status: [status] }, null, 50)
    assert.equal(page.totalCount, summary.byStatus[status], status)
    for (const severity of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']) {
      const cell = reach.sampleReachFindings({ ...noFilter, status: [status], severity: [severity] }, null, 50)
      assert.equal(cell.totalCount, reach.matrixCell(summary, status, severity), `${status} ${severity}`)
    }
  }
})

test('default sort keeps the SCR-02 example order and copies stay separate rows', () => {
  const page = reach.sampleReachFindings(noFilter, null, 50)
  assert.deepEqual(page.items.map((item) => item.id), Array.from({ length: 23 }, (_, index) => index + 1))
  assert.equal(page.hasNext, false)
  const copies = reach.sampleReachFindings({ ...noFilter, cveContains: '89407' }, null, 50)
  assert.equal(copies.totalCount, 2)
})

test('cursor paging returns the rest of the rows', () => {
  const first = reach.sampleReachFindings(noFilter, null, 10)
  assert.equal(first.items.length, 10)
  assert.equal(first.hasNext, true)
  const second = reach.sampleReachFindings(noFilter, first.nextCursor, 50)
  assert.equal(second.items.length, 13)
  assert.equal(second.hasNext, false)
})

test('summary view shows fractions and reasons and never calls results safe', () => {
  const html = renderToStaticMarkup(createElement(reach.ReachSummaryView, { summary: reach.sampleReachSummary(), onOpen: () => {} }))
  assert.match(html, /14\/23/)
  assert.match(html, /14\/14/)
  assert.match(html, /판정하지 않은 사본 7 · OS 패키지 2/)
  assert.match(html, /모두 도달 불가/)
  assert.doesNotMatch(html, /안전|해결됨/)
  assert.doesNotMatch(html, /%/)
})

test('copy rows show the pending proposal next to the reason', () => {
  const copy = reach.sampleReachFindings({ ...noFilter, cveContains: '89407', status: ['NOT_ANALYZED'] }, null, 50).items[0]
  const text = reach.reachEvidenceText(copy)
  assert.match(text, /^판정하지 않은 사본/)
  assert.match(text, /제안\(확정 대기\): 도달 불가/)
})

test('detail view lists facts used for the verdict before informational facts', () => {
  const html = renderToStaticMarkup(createElement(reach.ReachFindingDetailView, { detail: reach.sampleReachFinding(8) }))
  assert.ok(html.indexOf('F-dto.floating.tokens') < html.indexOf('F-dto.floating.any'))
  assert.match(html, /참고/)
  assert.match(html, /후보 경로, 실제와 다를 수 있음/)
  assert.match(html, /결정 전\(팀 결정\)/)
})

/** 요약·목록 응답을 캐시에 넣어 둔 QueryClient. sample은 "예시 값으로 대신 그렸는지" */
function seededClient({ summarySample, listSample }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(['reach-summary'], { data: reach.sampleReachSummary(), sample: summarySample })
  client.setQueryData(['reach-findings', noFilter], {
    pages: [{ data: reach.sampleReachFindings(noFilter, null, 50), sample: listSample }],
    pageParams: [null],
  })
  return client
}

function renderAt(client, component, url) {
  return renderToStaticMarkup(createElement(QueryClientProvider, { client },
    createElement(MemoryRouter, { initialEntries: [url] }, createElement(component))))
}

test('summary and finding list are separate pages without in-page tabs', () => {
  const client = seededClient({ summarySample: true, listSample: true })

  const summaryHtml = renderAt(client, reach.VulnerabilitySummaryPage, '/vulnerabilities')
  assert.match(summaryHtml, /실제 판정 결과가 아니에요/)
  assert.match(summaryHtml, /<strong>요약<\/strong>/)
  assert.match(summaryHtml, /상태 × 심각도/)
  assert.doesNotMatch(summaryHtml, /class="tabs"/)

  const findingsHtml = renderAt(client, reach.VulnerabilityFindingsPage, '/vulnerabilities/findings')
  assert.match(findingsHtml, /<strong>상태별 개수, Finding 목록<\/strong>/)
  assert.match(findingsHtml, /23건 중 23건 표시/)
  assert.match(findingsHtml, /CVE-2026-85091/)
  assert.doesNotMatch(findingsHtml, /더 보기/)
  assert.doesNotMatch(findingsHtml, /class="tabs"/)
})

test('notice names only the parts that are still sample data', () => {
  // 요약 API는 붙었고 목록 API는 아직 없는 상황
  const client = seededClient({ summarySample: false, listSample: true })
  assert.doesNotMatch(renderAt(client, reach.VulnerabilitySummaryPage, '/vulnerabilities'), /실제 판정 결과가 아니에요/)
  assert.match(renderAt(client, reach.VulnerabilityFindingsPage, '/vulnerabilities/findings'), /<strong>Finding 목록<\/strong>/)
})

test('sidebar opens 요약 and Finding 목록 under 취약점 관리 only while inside it', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(reach.ME_QUERY_KEY, { userId: 1, displayName: 'Security Admin', role: 'ADMIN' })

  const inside = renderAt(client, reach.AppLayout, '/vulnerabilities/findings')
  assert.match(inside, /class="nav-link active" href="\/vulnerabilities"/)
  assert.match(inside, /class="nav-link sub" href="\/vulnerabilities"[^>]*>요약</)
  // NavLink가 active를 한 번 더 붙인다 (인프라·시크릿 하위 메뉴와 같음)
  assert.match(inside, /class="nav-link sub active[^"]*" href="\/vulnerabilities\/findings"[^>]*>Finding 목록</)
  assert.match(inside, /<span>Finding 목록<\/span>/) // 상단 바 제목

  const outside = renderAt(client, reach.AppLayout, '/overview')
  assert.doesNotMatch(outside, /href="\/vulnerabilities\/findings"/)
  assert.equal(reach.isVulnerabilityPath('/vulnerabilities/findings'), true)
  assert.equal(reach.isVulnerabilityPath('/vulnerabilitiesx'), false)
})

test('only a body-less 404 (missing endpoint) falls back to sample data', () => {
  assert.equal(reach.isMissingEndpoint(new reach.ApiError(404, null, '요청을 처리하지 못했어요.')), true)
  // 만든 API가 대상을 못 찾은 경우는 예시로 덮지 않는다
  assert.equal(reach.isMissingEndpoint(new reach.ApiError(404, 'NOT_FOUND', '요청한 대상을 찾을 수 없습니다.')), false)
  assert.equal(reach.isMissingEndpoint(new reach.ApiError(500, null, '오류')), false)
  assert.equal(reach.isMissingEndpoint(new Error('network')), false)
})

test('unknown or new enum values never render as undefined', () => {
  assert.equal(reach.labelOf(reach.reachNotAnalyzedReasonLabel, 'ANALYSIS_TIMEOUT'), '분석 시간 초과')
  assert.equal(reach.labelOf(reach.reachNotAnalyzedReasonLabel, 'SOMETHING_NEW'), 'SOMETHING_NEW')
  const item = reach.sampleReachFindings({ ...noFilter, cveContains: '46675' }, null, 50).items[0]
  const text = reach.reachEvidenceText({ ...item, verdict: { ...item.verdict, notAnalyzedReason: 'SOMETHING_NEW' } })
  assert.doesNotMatch(text, /undefined/)
})

test('unknown finding id is NOT_FOUND', () => {
  assert.throws(() => reach.sampleReachFinding(999), (error) => error.status === 404)
})

test('review input needs a human status and a note unless it goes back to unreviewed (API-06)', () => {
  assert.deepEqual(reach.reviewInput('UNREVIEWED', 'REACHABLE', 'ignored', 3), { reviewState: 'UNREVIEWED', version: 3 })
  assert.deepEqual(reach.reviewInput('CONFIRMED', 'UNREACHABLE', '  근거  ', 1),
    { reviewState: 'CONFIRMED', status: 'UNREACHABLE', note: '근거', version: 1 })
  assert.equal(reach.reviewInput('CONFIRMED', '', 'note', 1), null)
  assert.equal(reach.reviewInput('PROVISIONAL', 'UNKNOWN', '   ', 1), null)
  // 2,000자는 글자 수로 센다. 이모지는 string.length로 2지만 한 글자다
  assert.notEqual(reach.reviewInput('CONFIRMED', 'UNKNOWN', '😀'.repeat(2000), 1), null)
  assert.equal(reach.reviewInput('CONFIRMED', 'UNKNOWN', 'x'.repeat(2001), 1), null)
})

test('detail view shows the review form only when one is given', () => {
  const detail = reach.sampleReachFinding(8)
  assert.match(renderToStaticMarkup(createElement(reach.ReachFindingDetailView, { detail })), /백엔드가 연결되면/)

  const client = new QueryClient()
  const form = createElement(QueryClientProvider, { client }, createElement(reach.ReachReviewForm, { findingId: 8, detail }))
  const html = renderToStaticMarkup(createElement(reach.ReachFindingDetailView, { detail, reviewForm: form }))
  assert.doesNotMatch(html, /백엔드가 연결되면/)
  assert.match(html, /검토 저장/)
  assert.match(html, /검토 전으로 되돌리기/)
})

test('copy rows offer to fill the form from the pending proposal', () => {
  const copy = reach.sampleReachFindings({ ...noFilter, cveContains: '89407', status: ['NOT_ANALYZED'] }, null, 50).items[0]
  const detail = reach.sampleReachFinding(copy.id)
  const client = new QueryClient()
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client },
    createElement(reach.ReachReviewForm, { findingId: copy.id, detail })))
  assert.match(html, /제안으로 채우기/)
  assert.match(html, /저장한 판정이 현재 판정\(방식: 수동\)이 돼요/)
  assert.doesNotMatch(html, /검토 전으로 되돌리기/)   // 아직 검토 전이라 되돌릴 것이 없다
})
