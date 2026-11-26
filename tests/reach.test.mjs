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
  assert.match(html, /모두 취약 조건 미충족/)
  assert.doesNotMatch(html, /안전|해결됨/)
  assert.doesNotMatch(html, /%/)
  assert.doesNotMatch(html, /아직 연결되지 않았어요/)
  const withBasis = renderToStaticMarkup(createElement(reach.ReachSummaryView, {
    summary: {
      ...reach.sampleReachSummary(),
      scope: { targetId: null, scanId: null },
      basis: {
        requested: 'RUNNING', applied: 'RUNNING', unscannedRunning: [],
        scans: [
          { app: 'API', targetType: 'IMAGE', targetId: 2, scanId: 9, imageDigest: 'sha256:' + 'a'.repeat(64), running: true },
          { app: 'API', targetType: 'REPO', targetId: 3, scanId: 4, imageDigest: null, running: false },
        ],
      },
    },
    onOpen: () => {},
  }))
  assert.match(withBasis, /검사 #9.*운영에서 실행 중/s)
  assert.match(withBasis, /검사 #4.*최신 커밋/s)
  const summary = reach.sampleReachSummary()
  assert.match(html, new RegExp(`실행 중</span><strong>${summary.byDeployment.RUNNING}건`))
})

test('copy rows show the pending proposal next to the reason', () => {
  const copy = reach.sampleReachFindings({ ...noFilter, cveContains: '89407', status: ['NOT_ANALYZED'] }, null, 50).items[0]
  const text = reach.reachEvidenceText(copy)
  assert.match(text, /^판정하지 않은 사본/)
  assert.match(text, /제안\(확정 대기\): 취약 조건 미충족/)
})

test('detail view lists facts used for the verdict before informational facts', () => {
  const html = renderToStaticMarkup(createElement(reach.ReachFindingDetailView, { detail: reach.sampleReachFinding(8) }))
  assert.ok(html.indexOf('F-dto.floating.tokens') < html.indexOf('F-dto.floating.any'))
  assert.match(html, /참고/)
  assert.match(html, /후보 경로, 실제와 다를 수 있음/)
  assert.match(html, /수정 버전은 팀에서 선택합니다/)
})

test('image review stays available when common action record loading fails', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } } })
  client.getQueryCache().build(client, { queryKey: ['action-record', 'IMAGE', 8] }).setState({
    status: 'error', fetchStatus: 'idle', error: new Error('action service unavailable'),
  })
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client },
    createElement(MemoryRouter, null, createElement(reach.ReachFindingDetailView, {
      detail: reach.sampleReachFinding(8), actionOnly: true, actionRecordId: 8,
      reviewForm: createElement('button', null, '검토 저장'),
    }))))
  assert.match(html, /조치 기록을 불러오지 못했어요/)
  assert.match(html, /aria-label="취약점 판단 검토"/)
  assert.match(html, />검토 저장<\/button>/)
  client.clear()
})

/** 요약·목록 응답을 캐시에 넣어 둔 QueryClient. sample은 "예시 값으로 대신 그렸는지" */
function seededClient({ summarySample, listSample }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(['reach-summary', 'RUNNING'], { data: reach.sampleReachSummary(), sample: summarySample })
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
  assert.match(summaryHtml, /<strong>현황<\/strong>/)
  assert.match(summaryHtml, /상태 × 위험도/)
  assert.doesNotMatch(summaryHtml, /class="tabs"/)

  const findingsHtml = renderAt(client, reach.VulnerabilityFindingsPage, '/vulnerabilities/findings')
  assert.match(findingsHtml, /<strong>상태별 개수, 취약점 목록<\/strong>/)
  assert.match(findingsHtml, /23건 중 23건 표시/)
  assert.match(findingsHtml, /CVE-2026-85091/)
  assert.doesNotMatch(findingsHtml, /더 보기/)
  assert.doesNotMatch(findingsHtml, /class="tabs"/)
})

test('notice names only the parts that are still sample data', () => {
  // 요약 API는 붙었고 목록 API는 아직 없는 상황
  const client = seededClient({ summarySample: false, listSample: true })
  assert.doesNotMatch(renderAt(client, reach.VulnerabilitySummaryPage, '/vulnerabilities'), /실제 판정 결과가 아니에요/)
  assert.match(renderAt(client, reach.VulnerabilityFindingsPage, '/vulnerabilities/findings'), /<strong>취약점 목록<\/strong>/)
})

