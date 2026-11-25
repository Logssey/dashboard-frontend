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

const modules = {}, paths = []
for (const [key, entry] of Object.entries({ lib: 'src/lib/secretWorkbench.ts', overview: 'src/pages/SecretOverviewPage.tsx', queue: 'src/pages/SecretTriageCandidatesPage.tsx', api: 'src/api/secretSummary.ts', queueApi: 'src/api/secretWorkbenchQueue.ts', response: 'src/lib/secretResponse.ts', inventory: 'src/lib/secretInventory.ts' })) {
  const built = await build({ entryPoints: [resolve(entry)], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', alias: { '@': resolve('src') }, loader: { '.css': 'empty' } })
  const path = resolve(`node_modules/.secret-workbench-${key}-test.mjs`); paths.push(path)
  await writeFile(path, built.outputFiles[0].contents); modules[key] = await import(pathToFileURL(path).href)
}
after(() => Promise.all(paths.map((path) => unlink(path))))
const snapshotId = 'c61d954e-9a37-4715-bcfb-2284d9cfac27'
const query = `origin=ALL&snapshotId=${snapshotId}`
const filters = modules.lib.parseWorkbenchFilters(new URLSearchParams(query)).filters
const metric = (key, unit, value, status = 'AVAILABLE') => ({ key, unit, value, status, reasonCode: null, appliedFilters: {}, notApplicableFilters: key === 'coverageGapScopes' ? ['provider', 'environment', 'assignee'] : [], queueFilter: key === 'ongoingCases' ? { bucket: 'ACTION_REQUIRED', stages: 'OPEN,IN_PROGRESS' } : {} })
const summary = {
  scope: 'workbench', unit: 'Mixed', total: null, origin: 'TEST', filters: {}, snapshotId, asOf: '2026-10-21T00:00:00Z', expiresAt: '2026-10-21T01:00:00Z', restrictedCoverage: true,
  metrics: [metric('reviewRequiredLocations', 'Occurrence', 3), metric('needsDecisionLocations', 'Occurrence', 3), metric('ongoingCases', 'ResponseCase', 2), metric('revalidationPendingCases', 'ResponseCase', 1), metric('coverageGapScopes', 'Scope', 4), metric('needsCaseLinkLocations', 'Occurrence', 0), metric('unclassifiedScopes', 'Scope', 5)],
  workPreviews: { response: { status: 'AVAILABLE', unit: 'ResponseCase', total: 2, snapshotId, items: [{ caseId: 7, occurrenceId: 8, visibleOccurrenceCount: 2, maskedLabel: 'AWS ••••A1B2', safeLocationLabel: '주문 서비스 설정', assigneeDisplayName: '보안 담당자', whyHereCode: 'ACTIVE_RESPONSE' }] }, decision: { status: 'AVAILABLE', unit: 'Occurrence', total: 3, snapshotId, items: [] }, revalidation: { status: 'AVAILABLE', unit: 'ResponseCase', total: 1, snapshotId, items: [] } },
  collectionHealth: { status: 'AVAILABLE', origin: 'TEST', approvedScopeCount: 8, lastAttempt: { runId: 5, status: 'FAILED', requestedAt: '2026-10-21T00:00:00Z' }, lastScopeSuccess: { runId: 4, finishedAt: '2026-10-20T00:00:00Z' }, lastCompleteSuccess: null, counts: { success: 6, partial: 1, failed: 1, notRun: 0, paused: 0, running: 0, incomplete: 0 }, items: [] },
  setupSummary: { status: 'AVAILABLE', selectedOrigin: 'TEST', selectedOriginScopeCount: 1, unclassifiedScopeCount: 4, pausedScopeCount: 2, globalGroupsIgnoreOrigin: true, selectedReasonCounts: { POLICY_MISSING: 1 }, unclassifiedReasonCounts: { SOURCE_UNCLASSIFIED: 4 }, pausedReasonCounts: { POLICY_MISSING: 2 }, items: [{ scopeId: 13, connectionId: 9, safeDisplayAlias: '선택 출처 범위', setupReasonCodes: ['POLICY_MISSING'] }], unclassifiedItems: [], pausedItems: [], notApplicableFilters: ['provider', 'environment', 'assignee'] },
  caseSummary: { status: 'AVAILABLE', total: 5, actionCounts: { OPEN: 1, IN_PROGRESS: 1, REVALIDATION_PENDING: 1, RESOLVED: 2, RISK_ACCEPTED: 0 }, severityStatus: 'LEGACY_UNAVAILABLE', severityCounts: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNASSESSED: 5 } },
  normalInventory: { status: 'AVAILABLE', unit: 'CredentialSet', value: 12 }, crossEnvironmentAlerts: { status: 'AVAILABLE', unit: 'CrossEnvironmentAlert', value: 1, items: [{ alertId: 77, status: 'SUSPECTED_REAL' }] }, partialCoverage: true,
}
function render(Component, entry, seeds = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  for (const [key, data] of seeds) client.setQueryData(key, data)
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: [entry] }, createElement(Component))))
}
function decodeLinks(html) { return [...html.matchAll(/href="([^"]+)"/g)].map((match) => new URL(match[1].replaceAll('&amp;', '&'), 'http://local')) }
test('actual work rows and their destination retain every filter and the exact snapshot', () => {
  const html = render(modules.overview.SecretOverviewPage, `/secrets?${query}&view=response`, [[['secret-summary', filters], summary]])
  const links = decodeLinks(html).filter((url) => url.pathname === '/secrets/triage')
  assert.ok(links.length >= 2)
  for (const url of links) for (const [key, value] of new URLSearchParams(query)) assert.equal(url.searchParams.get(key), value)
  assert.match(html, /AWS ••••A1B2/); assert.match(html, /주문 서비스 설정/); assert.match(html, /보안 담당자/)
  const caseLink = decodeLinks(html).find((url) => url.pathname === '/secrets/cases/7')
  assert.equal(caseLink.searchParams.get('origin'), 'ALL'); assert.equal(caseLink.searchParams.get('occurrence'), '8')
  for (const [key, value] of new URLSearchParams(query)) assert.equal(new URLSearchParams(caseLink.searchParams.get('returnQuery')).get(key), value)
  assert.match(html, /최근 검사 상태/); assert.match(html, /최근 시도/)
  assert.ok(decodeLinks(html).some((url) => url.pathname === '/secrets/history/5'))
  assert.doesNotMatch(html, /선택 범위 전체 성공|secret-workbench-card|secret-workbench-stage-track|평균 위험|총 위험|높음 0|낮음 0/)
})
test('reason-based setup stays after actual security work and separates paused connections', () => {
  const html = render(modules.overview.SecretOverviewPage, `/secrets?${query}`, [[['secret-summary', filters], summary]])
  assert.ok(html.indexOf('팀의 할 일') < html.indexOf('<summary>검사 대상 설정'))
  assert.match(html, /검사 대상 설정 보완/); assert.match(html, /추가 설정 검토/); assert.match(html, /중지된 연결의 설정 보완/)
  assert.match(html, /보관 정책 미설정 1/)
  assert.doesNotMatch(html, /setup-title|분류·보관 규칙을 확인할 검사 대상/)
})
test('an empty unified work queue provides discovery and history entry without fake activity', () => {
  const operating = filters
  const empty = { status: 'AVAILABLE', unit: 'Occurrence', total: 0, items: [], snapshotId }
  const value = { ...summary, workPreviews: { ...Object.fromEntries(Object.entries(summary.workPreviews).map(([key, preview]) => [key, { ...preview, total: 0, items: [] }])), review: empty } }
  const html = render(modules.overview.SecretOverviewPage, `/secrets?${modules.lib.workbenchSearch(operating)}`, [[['secret-summary', operating], value]])
  assert.match(html, /현재 확인할 발견이 없어요/)
  const links = decodeLinks(html)
  assert.doesNotMatch(html, /현황 조회 조건|시험 출처|운영 보기/)
  assert.ok(links.some((url) => url.pathname === '/secrets/findings'))
  assert.doesNotMatch(html, /AWS ••••A1B2|모두 안전|전체 성공/)
})

test('severity exclusions use only the server count and stay separate from graded cases', () => {
  const data = { ...summary, caseSummary: { ...summary.caseSummary, severityStatus: 'AVAILABLE', severityCounts: { CRITICAL: 0, HIGH: 1, MEDIUM: 0, LOW: 0, UNASSESSED: 0 }, notApplicableCaseCount: 2 } }
  const html = render(modules.overview.SecretOverviewPage, `/secrets?${query}`, [[['secret-summary', filters], data]])
  assert.match(html, /심각도 평가 대상 외.*?2.*?건.*?등급 분포에서 제외/)
  for (const value of [null, undefined, -1, 1.5]) {
    const unavailable = { ...data, caseSummary: { ...data.caseSummary, notApplicableCaseCount: value } }
    assert.doesNotMatch(render(modules.overview.SecretOverviewPage, `/secrets?${query}`, [[['secret-summary', filters], unavailable]]), /심각도 평가 대상 외/)
  }
  const denied = { ...data, caseSummary: { ...data.caseSummary, severityStatus: 'NOT_AUTHORIZED' } }
  assert.doesNotMatch(render(modules.overview.SecretOverviewPage, `/secrets?${query}`, [[['secret-summary', filters], denied]]), /심각도 평가 대상 외/)
})
test('denied metrics are unavailable rather than a clickable zero', () => {
  const denied = { ...summary, metrics: [metric('needsDecisionLocations', 'Occurrence', null, 'NOT_AUTHORIZED')], workPreviews: { response: { status: 'NOT_AUTHORIZED', items: [], total: null, snapshotId }, decision: { status: 'NOT_AUTHORIZED', items: [], total: null, snapshotId }, revalidation: { status: 'NOT_AUTHORIZED', items: [], total: null, snapshotId } }, collectionHealth: { status: 'NOT_AUTHORIZED' }, setupSummary: { status: 'NOT_AUTHORIZED' }, normalInventory: { status: 'NOT_AUTHORIZED', value: null }, crossEnvironmentAlerts: { status: 'NOT_AUTHORIZED', value: null, items: [] }, caseSummary: { status: 'NOT_AUTHORIZED', actionCounts: null, severityStatus: 'LEGACY_UNAVAILABLE' } }
  const html = render(modules.overview.SecretOverviewPage, `/secrets?${query}`, [[['secret-summary', filters], denied]])
  assert.match(html, /지표를 볼 권한이 없어요/)
  assert.doesNotMatch(html, />0<small>/)
  assert.equal(decodeLinks(html).filter((url) => url.searchParams.get('bucket') === 'NEEDS_DECISION').length, 0)
})
test('loading or malformed snapshots never invent counts or fetch a fallback snapshot', () => {
  const loading = render(modules.overview.SecretOverviewPage, '/secrets')
  assert.match(loading, /현황을 불러오는 중/); assert.doesNotMatch(loading, />0<small>/)
  const bad = render(modules.overview.SecretOverviewPage, '/secrets?snapshotId=wrong')
  assert.match(bad, /조회 조건을 확인/); assert.doesNotMatch(bad, /조치는 어디까지/)
})
test('scope queues stay scope-based and preserve success before a failed latest attempt', () => {
  const data = { items: [{ scopeId: 13, connectionId: 9, safeDisplayAlias: '승인 범위 #13', contentType: 'AWS_S3_OBJECT_CONTENT', coverage: { lastSuccessfulScan: { runId: 4, finishedAt: '2026-10-20T00:00:00Z' }, lastAttempt: { runId: 5, status: 'FAILED' }, gapReasonCodes: ['ACCESS_DENIED'] } }], total: 4, size: 20, page: 0, unit: 'Scope', asOf: summary.asOf, snapshotId, restrictedCoverage: true }
  const key = ['secret-review-queue', filters, 'COVERAGE_GAPS', '', 0, 0]
  const html = render(modules.queue.SecretTriageCandidatesPage, `/secrets/triage?${query}&bucket=COVERAGE_GAPS`, [[key, data]])
  assert.match(html, /단위: 승인 범위/); assert.match(html, /접근 권한 확인 필요/); assert.match(html, /마지막 성공/)
  assert.doesNotMatch(html, /키 #undefined|현재 정상|성공 0/)
  assert.ok(decodeLinks(html).some((url) => url.pathname === '/secrets/connections/9/scopes' && url.searchParams.get('scopeId') === '13'))
})
test('case and key details return to the workbench list with its origin, filters, page and snapshot', () => {
  const returnQuery = `${query}&bucket=NORMAL_INVENTORY&page=3`
  const params = new URLSearchParams({ return: 'workbench', returnQuery })
  for (const path of [modules.response.caseReturnPath(params, 7), modules.inventory.inventoryReturnPath(params, 9)]) {
    const url = new URL(path, 'http://local')
    assert.equal(url.pathname, '/secrets/triage'); assert.equal(url.searchParams.get('page'), '3'); assert.equal(url.searchParams.get('snapshotId'), snapshotId)
    for (const [key, value] of new URLSearchParams(query)) assert.equal(url.searchParams.get(key), value)
  }
  assert.equal(modules.lib.parseWorkbenchFilters(new URLSearchParams('origin=UNCLASSIFIED')).valid, true)
  assert.equal(modules.lib.parseWorkbenchFilters(new URLSearchParams('source=__proto__')).valid, false)
  assert.equal(modules.lib.safeWorkbenchReturn('bucket=EVIL'), '/secrets/triage')
})
test('inventory distinguishes provider-confirmed retirement from allowed storage and metadata', () => {
  const data = { items: ['AUTHORIZED_STORAGE', 'METADATA_ONLY', 'RETIRED_HISTORY'].map((inventorySubtype, index) => ({ secretId: index + 1, maskedLabel: `키 #${index + 1}`, inventorySubtype, whyHereCode: index === 2 ? 'PROVIDER_RETIREMENT_CONFIRMED' : 'APPROVED_STORAGE' })), total: 3, size: 20, page: 0, unit: 'CredentialSet', asOf: summary.asOf, snapshotId, restrictedCoverage: true }
  const html = render(modules.queue.SecretTriageCandidatesPage, `/secrets/triage?${query}&bucket=NORMAL_INVENTORY`, [[['secret-review-queue', filters, 'NORMAL_INVENTORY', '', 0, 0], data]])
  assert.match(html, /승인된 보관/); assert.match(html, /메타데이터만 확인/); assert.match(html, /공급자 확인 폐기 이력/)
  assert.match(html, /공급자가 확인한 사용 종료/); assert.doesNotMatch(html, /RETIRED_HISTORY/)
})
test('summary and queue requests share normalized filters rather than calling inventory for totals', async () => {
  const originalFetch = globalThis.fetch, calls = []
  globalThis.fetch = async (path) => { calls.push(new URL(path, 'http://local')); return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }) }
  try {
    await modules.api.fetchSecretSummary(filters)
    await modules.queueApi.fetchWorkbenchQueue(filters, 'ACTION_REQUIRED', 'OPEN,IN_PROGRESS', 2)
    assert.deepEqual(calls.map((url) => url.pathname), ['/api/v1/secrets/summary', '/api/v1/secrets/review-queue'])
    for (const url of calls) for (const [key, value] of new URLSearchParams(query)) assert.equal(url.searchParams.get(key), value)
    assert.equal(calls[1].searchParams.get('page'), '2')
  } finally { globalThis.fetch = originalFetch }
})

