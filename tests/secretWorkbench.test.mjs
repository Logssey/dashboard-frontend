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
const query = `origin=TEST&source=GITHUB&provider=AWS&environment=DEV&connectionId=9&assignee=ME&snapshotId=${snapshotId}`
const filters = modules.lib.parseWorkbenchFilters(new URLSearchParams(query)).filters
const metric = (key, unit, value, status = 'AVAILABLE') => ({ key, unit, value, status, reasonCode: null, appliedFilters: {}, notApplicableFilters: key === 'coverageGapScopes' ? ['provider', 'environment', 'assignee'] : [], queueFilter: key === 'ongoingCases' ? { bucket: 'ACTION_REQUIRED', stages: 'OPEN,IN_PROGRESS' } : {} })
const summary = {
  scope: 'workbench', unit: 'Mixed', total: null, origin: 'TEST', filters: {}, snapshotId, asOf: '2026-10-21T00:00:00Z', expiresAt: '2026-10-21T01:00:00Z', restrictedCoverage: true,
  metrics: [metric('needsDecisionLocations', 'Occurrence', 3), metric('ongoingCases', 'ResponseCase', 2), metric('revalidationPendingCases', 'ResponseCase', 1), metric('coverageGapScopes', 'Scope', 4), metric('needsCaseLinkLocations', 'Occurrence', 0), metric('unclassifiedScopes', 'Scope', 5)],
  workPreviews: { response: { status: 'AVAILABLE', unit: 'ResponseCase', total: 2, snapshotId, items: [{ caseId: 7, occurrenceId: 8, maskedLabel: 'AWS ••••A1B2', safeLocationLabel: '주문 서비스 설정', assigneeDisplayName: '보안 담당자', whyHereCode: 'ACTIVE_RESPONSE' }] }, decision: { status: 'AVAILABLE', unit: 'Occurrence', total: 3, snapshotId, items: [] }, revalidation: { status: 'AVAILABLE', unit: 'ResponseCase', total: 1, snapshotId, items: [] } },
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
  const html = render(modules.overview.SecretOverviewPage, `/secrets?${query}`, [[['secret-summary', filters], summary]])
  const links = decodeLinks(html).filter((url) => url.pathname === '/secrets/triage')
  assert.ok(links.length >= 2)
  for (const url of links) for (const [key, value] of new URLSearchParams(query)) assert.equal(url.searchParams.get(key), value)
  assert.match(html, /AWS ••••A1B2/); assert.match(html, /주문 서비스 설정/); assert.match(html, /보안 담당자/)
  const caseLink = decodeLinks(html).find((url) => url.pathname === '/secrets/cases/7')
  assert.equal(caseLink.searchParams.get('origin'), 'TEST'); assert.equal(caseLink.searchParams.get('occurrence'), '8')
  for (const [key, value] of new URLSearchParams(query)) assert.equal(new URLSearchParams(caseLink.searchParams.get('returnQuery')).get(key), value)
  assert.match(html, /검사 상태/); assert.match(html, /최근 범위 성공/)
  assert.doesNotMatch(html, /선택 범위 전체 성공|secret-workbench-card|secret-workbench-stage-track|평균 위험|총 위험|높음 0|낮음 0/)
})
test('reason-based setup stays after actual security work and separates paused connections', () => {
  const html = render(modules.overview.SecretOverviewPage, `/secrets?${query}`, [[['secret-summary', filters], summary]])
  assert.ok(html.indexOf('지금 처리할 업무') < html.indexOf('운영 설정'))
  assert.match(html, /선택한 출처의 설정 보완/); assert.match(html, /출처가 미분류인 범위/); assert.match(html, /중지된 연결의 설정 잔여/)
  assert.match(html, /보관 정책 미설정 1/)
  assert.doesNotMatch(html, /setup-title|분류·보관 규칙을 확인할 검사 대상/)
})
test('an actual empty operating work queue provides explicit TEST and unclassified entry without fake activity', () => {
  const operating = { ...filters, origin: 'PRODUCTION' }
  const value = { ...summary, workPreviews: Object.fromEntries(Object.entries(summary.workPreviews).map(([key, preview]) => [key, { ...preview, total: 0, items: [] }])) }
  const html = render(modules.overview.SecretOverviewPage, `/secrets?${modules.lib.workbenchSearch(operating)}`, [[['secret-summary', operating], value]])
  assert.match(html, /현재 조건에서 처리할 보안 업무가 없어요/)
  const links = decodeLinks(html)
  assert.ok(links.some((url) => url.pathname === '/secrets' && url.searchParams.get('origin') === 'TEST'))
  assert.ok(links.some((url) => url.pathname === '/secrets/findings' && url.searchParams.get('origin') === 'UNCLASSIFIED'))
  assert.doesNotMatch(html, /AWS ••••A1B2|모두 안전|전체 성공/)
})

test('severity exclusions use only the server count and stay separate from graded cases', () => {
  const data = { ...summary, caseSummary: { ...summary.caseSummary, severityStatus: 'AVAILABLE', severityCounts: { HIGH: 1 }, notApplicableCaseCount: 2 } }
  const html = render(modules.overview.SecretOverviewPage, `/secrets?${query}`, [[['secret-summary', filters], data]])
  assert.match(html, /심각도 평가 대상 외 2건 · 등급별 건수와 별도로 집계/)
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
  assert.equal(modules.lib.parseWorkbenchFilters(new URLSearchParams('origin=UNCLASSIFIED')).valid, false)
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
