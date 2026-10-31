import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { build } from 'esbuild'
import { findingCountLabel, hasScopeAggregation, historyReturnPath, kstInput, kstInputToUtc, objectCountLabel, parseRunFilters, positiveId, scanDetailPath, scanStatus, scanConnectionLabel, scanReason } from '../src/lib/secretScan.ts'
import { withSecretOrigin, secretOriginParams } from '../src/lib/secretNavigation.ts'

const bundled = await build({
  stdin: { contents: "export { SecretRunDetailPage } from './src/pages/SecretRunDetailPage'; export { SecretHistoryPage } from './src/pages/SecretHistoryPage'; export { SecretConnectionsPage } from './src/pages/SecretConnectionsPage'; export { SecretConnectionScopesPage } from './src/pages/SecretConnectionScopesPage'; export { SecretScopeClassificationPage, SecretClassificationQueuePage } from './src/pages/SecretScopeClassificationPage'; export { SecretPolicyListPage, SecretPolicyDetailPage } from './src/pages/SecretPolicyPages'; export { SecretRunFindingsPage } from './src/pages/SecretRunFindingsPage'", resolveDir: resolve('.') },
  bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external',
  loader: { '.css': 'empty' }, alias: { '@': resolve('src') },
})
const bundlePath = resolve('node_modules/.secret-scan-navigation-test.mjs')
await writeFile(bundlePath, bundled.outputFiles[0].contents)
const { SecretRunDetailPage, SecretHistoryPage, SecretConnectionsPage, SecretConnectionScopesPage, SecretScopeClassificationPage, SecretClassificationQueuePage, SecretPolicyListPage, SecretPolicyDetailPage, SecretRunFindingsPage } = await import(pathToFileURL(bundlePath).href)
after(() => unlink(bundlePath))

test('scan navigation asks for confirmation without registering an automatic scan', () => {
  const html = renderPage(SecretHistoryPage, '/secrets/history', '/secrets/history?request=scan')
  assert.match(html, /승인된 범위를 검사할까요/)
  assert.match(html, /스캔 등록/)
  assert.match(html, /disabled=""[^>]*>스캔 등록/)
})

test('scan request is an independent dialog and never silently chooses the first available connection', () => {
  const connection = { connectionId: 3, displayName: '승인 연결', approvedScopeCount: 2, provider: 'GITHUB', status: 'ACTIVE' }
  const html = renderPage(SecretHistoryPage, '/secrets/history', '/secrets/history?request=scan', [[['secret-connections'], { items: [connection] }]])
  assert.match(html, /<dialog[^>]*secret-scan-request-dialog/)
  assert.match(html, /<option value="" selected="">연결 선택/)
  assert.match(html, /disabled=""[^>]*>스캔 등록/)
  const explicit = renderPage(SecretHistoryPage, '/secrets/history', '/secrets/history?request=scan&connectionId=3', [[['secret-connections'], { items: [connection] }]])
  assert.match(explicit, /<option value="3" selected="">승인 연결/)
  assert.doesNotMatch(explicit, /disabled=""[^>]*>스캔 등록/)
})

function renderPage(Component, path, url, entries = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } })
  for (const [key, data] of entries) client.setQueryData(key, data)
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client },
    createElement(MemoryRouter, { initialEntries: [url] },
      createElement(Routes, null, createElement(Route, { path, element: createElement(Component) }))),
  ))
  client.clear()
  return html
}
const stage = (status, reasonCode = null, required = true) => ({ status, reasonCode, required, observedAt: '2026-10-21T00:00:00Z' })
const scope = { runScopeId: 31, scopeId: 5, scopeRevision: 2, safeDisplayAlias: '승인된 안전 별칭', contentType: 'AWS_S3_OBJECT_CONTENT', region: 'ap-northeast-2', scopeOutcome: 'PARTIAL', collection: stage('PARTIAL'), detection: stage('SUCCEEDED'), validation: stage('SKIPPED', 'VALIDATION_DISABLED', false), objectCount: 3, gapCode: 'AWS_ACCESS_DENIED', approvedRef: 'must-not-render-protected-ref' }
const baseRun = { runId: 12, connectionId: 3, provider: 'AWS', displayName: '승인 연결', triggerType: 'MANUAL', status: 'PARTIAL', scopeCount: 12, finishedScopeCount: 12, successfulScopeCount: 7, gapScopeCount: 5, unverifiedScopeCount: 5, scopeStatusCounts: { SUCCEEDED: 7, PARTIAL: 1, FAILED: 4, SKIPPED: 0, PENDING: 0, RUNNING: 0 }, aggregationStatus: 'AVAILABLE', collectedObjectCount: 3, requestedAt: '2026-10-21T00:00:00Z', startedAt: '2026-10-21T00:01:00Z', finishedAt: '2026-10-21T00:02:00Z', failureCode: null, coverageComplete: false, collectionStatus: 'PARTIAL', detectionStatus: 'SUCCEEDED', validationStatus: 'SKIPPED', collection: stage('PARTIAL'), detection: stage('SUCCEEDED'), validation: stage('SKIPPED', 'VALIDATION_DISABLED', false), attemptNo: 1, maxAttempts: 3, findingCount: 3, distinctCredentialCount: 2, newCredentialCount: null, scopeResults: [scope] }

