import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { writeFile, unlink, readFile } from 'node:fs/promises'
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

test('repeated scans keep the latest detection readable without expanding historical evidence', () => {
  const evidence = Array.from({ length: 20 }, (_, i) => ({ ruleId: 'github-pat', runId: i + 1, detectedAt: `2026-10-${String(i + 1).padStart(2, '0')}T01:00:00Z` }))
  const html = renderToStaticMarkup(createElement(api.SecretDetectionEvidence, { evidence }))
  const current = html.split('<details')[0]
  assert.equal((current.match(/github-pat/g) ?? []).length, 1)
  assert.match(current, /SCAN-20/)
  assert.match(html, /<details[^>]*><summary>최근 탐지 기록 20건<\/summary>/)
  assert.doesNotMatch(html, /<details[^>]* open/)
  assert.match(html, /SCAN-1<\/p>/)
})

test('multiple detector rules are bounded in the default view while all evidence remains available', () => {
  const evidence = Array.from({ length: 8 }, (_, i) => ({ ruleId: `rule-${i + 1}`, runId: 25, detectedAt: '2026-10-22T01:00:00Z' }))
  const html = renderToStaticMarkup(createElement(api.SecretDetectionEvidence, { evidence }))
  assert.equal((html.split('<details')[0].match(/<strong>rule-/g) ?? []).length, 3)
  assert.match(html, /최근 탐지 기록 8건/)
  assert.match(html, /rule-8/)
  const missing = renderToStaticMarkup(createElement(api.SecretDetectionEvidence, { evidence: undefined }))
  assert.match(missing, /상세 탐지 규칙 기록 없음/)
  assert.doesNotMatch(missing, /탐지 기록 0건|정상|안전/)
})
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
  client.setQueryData(['secret-detail', 12, 'ALL'], item)
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

test('Notion coordinates link only fixed page and block addresses', () => {
  const page = '123456781234123412341234567890ab'
  const block = 'abcdefabcdefabcdefabcdefabcdefab'
  const location = { source: 'NOTION', safeLocationLabel: '승인 문서', sourceDetails: { status: 'AVAILABLE', label: 'Notion 페이지 · 블록' } }
  for (const sourceUrl of [`https://www.notion.so/${page}`, `https://www.notion.so/${page}#${block}`]) {
    const html = renderToStaticMarkup(createElement(api.SecretSourceCoordinates, { location: { ...location, sourceDetails: { ...location.sourceDetails, sourceUrl } } }))
    assert.match(html, /Notion에서 위치 열기/)
    assert.ok(html.includes(`href="${sourceUrl}"`))
    assert.match(html, /rel="noopener noreferrer"/)
  }
  for (const sourceUrl of [`https://www.notion.so.evil.invalid/${page}`, `http://www.notion.so/${page}`, `https://www.notion.so/${page}?redirect=elsewhere`, `https://www.notion.so/${page}#invalid`, `https://www.notion.so/path/${page}`]) {
    const html = renderToStaticMarkup(createElement(api.SecretSourceCoordinates, { location: { ...location, sourceDetails: { ...location.sourceDetails, sourceUrl } } }))
    assert.doesNotMatch(html, /<a /)
  }
  const unavailable = renderToStaticMarkup(createElement(api.SecretSourceCoordinates, { location: { ...location, sourceDetails: { ...location.sourceDetails, status: 'UNAVAILABLE', sourceUrl: `https://www.notion.so/${page}` } } }))
  assert.doesNotMatch(unavailable, /<a /)
})

test('the primary case action follows the explicit location and never falls back to another case', () => {
  function page(selected, caseForSelected) {
    const params = new URLSearchParams(`origin=TEST&occurrence=${selected}&locationPanel=closed`), filters = api.parseLocationFilters(params).filters
    const item = { id: 12, issuer: 'GITHUB', credentialType: 'GITHUB_CLASSIC_PAT', componentState: 'CONFIRMED', maskedLabel: 'GitHub ••••1234', severity: null, validationStatus: 'UNCHECKED', remediationSummary: summary }
    const base = { source: 'GITHUB', environment: 'UNKNOWN', origin: 'TEST', presence: 'PRESENT', exposure: 'ABNORMAL', validity: { result: 'UNCHECKED' }, storagePolicy: { result: 'UNKNOWN' }, coverage: {}, capabilities: { canViewCase: true } }
    const items = [{ ...base, occurrenceId: 8, safeLocationLabel: 'A 위치', caseId: 1 }, { ...base, occurrenceId: 9, safeLocationLabel: 'B 위치', caseId: caseForSelected }]
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, gcTime: Infinity } } })
    client.setQueryData(['secret-detail', 12, 'ALL'], item)
    client.setQueryData(['secret-key-locations', 12, filters, 0], { credential: item, items, total: 2, visibleLocationCount: 2, page: 0, size: 20 })
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: [`/secrets/12?${params}`] }, createElement(Routes, null, createElement(Route, { path: '/secrets/:secretId', element: createElement(api.SecretKeyDetailPage) })))))
    client.clear(); return html.match(/<div class="secret-key-primary-actions">([\s\S]*?)<\/div><div class="secret-key-recent-scan">/)[1]
  }
  const selectedB = page(9, 2)
  assert.match(selectedB, /cases\/2\?origin=ALL&amp;occurrence=9/); assert.doesNotMatch(selectedB, /cases\/1/)
  const withoutCase = page(9, null)
  assert.match(withoutCase, /선택 위치 확인/); assert.doesNotMatch(withoutCase, /cases\/1|현재 대응·조치/)
  const invalidSelection = page(404, 2)
  assert.match(invalidSelection, /선택 위치를 다시 확인/); assert.doesNotMatch(invalidSelection, /cases\//)
})