test('overview shows at most three real work rows while retaining the server total', () => {
  const value = { ...summary, workPreviews: { ...summary.workPreviews, response: { ...summary.workPreviews.response, total: 5, items: [1, 2, 3, 4, 5].map((id) => ({ caseId: id, maskedLabel: `실제업무-${id}`, whyHereCode: 'ACTIVE_RESPONSE' })) } } }
  const html = render(modules.overview.SecretOverviewPage, `/secrets?${query}&view=response`, [[['secret-summary', filters], value]])
  assert.match(html, /실제업무-1/); assert.match(html, /실제업무-3/); assert.match(html, /대응 중<span>5건/)
  assert.doesNotMatch(html, /실제업무-4|실제업무-5/)
  assert.match(html, /최근 시도/)
})

test('overview navigation opens unified lists without transferring its workbench snapshot', () => {
  const html = render(modules.overview.SecretOverviewPage, `/secrets?${query}`, [[['secret-summary', filters], summary]])
  const links = decodeLinks(html)
  for (const url of links.filter((url) => url.pathname === '/secrets/findings')) {
    for (const key of ['origin', 'source', 'provider', 'environment']) assert.equal(url.searchParams.get(key), filters[key])
    assert.equal(url.searchParams.has('snapshotId'), false)
  }
  for (const url of links.filter((url) => url.pathname === '/secrets/history' || url.pathname === '/secrets/connections' && url.searchParams.has('origin'))) assert.equal(url.searchParams.get('origin'), null)
  assert.doesNotMatch(html, /위치 정보 미제공/)
})