test('detail navigation preserves only validated filters and the original row, never arbitrary return URLs', () => {
  const { filters } = parseRunFilters(new URLSearchParams('page=3&type=REVALIDATION&status=PARTIAL&provider=AWS&connectionId=9'))
  assert.equal(filters.page, 2)
  const detail = new URL(scanDetailPath(12, filters), 'http://localhost')
  assert.equal(detail.pathname, '/secrets/history/12')
  assert.equal(historyReturnPath(detail.searchParams, 12), '/secrets/history?page=3&type=REVALIDATION&status=PARTIAL&provider=AWS&connectionId=9&focus=12')
  assert.equal(historyReturnPath(new URLSearchParams('return=https://attacker.invalid&page=3'), 12), '/secrets/history')
  assert.equal(historyReturnPath(new URLSearchParams('page=3'), 12), '/secrets/history')
})
test('query parsing rejects prototype values, malformed IDs and invalid date ranges', () => {
  for (const id of ['-1', '0', '1e3', '2.5', '9007199254740992', '../9']) assert.equal(positiveId(id), null)
  assert.equal(positiveId('12'), 12)
  assert.equal(parseRunFilters(new URLSearchParams('type=constructor&status=toString&provider=__proto__')).errors.length, 3)
  assert.equal(scanStatus('constructor'), '미확인')
  assert.ok(parseRunFilters(new URLSearchParams('from=2026-10-22T00:00:00Z&to=2026-10-21T00:00:00Z')).errors.length)
  assert.ok(parseRunFilters(new URLSearchParams('from=2026-10-21T00:00')).errors.length)
})
test('KST input and UTC API boundaries round trip independently of the machine timezone', () => {
  assert.equal(kstInput('2026-10-20T15:00:00Z'), '2026-10-21T00:00')
  assert.equal(kstInputToUtc('2026-10-21T00:00'), '2026-10-20T15:00:00.000Z')
  assert.equal(kstInput('invalid'), '')
})

