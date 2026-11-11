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



const bundle = await build({ stdin: { contents: "export { SecretInvestigationDetailPage } from './src/pages/SecretInvestigationPages'; export { SecretAlertDetailPage } from './src/pages/SecretAlertPages'; export { SecretFixtureAttestationsPage } from './src/pages/SecretFixtureAttestationsPage'; export * from './src/api/secretInvestigations';", resolveDir: resolve('.') }, bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, alias: { '@': resolve('src') } })
const bundlePath = resolve('node_modules/.secret-governance-test.mjs')
await writeFile(bundlePath, bundle.outputFiles[0].contents)
const api = await import(pathToFileURL(bundlePath).href)
after(() => unlink(bundlePath))

function renderPage(Component, path, url, entries) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, gcTime: Infinity } } })
  for (const [key, data] of entries) client.setQueryData(key, data)
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: [url] }, createElement(Routes, null, createElement(Route, { path, element: createElement(Component) })))))
  client.clear()
  return html
}

test('automatic investigations with no owner or deadline remain visible without invented overdue status', () => {
  const task = { taskId: 4, targetType: 'OCCURRENCE', occurrenceId: 8, credentialSetId: 12, connectionId: 2, scopeId: 5, missingReasonCode: 'FIXTURE_UNCONFIRMED', creationSource: 'AUTOMATIC', assigneeUserId: null, assigneeDisplayName: null, dueAt: null, status: 'OPEN', version: 1, capabilities: { canAssign: false, canAddEvidence: false, canClose: false }, activities: [], eligibleClosureEvidence: { decisions: [], runScopes: [] } }
  const html = renderPage(api.SecretInvestigationDetailPage, '/secrets/triage/investigations/:taskId', '/secrets/triage/investigations/4', [[['secret-investigation', 4], task]])
  assert.match(html, /담당 미정/)
  assert.match(html, /기한 미설정/)
  assert.match(html, /기한 초과 집계에 포함하지 않아요/)
  assert.doesNotMatch(html, /<button[^>]*>조사 종료<\/button>/)
})
test('acknowledged suspected real-key alerts stay open and cannot close without eligible evidence', () => {
  const alert = { alertId: 6, credentialSetId: 12, status: 'SUSPECTED_REAL', assigneeUserId: null, assigneeDisplayName: null, dueAt: null, version: 1, testCaseId: null, investigationTaskId: 4, acknowledgedAt: '2026-10-21T00:00:00Z', lastObservedAt: '2026-10-21T00:00:00Z', locations: [], capabilities: { canAssign: false, canAcknowledge: false, canClose: false }, eligibleClosureEvidence: { fixtureAttestations: [], corrections: [], lifecycleEvidence: [] } }
  const html = renderPage(api.SecretAlertDetailPage, '/secrets/triage/alerts/:alertId', '/secrets/triage/alerts/6', [[['secret-key-alert', 6], alert]])
  assert.match(html, /자격증명 여부 조사/)
  assert.match(html, /경고 종료와 별개/)
  assert.doesNotMatch(html, /<button[^>]*>근거 확인 후 종료<\/button>/)
})
test('fixture submission requires an existing exact protected match and never accepts raw key input', () => {
  const html = renderPage(api.SecretFixtureAttestationsPage, '/secrets/:secretId/fixture-attestations', '/secrets/12/fixture-attestations', [[['secret-fixture-attestations', 12], { items: [], eligibleMatches: [], fixtureStatus: null, capabilities: { canAttest: true } }]])
  assert.match(html, /합성 여부 확인 불가/)
  assert.match(html, /실제 키가 아니라고 단정하지 않아요/)
  assert.match(html, /<button[^>]*disabled=""[^>]*>합성 근거 확인 요청<\/button>/)
  assert.doesNotMatch(html, /type="text"|textarea|원문 입력/)
})
test('an expired attestation remains an historical record and is not presented as current synthetic proof', () => {
  const data = { items: [{ attestationId: 3, scopeId: 5, scopeRevision: 1, manifestId: 6, manifestVersion: 1, status: 'ACTIVE', isCurrentlyValid: false, confirmedAt: '2026-10-20T00:00:00Z' }], eligibleMatches: [], fixtureStatus: 'POSSIBLE_REAL', capabilities: { canAttest: false } }
  const html = renderPage(api.SecretFixtureAttestationsPage, '/secrets/:secretId/fixture-attestations', '/secrets/12/fixture-attestations', [[['secret-fixture-attestations', 12], data]])
  assert.match(html, /과거 기록 · 현재 적용 불가/)
  assert.match(html, /실제 키 가능성 확인 필요/)
  assert.doesNotMatch(html, /현재 유효한 합성 근거/)
})

test('fixture writes send only existing protected match IDs and explicit versions', async () => {
  const originalFetch = globalThis.fetch, originalDocument = globalThis.document
  const calls = []
  globalThis.document = { cookie: 'XSRF-TOKEN=csrf-test' }
  globalThis.fetch = async (path, init) => { calls.push({ path, init, body: JSON.parse(init.body) }); return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }) }
  try {

    await api.attestFixture(12, { scopeId: 5, expectedScopeVersion: 2, manifestId: 3, manifestVersion: 1, matchEvidenceId: 9, idempotencyKey: 'request-1' })
    assert.equal(calls[0].path, '/api/v1/secrets/12/fixture-attestations')
    assert.equal(calls[0].body.expectedScopeVersion, 2)
    assert.equal(calls[0].body.matchEvidenceId, 9)
    assert.equal(calls[0].init.headers.get('X-XSRF-TOKEN'), 'csrf-test')
    for (const call of calls) assert.doesNotMatch(JSON.stringify(call.body), /rawSecret|approvedRef|protectedPath/)
  } finally { globalThis.fetch = originalFetch; globalThis.document = originalDocument }
})