test('three task selectors use the server review union and open occurrence review even with an existing case', () => {
  const review = { status: 'AVAILABLE', unit: 'Occurrence', total: 4, snapshotId, items: [
    { secretId: 11, occurrenceId: 21, caseId: 7, maskedLabel: '다시 검토할 키', whyHereCode: 'NEEDS_REVIEW' },
    { secretId: 12, occurrenceId: 22, caseId: 7, maskedLabel: '대응이 필요한 키', whyHereCode: 'CASE_LINK_REQUIRED' },
  ] }
  const value = { ...summary, metrics: [...summary.metrics.filter((item) => item.key !== 'reviewRequiredLocations'), metric('reviewRequiredLocations', 'Occurrence', 4)], workPreviews: { ...summary.workPreviews, review } }
  const html = render(modules.overview.SecretOverviewPage, `/secrets?${query}`, [[['secret-summary', filters], value]])
  assert.equal((html.match(/aria-controls="secret-overview-work-list"/g) ?? []).length, 3)
  assert.match(html, /확인 필요<span>4곳/)
  assert.match(html, /검토 필요/)
  assert.match(html, /대응 생성 필요/)
  assert.doesNotMatch(html, /secret-overview-work-tabs|secret-summary-card coverageGapScopes/)
  const links = decodeLinks(html)
  assert.ok(links.some((url) => url.searchParams.get('bucket') === 'REVIEW_REQUIRED'))
  assert.ok(links.some((url) => url.pathname === '/secrets/triage/11' && url.searchParams.get('occurrence') === '21'))
  assert.ok(links.some((url) => url.pathname === '/secrets/triage/12' && url.searchParams.get('occurrence') === '22'))
  assert.equal(links.filter((url) => url.pathname === '/secrets/cases/7').length, 0)
  const target = links.find((url) => url.pathname === '/secrets/triage/11')
  assert.equal(new URLSearchParams(target.searchParams.get('returnQuery')).get('bucket'), 'REVIEW_REQUIRED')
})