test('AWS missing source, denied source and incomplete normalization are not proof of key removal', () => {
  for (const code of ['AWS_CONTENT_NOT_FOUND', 'AWS_CONTENT_ACCESS_DENIED', 'DETECTOR_NORMALIZATION_INCOMPLETE']) {
    assert.match(scanReason(code), /제거 여부 확인 불가/)
    assert.doesNotMatch(scanReason(code), /폐기 완료|삭제 확인|정상 0건/)
  }
})
test('failed/skipped/pending scopes and incomplete runs never imply a clean zero result', () => {
  assert.equal(objectCountLabel({ scopeOutcome: 'FAILED', objectCount: 0 }), '확인 불가')
  assert.equal(objectCountLabel({ scopeOutcome: 'PENDING', objectCount: 0 }), '확인 불가')
  assert.equal(objectCountLabel({ scopeOutcome: 'SUCCEEDED', objectCount: 0 }), '0개 확인')
  assert.equal(findingCountLabel(0, false), '확인 불가')
  assert.equal(findingCountLabel(null, true), '확인 불가')
  assert.equal(findingCountLabel(0, true), '0개')
  assert.equal(hasScopeAggregation({ ...baseRun, aggregationStatus: 'LEGACY_UNAVAILABLE' }), false)
})
test('independent detail distinguishes seven successes from twelve finished scopes and omits protected references', () => {
  const html = renderPage(SecretRunDetailPage, '/secrets/history/:runId', '/secrets/history/12', [[['secret-run', 12], baseRun]])
  assert.match(html, /성공 범위<\/span><strong>7<small> \/ 12개/)
  assert.match(html, /종료된 범위<\/span><strong>12/)
  assert.match(html, /확인하지 못한 범위가 5개/)
  assert.match(html, /접근 권한 확인 필요/)
  assert.match(html, /승인된 안전 별칭/)
  assert.doesNotMatch(html, /must-not-render-protected-ref/)
  assert.match(html, /확인된 범위의 결과/)
  assert.doesNotMatch(html, /처음 발견한 키 후보<\/span><strong>0/)
})
test('metadata skip reasons and unavailable legacy aggregates stay explicit', () => {
  assert.equal(scanReason('NO_SUPPORTED_VALIDATOR'), '지원되는 유효성 확인 방식 없음')
  assert.equal(scanReason('SOURCE_GUARD_BLOCKED'), '시험 저장소 검증 제외')
  assert.equal(scanReason('SYNTHETIC_FIXTURE'), '합성 키 검증 생략')
  const run = { ...baseRun, status: 'SUCCEEDED', aggregationStatus: 'LEGACY_UNAVAILABLE', detection: stage('SKIPPED', 'NOT_APPLICABLE_METADATA', false), validation: stage('SKIPPED', 'NOT_APPLICABLE_METADATA', false), findingCount: null, distinctCredentialCount: null }
  const html = renderPage(SecretRunDetailPage, '/secrets/history/:runId', '/secrets/history/12', [[['secret-run', 12], run]])
  assert.match(html, /집계 확인 불가/)
  assert.match(html, /키 값 검사 대상 아님/)
  assert.match(html, /결과 확인 불가/)
  assert.doesNotMatch(html, /성공 범위<\/span><strong>7/)
})
test('revalidation has its own purpose and an existing case link, not a scheduled scan or new-key card', () => {
  const run = { ...baseRun, triggerType: 'REVALIDATION', revalidation: { caseId: 6, occurrenceId: 8 } }
  const html = renderPage(SecretRunDetailPage, '/secrets/history/:runId', '/secrets/history/12', [[['secret-run', 12], run]])
  assert.match(html, /위치별 재검증/)
  assert.match(html, /href="\/secrets\/cases\/6\?occurrence=8"/)
  assert.doesNotMatch(html, /처음 발견한 키 후보/)
})
test('malformed direct detail links retain a safe return path and do not display data', () => {
  const html = renderPage(SecretRunDetailPage, '/secrets/history/:runId', '/secrets/history/1e3')
  assert.match(html, /올바른 실행 주소가 아니에요/)
  assert.match(html, /href="\/secrets\/history"/)
  assert.doesNotMatch(html, /실행 요약/)
})
test('connection authentication success is separate from failed latest scan and earlier full success', () => {
  const connection = { connectionId: 3, provider: 'AWS', safeDisplayAlias: '승인 연결', connectionStatus: 'ACTIVE', approvedScopeCount: 12, scopeRevision: 2, latestProbe: { status: 'CONNECTED', reasonCode: null, checkedAt: '2026-10-21T00:00:00Z' }, lastFullScanAttempt: { runId: 12, status: 'FAILED', requestedAt: '2026-10-21T00:00:00Z', finishedAt: '2026-10-21T00:02:00Z' }, lastSuccessfulFullScan: { runId: 10, status: 'SUCCEEDED', requestedAt: '2026-10-20T00:00:00Z', finishedAt: '2026-10-20T00:02:00Z' }, nextDueAt: null, activeJob: null, capabilities: { canTest: false, canRun: false } }
  const html = renderPage(SecretConnectionsPage, '/secrets/connections', '/secrets/connections', [[['secret-connections-manage', 0, '', ''], { items: [connection], total: 1, page: 0, size: 12 }]])
  assert.match(html, /연결 확인됨/)
  assert.match(html, /신원·설치만 확인/)
  assert.match(html, /SCAN-12 · 실패/)
  assert.match(html, /SCAN-10 · 정상 종료/)
  assert.match(html, /검사 대상 보기/)
  assert.doesNotMatch(html, /<button[^>]*>[^<]*연결 테스트<\/button>/)
})
test('history displays server total and real detail links without page-level metric cards', () => {
  const params = new URLSearchParams('page=3&type=MANUAL')
  const { filters } = parseRunFilters(params)
  const html = renderPage(SecretHistoryPage, '/secrets/history', '/secrets/history?page=3&type=MANUAL', [
    [['secret-runs', filters], { items: [baseRun], total: 45, page: 2, size: 20, asOf: '2026-10-21T00:00:00Z' }],
    [['secret-connections'], { items: [] }],
  ])
  assert.match(html, /조건에 맞는 전체 실행 45회/)
  assert.match(html, /href="\/secrets\/history\/12\?page=3&amp;type=MANUAL&amp;return=history"/)
  assert.doesNotMatch(html, /이 페이지 완료|이 페이지 부분 실패|secret-history-detail-title/)
})


