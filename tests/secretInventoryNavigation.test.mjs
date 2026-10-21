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

const bundled = await build({ stdin: { contents: "export * from './src/lib/secretInventory'; export { SecretsPage } from './src/pages/SecretsPage'; export { SecretKeyDetailPage } from './src/pages/SecretKeyDetailPage'", resolveDir: resolve('.') }, bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, alias: { '@': resolve('src') } })
const bundlePath = resolve('node_modules/.secret-inventory-navigation-test.mjs')
await writeFile(bundlePath, bundled.outputFiles[0].contents)
const { SecretsPage, SecretKeyDetailPage, parseInventoryFilters, keyDetailPath, inventoryReturnPath, parseLocationFilters } = await import(pathToFileURL(bundlePath).href)
after(() => unlink(bundlePath))
const snapshotId = '11111111-1111-1111-1111-111111111111'
const item = { id: 12, issuer: 'GITHUB', credentialType: 'GITHUB_CLASSIC_PAT', componentState: 'CONFIRMED', maskedLabel: 'ghp_••••1234', severity: 'UNASSESSED', validationStatus: 'UNCHECKED', validationReasonCode: 'NO_VERIFICATION_ATTEMPT', validatedAt: null, occurrenceCount: 3, visibleLocationCount: 3, firstSeenAt: '2026-10-20T00:00:00Z', lastSeenAt: '2026-10-21T00:00:00Z', origin: 'TEST', whyHereCode: 'STORAGE_POLICY_REQUIRED', nextActionCode: 'REVIEW_EVIDENCE', safeLocationLabel: '위치 #1', restrictedCoverage: true, expiryPolicy: 'UNKNOWN', expiresAt: null, lifecycleStatus: 'UNKNOWN', occurrences: [], iamMetadata: null }
const location = (id, presence) => ({ occurrenceId: id, connectionId: 3, scopeId: 5, scopeRevision: 2, source: 'GITHUB', environment: 'UNKNOWN', origin: 'TEST', safeLocationLabel: `위치 #${id}`, presence, exposure: 'UNKNOWN', storagePolicy: { result: 'UNKNOWN', reasonCode: 'POLICY_EVIDENCE_REQUIRED' }, validity: { result: 'UNCHECKED', reasonCode: 'NO_VERIFICATION_ATTEMPT', observedAt: null }, coverage: { status: 'UNKNOWN', reasonCode: 'CURRENT_SCOPE_CHECK_REQUIRED', legacyLastCompleteCoverageAt: null }, fixtureStatus: null, caseId: null, actionStatus: null, assignedUserId: null, whyHereCode: 'STORAGE_POLICY_REQUIRED', nextActionCode: 'REVIEW_EVIDENCE', locationAbsenceCheck: { status: 'UNKNOWN' }, credentialLifecycleCheck: { status: 'UNKNOWN' }, coverageCheck: { status: 'UNKNOWN' }, firstSeenAt: item.firstSeenAt, lastSeenAt: item.lastSeenAt, capabilities: { canReview: true, canViewCase: false, canViewCoverage: true, canRequestRevalidation: false, canRecordAction: false }, approvedRef: 'must-not-render-protected-reference', rawSecret: 'must-not-render-secret-value' })

function renderPage(Component, path, url, entries = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } })
  for (const [key, data] of entries) client.setQueryData(key, data)
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: [url] }, createElement(Routes, null, createElement(Route, { path, element: createElement(Component) })))))
  client.clear()
  return html
}