test('empty states distinguish missing connections, absent targets and skipped current scopes', () => {
  const unfiltered = { ...filters, source: 'ALL', provider: 'ALL', environment: 'ALL', connectionId: null, assignee: '' }
  const empty = { status: 'AVAILABLE', unit: 'Occurrence', total: 0, items: [], snapshotId }
  const value = { ...summary, workPreviews: { ...summary.workPreviews, review: empty } }
  const states = [
    [{ configuredConnectionCount: 0, approvedScopeCount: 0 }, '검사할 연결을 등록하세요'],
    [{ configuredConnectionCount: 2, approvedScopeCount: 0 }, '등록된 검사 대상이 없어요'],
    [{ configuredConnectionCount: 2, approvedScopeCount: 8, counts: { ...summary.collectionHealth.counts, success: 0, partial: 0, failed: 0, notRun: 8 } }, '현재 검사 대상을 확인하세요'],
  ]
  for (const [health, text] of states) {
    const data = { ...value, collectionHealth: { ...summary.collectionHealth, ...health } }
    const html = render(modules.overview.SecretOverviewPage, `/secrets?${modules.lib.workbenchSearch(unfiltered)}`, [[['secret-summary', unfiltered], data]])
    assert.ok(html.includes(text))
    assert.doesNotMatch(html, /모두 안전|첫 검사를/)
  }
})