test('the same file on two branches keeps distinct source coordinates and observed original links', () => {
  const locations = ['main', 'develop'].map((branch, index) => ({ occurrenceId: index + 1, source: 'GITHUB', safeLocationLabel: `위치 #${index + 1}`, exposure: 'UNKNOWN', sourceDetails: { status: 'AVAILABLE', contextStatus: 'OBSERVED', repository: 'Logssey/application', branch, path: 'config/app.env', line: 'L4', sourceUrl: `https://github.com/Logssey/application/blob/${branch}/config/app.env#L4` } }))
  const html = renderToStaticMarkup(createElement(api.SecretDiscoveryContext, { detail: { issuer: 'GITHUB', maskedLabel: 'GitHub ••••1234', componentState: 'CONFIRMED' }, locations, onSelect() {} }))
  assert.match(html, /Logssey\/application · main/)
  assert.match(html, /Logssey\/application · develop/)
  for (const location of locations) {
    const coordinates = renderToStaticMarkup(createElement(api.SecretSourceCoordinates, { location }))
    assert.ok(coordinates.includes(`href="${location.sourceDetails.sourceUrl}"`))
    assert.ok(coordinates.includes(`브랜치 ${location.sourceDetails.branch}`))
  }
})

test('unknown old branch context never borrows a current branch or exposes an original link', () => {
  const location = { occurrenceId: 8, source: 'GITHUB', safeLocationLabel: '이전 발견 위치', sourceDetails: { status: 'UNAVAILABLE', contextStatus: 'UNKNOWN', repository: 'Logssey/application', branch: 'new-branch', path: 'config/app.env', sourceUrl: 'https://github.com/Logssey/application/blob/new-branch/config/app.env' } }
  const html = renderToStaticMarkup(createElement(api.SecretSourceCoordinates, { location }))
  assert.match(html, /기록 당시의 브랜치를 확인하지 못했어요/)
  assert.doesNotMatch(html, /new-branch|href=/)
  const changed = renderToStaticMarkup(createElement(api.SecretSourceCoordinates, { location: { ...location, sourceDetails: { ...location.sourceDetails, reasonCode: 'SOURCE_APPROVAL_CHANGED' } } }))
  assert.match(changed, /이전 원본의 접근 권한을 다시 확인/)
  assert.doesNotMatch(changed, /new-branch|href=/)
  const reconstructed = renderToStaticMarkup(createElement(api.SecretSourceCoordinates, { location: { ...location, sourceDetails: { ...location.sourceDetails, status: 'AVAILABLE', contextStatus: 'RECONSTRUCTED', branch: 'old-branch' } } }))
  assert.match(reconstructed, /기록 당시 승인 대상/)
  assert.match(reconstructed, /브랜치 old-branch/)
})


test('GitHub original links must match the observed repository branch file and line', () => {
  const source = { status: 'AVAILABLE', contextStatus: 'OBSERVED', repository: 'Logssey/application', branch: 'feat/secret', path: 'config/app.env', line: 'L4-L8', sourceUrl: 'https://github.com/Logssey/application/blob/feat%2Fsecret/config/app.env#L4-L8' }
  const render = (sourceDetails) => renderToStaticMarkup(createElement(api.SecretSourceCoordinates, { location: { source: 'GITHUB', safeLocationLabel: '위치', sourceDetails } }))
  assert.match(render(source), /href="https:\/\/github.com\/Logssey\/application\/blob\/feat%2Fsecret\/config\/app.env#L4-L8"/)
  for (const bad of [
    { ...source, sourceUrl: 'https://github.com/Logssey/application/blob/main/config/app.env#L4-L8' },
    { ...source, sourceUrl: source.sourceUrl.replace('application', 'another') },
    { ...source, sourceUrl: source.sourceUrl.replace('#L4-L8', '#L9') },
    { ...source, sourceUrl: source.sourceUrl + '?redirect=elsewhere' },
  ]) assert.doesNotMatch(render(bad), /<a /)
})


test('narrow source graphs stack and notebook location tables keep their action column in view', async () => {
  const css = await readFile(resolve('src/pages/secret-inventory.css'), 'utf8')
  const narrow = css.slice(css.indexOf('@media(max-width:1100px)'))
  assert.match(narrow, /\.secret-key-source-graph \{ grid-template-columns:1fr;/)
  const sticky = css.slice(css.indexOf('@media(min-width:851px)'))
  assert.match(sticky, /\.secret-location-table td:last-child[^}]*position:sticky; right:0;/)
  assert.match(css, /@media\(max-width:850px\)/)
})