test('inventory defaults to production value candidates and rejects prototype filters', () => {
  const { filters, errors } = parseInventoryFilters(new URLSearchParams())
  assert.equal(filters.origin, 'PRODUCTION')
  assert.equal(filters.contentKind, 'VALUE_FINDINGS')
  assert.equal(filters.workBucket, 'ALL')
  assert.equal(errors.length, 0)
  assert.equal(parseInventoryFilters(new URLSearchParams('origin=constructor&workBucket=toString')).errors.length, 2)
  assert.ok(parseInventoryFilters(new URLSearchParams('snapshotId=not-a-snapshot')).errors.length)
})
test('key detail keeps inventory snapshot, origin, filters and page with an allowlisted return path', () => {
  const { filters } = parseInventoryFilters(new URLSearchParams(`page=3&origin=TEST&contentKind=METADATA&workBucket=NEEDS_CASE_LINK&snapshotId=${snapshotId}`))
  const path = new URL(keyDetailPath(12, filters), 'http://localhost')
  assert.equal(path.pathname, '/secrets/12')
  assert.equal(path.searchParams.get('origin'), 'TEST')
  const back = new URL(inventoryReturnPath(path.searchParams, 12), 'http://localhost')
  assert.equal(back.pathname, '/secrets/findings')
  assert.equal(back.searchParams.get('page'), '3')
  assert.equal(back.searchParams.get('snapshotId'), snapshotId)
  assert.equal(back.searchParams.get('focus'), '12')
  assert.equal(inventoryReturnPath(new URLSearchParams('return=https://example.invalid'), 12), '/secrets/findings')
  for (const origin of ['TEST', 'UNCLASSIFIED']) assert.equal(inventoryReturnPath(new URLSearchParams({ origin }), 12), `/secrets/findings?origin=${origin}`)
  assert.equal(inventoryReturnPath(new URLSearchParams('origin=evil'), 12), '/secrets/findings')
})
test('independent key detail displays present, missing and unknown together without declaring resolution', () => {
  const params = new URLSearchParams('origin=TEST&detailVersion=v1&occurrence=2')
  const { filters } = parseLocationFilters(params)
  const locations = { credentialSetId: 12, credential: item, detailVersion: 'v1', items: [location(1, 'PRESENT'), location(2, 'MISSING'), location(3, 'UNKNOWN')], total: 3, visibleLocationCount: 3, page: 0, size: 20, origin: 'TEST', locationStateCounts: { presence: { PRESENT: 1, MISSING: 1, UNKNOWN: 1 }, exposure: { UNKNOWN: 3 } }, restrictedCoverage: true, readAt: '2026-10-21T01:00:00Z' }
  const html = renderPage(SecretKeyDetailPage, '/secrets/:secretId', `/secrets/12?${params}`, [
    [['secret-detail', 12, 'TEST'], item], [['secret-key-locations', 12, filters, 0], locations],
  ])
  assert.match(html, /마지막 검사에서 발견/)
  assert.match(html, /마지막 검사에서 미발견/)
  assert.match(html, /검사 근거 미확인/)
  assert.match(html, /현재 존재 확인 불가/)
  assert.match(html, /열람 가능한 위치 기준/)
  assert.match(html, /합성 데이터 여부 미확인/)
  assert.doesNotMatch(html, /해결에 필요한 근거|조치 후 위치 미발견<\/dt>/)
  assert.doesNotMatch(html, /must-not-render|키 전체 노출|해결 완료<\/button>|원문 보기/)
  const linked = { ...locations, items: locations.items.map((row) => row.occurrenceId === 2 ? { ...row, caseId: 7, capabilities: { ...row.capabilities, canViewCase: true } } : row) }
  const linkedHtml = renderPage(SecretKeyDetailPage, '/secrets/:secretId', `/secrets/12?${params}`, [
    [['secret-detail', 12, 'TEST'], item], [['secret-key-locations', 12, filters, 0], linked],
  ])
  assert.match(linkedHtml, /<details[^>]*><summary>조치·검사 근거 자세히<\/summary>/)
  assert.match(linkedHtml, /조치 후 위치 미발견<\/dt><dd>근거 확인 필요/)
  assert.match(linkedHtml, /미발견과 체크 완료만으로 키 폐기·해결을 확정하지 않아요/)
  assert.doesNotMatch(linkedHtml, /must-not-render|해결 완료<\/button>/)
})
test('inventory makes metadata and value candidate filters explicit and uses safe independent key links', () => {
  const url = `/secrets/findings?origin=TEST&contentKind=METADATA&snapshotId=${snapshotId}`
  const { filters } = parseInventoryFilters(new URL(url, 'http://localhost').searchParams)
  const html = renderPage(SecretsPage, '/secrets/findings', url, [[['secret-inventory', filters, 0], { items: [{ ...item, componentState: 'METADATA_ONLY', whyHereCode: 'ACCESS_KEY_METADATA', nextActionCode: 'VIEW_METADATA' }], total: 1, page: 0, size: 20, scope: 'inventory', unit: 'CredentialSet', asOf: item.lastSeenAt, snapshotId, restrictedCoverage: true }]])
  assert.match(html, /메타데이터/)
  assert.match(html, /접근키 존재 정보/)
  assert.match(html, /단위: 고유 키/)
  assert.match(html, /href="\/secrets\/12\?origin=TEST/)
  assert.match(html, /실제 키일 수 있으며/)
  assert.doesNotMatch(html, /키 전체 노출|dialog|secret-history-detail-title/)
})

test('a failed latest scope scan preserves earlier success without claiming current complete coverage', () => {
  const params = new URLSearchParams('origin=TEST&occurrence=1')
  const { filters } = parseLocationFilters(params)
  const row = { ...location(1, 'UNKNOWN'), coverage: { scopeRevision: 2,
    lastAttempt: { runId: 9, requestedAt: '2026-10-21T01:00:00Z', finishedAt: '2026-10-21T01:01:00Z', scopeOutcome: 'PARTIAL' },
    lastSuccessfulScan: { runId: 8, requestedAt: '2026-10-20T01:00:00Z', finishedAt: '2026-10-20T01:01:00Z' },
    gapReasonCodes: ['LAST_ATTEMPT_INCOMPLETE'], freshness: 'CURRENT', isPaused: false, isRunning: false } }
  const html = renderPage(SecretKeyDetailPage, '/secrets/:secretId', `/secrets/12?${params}`, [
    [['secret-detail', 12, 'TEST'], item], [['secret-key-locations', 12, filters, 0], {
      credentialSetId: 12, credential: item, items: [row], total: 1, visibleLocationCount: 1, detailVersion: 'v1',
      locationStateCounts: { presence: { PRESENT: 0, MISSING: 0, UNKNOWN: 1 } }, restrictedCoverage: true,
    }],
  ])
  assert.match(html, /최근 검사 시도/)
  assert.match(html, /마지막 검사 성공/)
  assert.match(html, /최근 검사 일부 누락/)
  assert.doesNotMatch(html, /기록된 승인 범위 확인|확인된 누락 없음/)
})
test('initial loading and malformed key links do not invent zero counts', () => {
  const loading = renderPage(SecretsPage, '/secrets/findings', '/secrets/findings')
  assert.match(loading, /키 목록을 불러오는 중/)
  assert.doesNotMatch(loading, /고유 키 0개/)
  const invalid = renderPage(SecretKeyDetailPage, '/secrets/:secretId', '/secrets/1e3')
  assert.match(invalid, /키 주소 또는 위치 조회 조건이 올바르지 않아요/)
  assert.match(invalid, /href="\/secrets\/findings"/)
})