test('image submenu remains accessible inside the collapsible security group', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(reach.ME_QUERY_KEY, { userId: 1, displayName: 'Security Admin', role: 'ADMIN' })

  const inside = renderAt(client, reach.AppLayout, '/vulnerabilities/findings')
  assert.match(inside, /class="nav-link security-area-link active"/)
  const sidebar = inside.split('</aside>')[0]
  assert.match(sidebar, /href="\/vulnerabilities\/findings"/)
  assert.match(sidebar, /aria-label="이미지 보안 세부 메뉴"/)
  assert.match(sidebar, /class="nav-link sub active" aria-current="page" href="\/vulnerabilities\/findings"/)
  assert.match(inside, /<span>취약점 목록<\/span>/) // 상단 바 제목

  const outside = renderAt(client, reach.AppLayout, '/overview')
  assert.match(outside, /id="security-menu-group" class="nav-expansion" inert="" aria-hidden="true"/)
  assert.match(outside, /href="\/vulnerabilities\/findings"/)
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

// ---- API-05 상세의 스캐너 설명·참고 링크·위치·취약 함수 (SCR-03-02·04·06·10) ----

const tomcatFunctions = [
  { id: 3, cve: 'CVE-2026-68525', package: 'pkg:maven/org.apache.tomcat.embed/tomcat-embed-core', class: 'org.apache.catalina.authenticator.FormAuthenticator', method: 'doAuthenticate', descriptor: '(Lorg/apache/catalina/connector/Request;)Z', fixCommits: ['apache/tomcat@1a2b3c4d'], confidence: 'high' },
  { id: 4, cve: 'CVE-2026-68525', package: 'pkg:maven/org.apache.tomcat.embed/tomcat-embed-core', class: 'org.apache.catalina.realm.RealmBase', method: 'hasResourcePermission', fixCommits: [] },
  { id: 9, cve: 'CVE-2026-89407', package: 'pkg:maven/tools.jackson.core/jackson-core', class: 'tools.jackson.core.io.NumberInput', method: 'looksLikeValidNumber', fixCommits: [] },
]

function tomcatDetail(verdict = {}) {
  const item = reach.sampleReachFindings({ ...noFilter, cveContains: '68525' }, null, 50).items[0]
  const detail = reach.sampleReachFinding(item.id)
  return { ...detail, verdict: { ...detail.verdict, ...verdict } }
}

test('vuln functions come from the verdict ids, and ids that now point at another CVE are reported as missing', () => {
  const picked = reach.findingVulnFunctions(tomcatDetail({ vulnFunctionIds: [3, 9, 77] }), tomcatFunctions)
  assert.equal(picked.source, 'VERDICT')
  assert.deepEqual(picked.functions.map((fn) => fn.id), [3])
  assert.deepEqual(picked.missingIds, [9, 77])   // 9는 다른 CVE(데이터 버전이 바뀜), 77은 없음
})

test('vuln functions given by API-05 win over the API-10 lookup', () => {
  const inline = [{ ...tomcatFunctions[1], note: '서버가 준 값' }]
  const picked = reach.findingVulnFunctions(tomcatDetail({ vulnFunctionIds: [3], vulnFunctions: inline }), tomcatFunctions)
  assert.deepEqual(picked, { source: 'VERDICT', functions: inline, missingIds: [] })
})

test('without ids the card falls back to the same CVE and package only, and shows nothing for a skipped copy', () => {
  const picked = reach.findingVulnFunctions(tomcatDetail(), tomcatFunctions)
  assert.equal(picked.source, 'DATA')
  assert.deepEqual(picked.functions.map((fn) => fn.id), [3, 4])
  // Jackson 2 사본: 같은 CVE라도 패키지가 달라 데이터의 Jackson 3 함수를 보이지 않는다 (그리고 분석 대상 아님)
  const copy = reach.sampleReachFindings({ ...noFilter, cveContains: '89407', status: ['NOT_ANALYZED'] }, null, 50).items[0]
  assert.equal(reach.findingVulnFunctions(reach.sampleReachFinding(copy.id), tomcatFunctions), null)
  const asJudged = reach.sampleReachFinding(copy.id)
  asJudged.verdict = { ...asJudged.verdict, status: 'UNKNOWN' }
  assert.equal(reach.findingVulnFunctions(asJudged, tomcatFunctions), null)
  assert.equal(reach.findingVulnFunctions(tomcatDetail({ vulnFunctionIds: [3] }), undefined), null)   // API-10을 아직 못 받음
})

test('purl without version matches the API-10 package form', () => {
  assert.equal(reach.purlWithoutVersion('pkg:maven/tools.jackson.core/jackson-core@3.1.5?type=jar'), 'pkg:maven/tools.jackson.core/jackson-core')
  assert.equal(reach.purlWithoutVersion('pkg:npm/%40scope/name@1.0.0'), 'pkg:npm/%40scope/name')
})

test('only http(s) references become links', () => {
  assert.equal(reach.safeExternalUrl('https://nvd.nist.gov/vuln/detail/CVE-2026-68525'), 'https://nvd.nist.gov/vuln/detail/CVE-2026-68525')
  assert.equal(reach.safeExternalUrl('http://example.com/a'), 'http://example.com/a')
  assert.equal(reach.safeExternalUrl('javascript:alert(1)'), null)
  assert.equal(reach.safeExternalUrl('data:text/html,<b>x</b>'), null)
  assert.equal(reach.safeExternalUrl('not a url'), null)
})

test('detail view shows the scanner description, references, CWE, image path and vuln functions', () => {
  const detail = tomcatDetail({ vulnFunctionIds: [3, 9] })
  detail.component = { ...detail.component, path: 'app/app.jar/BOOT-INF/lib/tomcat-embed-core-11.0.24.jar' }
  detail.vulnerability = {
    ...detail.vulnerability,
    title: 'tomcat: FORM authentication constraint bypass',
    description: 'Line one.\nLine two.',
    cwe: ['CWE-287'],
    references: ['https://nvd.nist.gov/vuln/detail/CVE-2026-68525', 'javascript:alert(1)'],
  }
  const html = renderToStaticMarkup(createElement(reach.ReachFindingDetailView, {
    detail,
    vulnFunctionData: tomcatFunctions,
    onOpenVulnFunctions: () => {},
  }))
  assert.match(html, /취약 기능: FORM 인증 제약 우회 · CWE-287/)
  assert.match(html, /tomcat: FORM authentication constraint bypass/)
  assert.match(html, /<summary>설명 보기<\/summary>/)
  assert.match(html, /스캐너 설명 \(원문\)/)
  assert.match(html, /Line one\.\nLine two\./)
  assert.match(html, /href="https:\/\/nvd\.nist\.gov\/vuln\/detail\/CVE-2026-68525" target="_blank" rel="noopener noreferrer"/)
  assert.doesNotMatch(html, /href="javascript:/)
  assert.match(html, /<li>javascript:alert\(1\)<\/li>/)   // 링크가 아닌 글자로
  assert.match(html, /이미지 안 위치 <code>app\/app\.jar\/BOOT-INF\/lib\/tomcat-embed-core-11\.0\.24\.jar<\/code>/)
  assert.match(html, /<h3>취약 함수<\/h3>/)
  assert.match(html, /org\.apache\.catalina\.authenticator\.FormAuthenticator\.doAuthenticate\(Lorg\/apache\/catalina\/connector\/Request;\)Z/)
  assert.match(html, /수정 커밋 apache\/tomcat@1a2b3c4d · 확신도 high/)
  assert.match(html, /취약 함수 9번을 지금 데이터에서 찾지 못했어요/)
  assert.match(html, /데이터에서 보기/)
  // 취약 함수 카드는 근거 뒤, 수정 버전 앞 (SCR-03 순서)
  assert.ok(html.indexOf('<h3>근거</h3>') < html.indexOf('<h3>취약 함수</h3>'))
  assert.ok(html.indexOf('<h3>취약 함수</h3>') < html.indexOf('<h3>수정 버전</h3>'))
})

test('detail view without the new fields renders as before', () => {
  const html = renderToStaticMarkup(createElement(reach.ReachFindingDetailView, { detail: tomcatDetail() }))
  assert.match(html, /취약 기능: FORM 인증 제약 우회/)
  assert.doesNotMatch(html, /설명 보기/)
  assert.doesNotMatch(html, /이미지 안 위치/)
  assert.doesNotMatch(html, /<h3>취약 함수<\/h3>/)   // API-10 데이터가 없으면 카드를 그리지 않는다
})
