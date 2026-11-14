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
import { validEvidenceRef, idempotencyFor } from '../src/lib/secretEvidence.ts'
import { invalidateSecretSnapshot, isSecretSnapshotInvalidated } from '../src/lib/secretSnapshotState.ts'

const bundle = await build({ stdin: { contents: "export { SecretScopeClassificationPage } from './src/pages/SecretScopeClassificationPage'; export { SecretPolicyDetailPage } from './src/pages/SecretPolicyPages'; export * from './src/api/secretPolicy';", resolveDir: resolve('.') }, bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, alias: { '@': resolve('src') } })
const bundlePath = resolve('node_modules/.secret-policy-governance-test.mjs')
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
const policy = { policyId: 3, version: 2, status: 'DRAFT', reasonCode: 'AUTHORIZED_STORAGE', evidenceRef: 'POLICY:SEC-3', createdByUserId: 7, approvedByUserId: null, createdAt: '2026-10-21T00:00:00Z', validFrom: '2026-10-21T00:00:00Z', validUntil: null, approvedAt: null, retiredAt: null, usableNow: false, rules: [{ ruleId: 1, connectionId: 2, scopeId: 5, contentType: 'GITHUB_REPOSITORY_FILES', effect: 'ALLOW', pathMatch: 'EXACT', protectedPathCondition: 'must-not-display-path' }], capabilities: { canApprove: false, canRetire: false, canCreateVersion: true } }
const classification = { scopeId: 5, connectionId: 2, displayName: '범위 #5', contentType: 'GITHUB_REPOSITORY_FILES', scopeRevision: 1, scopeVersion: 2, origin: 'PRODUCTION', originVersion: 2, storagePolicyId: null, storagePolicyVersion: null, policyStatus: 'POLICY_PENDING', approvalStatus: 'APPROVED', approvedAt: '2026-10-21T00:00:00Z', approvedByUserId: 9, storagePolicy: null, pendingProposal: { proposalId: 12, scopeId: 5, expectedScopeVersion: 2, version: 1, origin: 'TEST', storagePolicyId: null, storagePolicyVersion: null, status: 'PENDING_APPROVAL', proposedByUserId: 7, createdAt: '2026-10-21T00:00:00Z', reasonCode: 'POLICY_PENDING', evidenceRef: 'TICKET:SEC-12' }, history: [], capabilities: { canPropose: false, canApprove: false, canReject: false, canDraftPolicy: false } }

test('evidence references reject keys, source paths and URLs', () => {
  for (const ref of ['TICKET:SEC-123', 'CHANGE:OPS-12', 'POLICY:SECRET-12']) assert.ok(validEvidenceRef(ref))
  for (const ref of ['https://example.invalid', 'ghp_secret', 'C:\\secrets.txt', 'TICKET:SEC-123\nraw', 'secret=value']) assert.equal(validEvidenceRef(ref), false)
})
test('idempotency keys are stable for retries and replaced after payload changes', () => {
  const ref = { current: { payload: '', key: '' } }
  const first = idempotencyFor(ref, { version: 1, decision: 'NORMAL' })
  assert.equal(idempotencyFor(ref, { version: 1, decision: 'NORMAL' }), first)
  assert.notEqual(idempotencyFor(ref, { version: 2, decision: 'NORMAL' }), first)
})
test('locally invalidated snapshots cannot be silently reused after a security change', () => {
  assert.equal(isSecretSnapshotInvalidated('test-inventory'), false)
  invalidateSecretSnapshot('test-inventory')
  assert.equal(isSecretSnapshotInvalidated('test-inventory'), true)
})
test('classification mismatch retains the return path and exposes no change forms', () => {
  const html = renderPage(api.SecretScopeClassificationPage, '/secrets/connections/:connectionId/scopes/:scopeId', '/secrets/connections/99/scopes/5', [[['secret-classification', 5], classification]])
  assert.match(html, /선택한 연결과 승인 범위가 일치하지 않아요/)
  assert.doesNotMatch(html, /변경 승인 요청|정책 초안 등록|변경 승인<\/button>/)
})
test('a pending TEST proposal never replaces current PRODUCTION and its author cannot approve', () => {
  const html = renderPage(api.SecretScopeClassificationPage, '/secrets/connections/:connectionId/scopes/:scopeId', '/secrets/connections/2/scopes/5', [[['secret-classification', 5], classification]])
  assert.match(html, /이 대상의 현재 설정/)
  assert.doesNotMatch(html, /자료 용도<\/dt>|제안 출처<\/dt>/)
  assert.match(html, /이전 관리 방식에서 제출한 변경/)
  assert.match(html, /검토가 끝나기 전까지 현재 설정에 적용되지 않아요/)
  assert.doesNotMatch(html, /<button[^>]*>변경 승인<\/button>/)
})
test('policy details keep protected paths private and hide self approval', () => {
  const html = renderPage(api.SecretPolicyDetailPage, '/secrets/connections/policies/:policyId/versions/:version', '/secrets/connections/policies/3/versions/2', [[['secret-policy', 3, 2], policy]])
  assert.match(html, /보호된 세부 경로 조건/)
  assert.match(html, /현재 적용 불가/)
  assert.doesNotMatch(html, /must-not-display-path|<button[^>]*>정책 승인<\/button>/)
})