const hrefs = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1].replaceAll('&amp;', '&'))
const navUrl = (path) => new URL(path, 'http://localhost')

test('origin context carries no frozen workbench state into another read scope', () => {
  const context = new URLSearchParams('origin=TEST&snapshotId=workbench-only&return=workbench&returnQuery=protected-context')
  assert.equal(withSecretOrigin('/secrets/history?request=scan&connectionId=3', context), '/secrets/history?request=scan&connectionId=3&origin=TEST')
  assert.equal(withSecretOrigin('/secrets/findings?origin=PRODUCTION', context), '/secrets/findings?origin=PRODUCTION')
  assert.equal(withSecretOrigin('/secrets/history', new URLSearchParams('origin=constructor')), '/secrets/history')
  assert.equal(withSecretOrigin('/secrets/history', 'UNCLASSIFIED'), '/secrets/history')
  const existing = new URLSearchParams('page=2&snapshotId=history-only')
  assert.equal(secretOriginParams(existing, context).get('snapshotId'), 'history-only')
  assert.equal(secretOriginParams(existing, context).get('origin'), 'TEST')
  assert.equal(existing.has('origin'), false)
})

test('connection actions and scope/settings returns retain the selected TEST or PRODUCTION origin', () => {
  const connection = { connectionId: 3, provider: 'GITHUB', safeDisplayAlias: '결제 서비스', connectionStatus: 'ACTIVE', approvedScopeCount: 1, scopeRevision: 2, latestProbe: null, lastFullScanAttempt: { runId: 12, status: 'SUCCEEDED' }, lastSuccessfulFullScan: { runId: 10, status: 'SUCCEEDED' }, nextDueAt: null, activeJob: { runId: 13, status: 'RUNNING' }, capabilities: { canTest: true, canRun: true } }
  for (const origin of ['TEST', 'PRODUCTION']) {
    const connections = renderPage(SecretConnectionsPage, '/secrets/connections', `/secrets/connections?origin=${origin}`, [[['secret-connections-manage', 0, '', origin], { items: [connection], total: 1, page: 0, size: 12 }]])
    const links = hrefs(connections)
    assert.ok(links.some((href) => href.includes('/secrets/connections/3/scopes')))
    assert.ok(links.some((href) => href.includes('request=scan')))
    assert.ok(links.some((href) => href.includes('/secrets/history/12')))
    for (const href of links) assert.equal(navUrl(href).searchParams.get('origin'), origin, href)
    const coverage = { lastAttempt: connection.lastFullScanAttempt, lastSuccessfulScan: connection.lastSuccessfulFullScan, freshness: 'CURRENT', gapReasonCodes: [], nextDueAt: null }
    const scopes = renderPage(SecretConnectionScopesPage, '/secrets/connections/:connectionId/scopes', `/secrets/connections/3/scopes?origin=${origin}`, [[['secret-connection-scopes', 3, 0, origin, false], { items: [{ scopeId: 5, origin, safeDisplayAlias: '결제 저장소', contentType: 'GITHUB_REPOSITORY_FILES', scopeRevision: 2, coverage }], total: 1, page: 0, size: 20 }]])
    for (const href of hrefs(scopes)) assert.equal(navUrl(href).searchParams.get('origin'), origin, href)
    assert.ok(hrefs(scopes).some((href) => navUrl(href).searchParams.get('settings') === 'validation'))
    for (const [Component, route, path] of [
      [SecretScopeClassificationPage, '/secrets/connections/:connectionId/scopes/:scopeId', '/secrets/connections/3/scopes/5'],
      [SecretClassificationQueuePage, '/secrets/connections/review', '/secrets/connections/review'],
      [SecretPolicyListPage, '/secrets/connections/policies', '/secrets/connections/policies'],
      [SecretPolicyDetailPage, '/secrets/connections/policies/:policyId/versions/:version', '/secrets/connections/policies/1/versions/1'],
    ]) {
      const html = renderPage(Component, route, `${path}?origin=${origin}`)
      assert.equal(navUrl(hrefs(html)[0]).searchParams.get('origin'), origin, path)
    }
  }
})

