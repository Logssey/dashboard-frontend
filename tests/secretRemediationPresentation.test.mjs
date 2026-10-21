import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { build } from 'esbuild'
const result = await build({ stdin: { contents: "export * from './src/components/SecretRemediationSummary'; export * from './src/components/SecretDiscoveryContext'; export * from './src/pages/SecretKeyDetailPage'; export { parseLocationFilters } from './src/lib/secretInventory';", resolveDir: resolve('.') }, bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, alias: { '@': resolve('src') } })
const path = resolve('node_modules/.secret-remediation-presentation-test.mjs')
await writeFile(path, result.outputFiles[0].contents)
const api = await import(pathToFileURL(path).href)
after(() => unlink(path))
const summary = { requiredLocationCount: 3, presentLocationCount: 1, postActionMissingLocationCount: 1, unknownLocationCount: 1, postActionRedetectedCount: 1, approvedStorageLocationCount: 2, metadataLocationCount: 1, visibleLocationCount: 6, evidenceObservedAt: '2026-10-21T01:00:00Z', restrictedCoverage: true, comparisonScope: 'AUTHORIZED_CURRENT_ORIGIN' }
test('location evidence counts retain uncertainty and separate approved storage and metadata', () => {
  const html = renderToStaticMarkup(createElement(api.SecretRemediationSummary, { data: summary }))
  assert.match(html, /필수 대응 3곳/)
  assert.match(html, /현재 확인 불가/)
  assert.match(html, /승인 보관 2곳/)
  assert.match(html, /메타데이터 1곳/)
  assert.match(html, /미발견은 키 폐기 확인과 별개/)
  assert.doesNotMatch(html, /위험 감소|안전해요|해결률/)
})
test('inconsistent or unavailable evidence never becomes a zero-risk visualization', () => {
  assert.equal(api.validRemediationSummary({ ...summary, requiredLocationCount: 0 }), false)
  assert.equal(api.validRemediationSummary({ ...summary, presentLocationCount: -1 }), false)
  const html = renderToStaticMarkup(createElement(api.SecretRemediationSummary, { data: undefined }))
  assert.match(html, /집계하지 못했어요/)
  assert.doesNotMatch(html, /필수 대응 0/)
})
test('selecting a location opens one dialog instead of appending evidence under the table', () => {
  const params = new URLSearchParams('occurrence=8'), filters = api.parseLocationFilters(params).filters
  const item = { id: 12, issuer: 'AWS', credentialType: 'AWS_ACCESS_KEY_PAIR', componentState: 'CONFIRMED', maskedLabel: 'AWS ••••1234', severity: 'UNASSESSED', validationStatus: 'UNCHECKED', occurrenceCount: 6, firstSeenAt: '2026-10-20T01:00:00Z', lastSeenAt: '2026-10-21T01:00:00Z', remediationSummary: summary, occurrences: [] }
  const location = { occurrenceId: 8, connectionId: 2, scopeId: 5, scopeRevision: 1, source: 'GITHUB', environment: 'UNKNOWN', origin: 'PRODUCTION', safeLocationLabel: '주문 서비스 · 위치 #8', presence: 'PRESENT', exposure: 'UNKNOWN', validity: { result: 'UNCHECKED' }, storagePolicy: { result: 'UNKNOWN' }, capabilities: {}, coverage: {}, caseId: null }
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, gcTime: Infinity } } })
  client.setQueryData(['secret-detail', 12, 'PRODUCTION'], item)
  client.setQueryData(['secret-key-locations', 12, filters, 0], { credentialSetId: 12, credential: item, items: [location], detailVersion: 'v1', total: 6, visibleLocationCount: 6, page: 0, size: 20, readAt: '2026-10-21T01:00:00Z', locationStateCounts: { presence: { PRESENT: 3, MISSING: 1, UNKNOWN: 2 } }, sourceGroups: [{ source: 'GITHUB', locationCount: 6, scopeCount: 2, presenceCounts: { PRESENT: 3, MISSING: 1, UNKNOWN: 2 } }] })
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: ['/secrets/12?occurrence=8'] }, createElement(Routes, null, createElement(Route, { path: '/secrets/:secretId', element: createElement(api.SecretKeyDetailPage) })))))
  client.clear()
  assert.match(html, /<dialog[^>]*secret-detail-panel/)
  assert.match(html, /위치 근거 닫기/)
  assert.match(html, /현재 위치 필터의 소스별 분포/)
  assert.doesNotMatch(html, /<td colSpan="7"/)
})


test('discovery graph connects actual key, source and short location labels while detail preserves full coordinates', () => {
  const location = { occurrenceId: 8, source: 'GITHUB', exposure: 'UNKNOWN', lastSeenAt: null, sourceDetails: { status: 'AVAILABLE', repository: 'Logssey/test-find-key', branch: 'main', path: 'fixtures/config/sample.env', line: 'L4', sourceUrl: 'https://github.com/Logssey/test-find-key/blob/main/fixtures/config/sample.env#L4' } }
  const html = renderToStaticMarkup(createElement(api.SecretDiscoveryContext, { detail: { maskedLabel: 'GitHub ••••1234', issuer: 'GITHUB', componentState: 'CONFIRMED', validationStatus: 'UNCHECKED', severity: 'UNASSESSED' }, locations: [location], onSelect() {} }))
  assert.match(html, /키와 발견 소스·위치의 관계/); assert.match(html, /GitHub ••••1234/)
  assert.match(html, /Logssey\/test-find-key/); assert.match(html, /sample.env · 4행/)
  assert.doesNotMatch(html, /fixtures\/config\/sample.env|L4|침해 확인|Critical|안전해요/)
  const coordinates = renderToStaticMarkup(createElement(api.SecretSourceCoordinates, { location }))
  assert.match(coordinates, /fixtures\/config\/sample.env/); assert.match(coordinates, /4번째 줄/)
})