test('source health uses complete provider counts and exact execution links without inferring from preview rows', () => {
  const value = { ...summary, collectionHealth: { ...summary.collectionHealth, configuredConnectionCount: 2, providers: [
    { source: 'GITHUB', approvedScopeCount: 10, gapScopeCount: 2, counts: { success: 8, partial: 1, failed: 1, notRun: 0, paused: 0, running: 0, incomplete: 0 }, lastAttempt: { runId: 81, status: 'PARTIAL', runStatus: 'PARTIAL', requestedAt: '2026-11-11T00:00:00Z' }, items: [] },
    { source: 'AWS', approvedScopeCount: 5, gapScopeCount: 1, counts: { success: 4, partial: 0, failed: 0, notRun: 1, paused: 0, running: 0, incomplete: 0 }, lastAttempt: { runId: 82, status: 'SUCCEEDED', requestedAt: '2026-11-11T00:10:00Z' }, items: [] },
  ] } }
  const html = render(modules.overview.SecretOverviewPage, `/secrets?${query}`, [[['secret-summary', filters], value]])
  assert.match(html, /검사 성공 <strong>8<\/strong> \/ 10개 대상/)
  assert.match(html, /검사 성공 <strong>4<\/strong> \/ 5개 대상/)
  assert.match(html, /누락·지연 2개/)
  assert.match(html, /미검사·건너뜀 1개/)
  assert.doesNotMatch(html, /정상 확인|조건은 업무 목록에 적용/)
  const links = decodeLinks(html)
  assert.ok(links.some((url) => url.pathname === '/secrets/history/81' && !url.searchParams.has('origin')))
  assert.ok(links.some((url) => url.pathname === '/secrets/history/82'))
})