test('history, run results and findings keep TEST while inventory receives no history snapshot', () => {
  const snapshotId = 'a51d954e-9a37-4715-bcfb-2284d9cfac27'
  const params = new URLSearchParams(`origin=TEST&page=2&connectionId=3&snapshotId=${snapshotId}`)
  const { filters } = parseRunFilters(params)
  const history = renderPage(SecretHistoryPage, '/secrets/history', `/secrets/history?${params}`, [[['secret-runs', filters], { items: [baseRun], total: 21, page: 1, size: 20 }], [['secret-connections'], { items: [] }]])
  for (const href of hrefs(history)) assert.equal(navUrl(href).searchParams.get('origin'), 'TEST')
  assert.equal(navUrl(hrefs(history)[0]).searchParams.get('snapshotId'), snapshotId)
  const detail = renderPage(SecretRunDetailPage, '/secrets/history/:runId', `/secrets/history/12?return=history&${params}`, [[['secret-run', 12], { ...baseRun, capabilities: { canViewFindings: true } }]])
  const links = hrefs(detail)
  for (const href of links) assert.equal(navUrl(href).searchParams.get('origin'), 'TEST', href)
  const inventory = navUrl(links.find((href) => href.startsWith('/secrets/findings?')))
  assert.equal(inventory.searchParams.get('runId'), '12')
  assert.equal(inventory.searchParams.has('snapshotId'), false)
  const findings = renderPage(SecretRunFindingsPage, '/secrets/history/:runId/findings', '/secrets/history/12/findings?origin=TEST')
  assert.equal(hrefs(findings)[0], '/secrets/history/12?origin=TEST')
})

test('scan request suppresses only known bootstrap labels and has a task-specific close label', () => {
  const connection = { connectionId: 3, provider: 'GITHUB', displayName: 'GitHub fixtures (local)', approvedScopeCount: 2 }
  const html = renderPage(SecretHistoryPage, '/secrets/history', '/secrets/history?request=scan&connectionId=3&origin=TEST', [[['secret-connections'], { items: [connection] }]])
  assert.match(html, /GitHub · 연결 3/)
  assert.doesNotMatch(html, /GitHub fixtures/)
  assert.match(html, /aria-label="스캔 요청 닫기"/)
  assert.equal(scanConnectionLabel({ ...connection, displayName: '결제 운영 저장소' }), '결제 운영 저장소')
  assert.equal(scanConnectionLabel({ ...connection, safeDisplayAlias: '팀 승인 연결' }), '팀 승인 연결')
  assert.equal(scanConnectionLabel({ ...connection, displayName: 'GitHub fixtures custom' }), 'GitHub fixtures custom')
})

test('actual findings lead the result page, with success scopes collapsed and failure scopes visible', () => {
  const complete = { ...baseRun, status: 'SUCCEEDED', coverageComplete: true, successfulScopeCount: 1, scopeCount: 1, finishedScopeCount: 1, gapScopeCount: 0, unverifiedScopeCount: 0, findingCount: 23, distinctCredentialCount: 9, collection: undefined, detection: undefined, validation: undefined, collectionStatus: 'SUCCEEDED', detectionStatus: 'SUCCEEDED', validationStatus: 'SKIPPED', capabilities: { canViewFindings: true }, scopeResults: [{ ...scope, scopeOutcome: 'SUCCEEDED', gapCode: null }] }
  const html = renderPage(SecretRunDetailPage, '/secrets/history/:runId', '/secrets/history/12?origin=TEST', [[['secret-run', 12], complete]])
  assert.ok(html.indexOf('id="results-title"') < html.indexOf('id="coverage-title"'))
  assert.ok(html.indexOf('이 실행의 탐지 근거') < html.indexOf('id="coverage-title"'))
  assert.match(html, /탐지 근거 \(Finding\)<\/span><strong>23건/)
  assert.match(html, /고유 키 후보<\/span><strong>9개/)
  assert.match(html, /처음 발견한 키 후보<\/span><strong>—/)
  assert.match(html, /<details class="secret-run-scope-details"><summary>검사 범위 자세히/)
  const beforeTechnical = html.slice(0, html.indexOf('<details class="card secret-scan-technical"'))
  assert.doesNotMatch(beforeTechnical, /적용 여부 미기록|관측 시각 미기록/)
  assert.match(beforeTechnical, /유효성 검증<\/span><strong>건너뜀/)
  const partial = renderPage(SecretRunDetailPage, '/secrets/history/:runId', '/secrets/history/12', [[['secret-run', 12], baseRun]])
  assert.match(partial, /<details class="secret-run-scope-details" open="">/)
  assert.match(partial, /접근 권한 확인 필요/)
})