test('scope policy editing retains real classification without offering a source mode', () => {
  const value = { ...classification, origin: 'UNCLASSIFIED', pendingProposal: null, capabilities: { canPropose: true, canDraftPolicy: true, canClassifySource: true }, setupReasonCodes: ['POLICY_MISSING'] }
  const html = renderPage(api.SecretScopeClassificationPage, '/secrets/connections/:connectionId/scopes/:scopeId', '/secrets/connections/2/scopes/5', [[['secret-classification', 5], value]])
  assert.match(html, /보관 허용·금지 정책 변경/)
  assert.match(html, /저장 방식 확인/)
  assert.match(html, /적용할 보관 정책/)
  assert.doesNotMatch(html, /운영·시험|자료 용도|현재 출처|분류 저장|출처 저장/)
})

test('pending review shows waiting owner without granting approval to the requester', () => {
  const value = { ...classification, eligibleReviewers: [{ userId: 9, displayName: '검토 담당자' }], pendingProposal: { ...classification.pendingProposal, reviewerUserId: 9 }, capabilities: { ...classification.capabilities, canAssignReviewer: true } }
  const html = renderPage(api.SecretScopeClassificationPage, '/secrets/connections/:connectionId/scopes/:scopeId', '/secrets/connections/2/scopes/5', [[['secret-classification', 5], value]])
  assert.match(html, /검토 담당자 지정/)
  assert.match(html, /스스로 승인할 수 없어요/)
  assert.doesNotMatch(html, /<button[^>]*>변경 승인<\/button>/)
})
test('scope details distinguish remaining policy work from saved source classification', () => {
  const value = { ...classification, pendingProposal: null, policyStatus: 'EXPIRED', storagePolicy: { policyId: 3, version: 2 }, setupReasonCodes: ['POLICY_EXPIRED'], capabilities: { canPropose: false, canDraftPolicy: false, canClassifySource: false } }
  const html = renderPage(api.SecretScopeClassificationPage, '/secrets/connections/:connectionId/scopes/:scopeId', '/secrets/connections/2/scopes/5', [[['secret-classification', 5], value]])
  assert.match(html, /이 대상에서 남은 일/)
  assert.match(html, /<strong>보관 정책<\/strong><span>보관 정책 만료/)
  assert.doesNotMatch(html, /자료 용도<\/dt>|제안 출처<\/dt>/)
  assert.match(html, /<dt>보관 정책<\/dt><dd><span>보관 정책 만료<\/span><a/)
  assert.ok(html.indexOf('이 대상에서 남은 일') < html.indexOf('보관 허용·금지 정책 변경</summary>'))
})

test('approval preview is read-only POST and assignment includes optimistic version and retry key', async () => {
  const originalFetch = globalThis.fetch, originalDocument = globalThis.document
  const calls = []
  globalThis.document = { cookie: 'XSRF-TOKEN=csrf-test' }
  globalThis.fetch = async (path, init) => { calls.push({ path, init, body: JSON.parse(init.body) }); return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }) }
  try {
    await api.previewScopeClassification(5, { origin: 'PRODUCTION', storagePolicyId: null, storagePolicyVersion: null, expectedScopeVersion: 2 })
    await api.assignScopeReviewer(5, 12, { reviewerUserId: 9, expectedProposalVersion: 1, idempotencyKey: 'reviewer-retry' })
    assert.equal(calls[0].path, '/api/v1/secrets/scopes/5/classification-preview')
    assert.equal(calls[1].init.method, 'PATCH')
    assert.deepEqual(calls[1].body, { reviewerUserId: 9, expectedProposalVersion: 1, idempotencyKey: 'reviewer-retry' })
    assert.equal(calls[1].init.headers.get('X-XSRF-TOKEN'), 'csrf-test')
  } finally { globalThis.fetch = originalFetch; globalThis.document = originalDocument }
})
test('policy writes send only IDs, controlled references and explicit versions', async () => {
  const originalFetch = globalThis.fetch, originalDocument = globalThis.document
  const calls = []
  globalThis.document = { cookie: 'XSRF-TOKEN=csrf-test' }
  globalThis.fetch = async (path, init) => { calls.push({ path, init, body: JSON.parse(init.body) }); return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }) }
  try {
    await api.proposeScopeClassification(5, { origin: 'TEST', storagePolicyId: null, storagePolicyVersion: null, reasonCode: 'POLICY_PENDING', evidenceRef: 'TICKET:SEC-12', expectedScopeVersion: 2 })

    assert.equal(calls[0].path, '/api/v1/secrets/scopes/5/classification-proposals')
    assert.equal(calls[0].body.expectedScopeVersion, 2)

    assert.equal(calls[0].init.headers.get('X-XSRF-TOKEN'), 'csrf-test')
    for (const call of calls) assert.doesNotMatch(JSON.stringify(call.body), /rawSecret|approvedRef|protectedPath/)
  } finally { globalThis.fetch = originalFetch; globalThis.document = originalDocument }
})