test('review queue return paths preserve the union bucket and original location focus', () => {
  const result = modules.lib.safeWorkbenchReturn(`${query}&bucket=REVIEW_REQUIRED&page=2`, '11:21')
  const url = new URL(result, 'http://local')
  assert.equal(url.searchParams.get('bucket'), 'REVIEW_REQUIRED')
  assert.equal(url.searchParams.get('page'), '2')
  assert.equal(url.searchParams.get('focus'), '11:21')
})


test('common causes use server-wide counts and start a fresh snapshot when narrowing the connection', () => {
  const value = { ...summary, commonCauseGroups: [
    { code: 'EXPOSURE_REVIEW_REQUIRED', connectionId: 7, connectionLabel: '개발 저장소', count: 37, unit: 'Occurrence', nextAction: 'REVIEW_LOCATION', canExecute: true, target: { type: 'OCCURRENCE', id: 12, connectionId: 7 } },
    { code: 'POLICY_MISSING', connectionId: 8, count: 4, unit: 'Scope', nextAction: 'CONFIGURE_STORAGE_POLICY', canExecute: false, target: { type: 'SCOPE', id: 13, connectionId: 8 } },
  ] }
  const html = render(modules.overview.SecretOverviewPage, `/secrets?${query}`, [[['secret-summary', filters], value]])
  assert.match(html, /연결별 공통 원인 2개/)
  assert.match(html, /개발 저장소 · 37곳의 발견 위치/)
  const narrowed = decodeLinks(html).find((url) => url.pathname === '/secrets/triage' && url.searchParams.get('connectionId') === '7')
  assert.ok(narrowed)
  assert.equal(narrowed.searchParams.has('snapshotId'), false)
  assert.match(html, /href="\/secrets\/connections\/8\/scopes"/)
})


test('team work distinguishes a permitted next action from a read-only task without presenting both as personal work', () => {
  const item = summary.workPreviews.response.items[0]
  const rows = [
    { ...item, caseId: 7, taskGuidance: { nextActionCode: 'REQUEST_REVALIDATION', canExecute: true, priorityReasonCodes: [] } },
    { ...item, caseId: 8, taskGuidance: { nextActionCode: 'REQUEST_REVALIDATION', canExecute: false, blockedReasonCode: 'LOCATION_ASSIGNEE_REQUIRED', priorityReasonCodes: [] } },
  ]
  const value = { ...summary, workPreviews: { ...summary.workPreviews, response: { ...summary.workPreviews.response, items: rows } } }
  const html = render(modules.overview.SecretOverviewPage, `/secrets?${query}&view=response`, [[['secret-summary', filters], value]])
  assert.match(html, /팀의 할 일/)
  assert.equal((html.match(/현재 계정으로 처리 가능/g) ?? []).length, 1)
  assert.match(html, />내용 확인<\/a>/)
})


test('one connection default-policy cause opens its actual shared configuration instead of creating occurrence work', () => {
  const value = { ...summary, commonCauseGroups: [{ code: 'DEFAULT_POLICY_UPDATE_REQUIRED', connectionId: 7, connectionLabel: '개발 저장소', count: 1, unit: 'Connection', nextAction: 'CONFIGURE_STORAGE_POLICY', canExecute: true, target: { type: 'CONNECTION', id: 7 } }] }
  const html = render(modules.overview.SecretOverviewPage, `/secrets?${query}`, [[['secret-summary', filters], value]])
  assert.match(html, /1개 연결/)
  const url = decodeLinks(html).find((link) => link.pathname === '/secrets/connections' && link.searchParams.get('settings') === 'policy')
  assert.equal(url.searchParams.get('connectionId'), '7')
})
