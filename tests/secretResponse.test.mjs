import assert from 'node:assert/strict'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { build } from 'esbuild'

const entries = { response: 'src/lib/secretResponse.ts', workflow: 'src/components/SecretCaseWorkflow.tsx', api: 'src/api/secretCases.ts', revalidation: 'src/api/secretCaseRevalidations.ts', lifecycle: 'src/components/SecretLifecycleEvidence.tsx' }
const modules = {}, paths = []
for (const [key, entry] of Object.entries(entries)) {
  const built = await build({ entryPoints: [resolve(entry)], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', alias: { '@': resolve('src') } })
  const path = resolve(`node_modules/.secret-response-${key}-test.mjs`)
  paths.push(path); await writeFile(path, built.outputFiles[0].contents); modules[key] = await import(pathToFileURL(path).href)
}
after(() => Promise.all(paths.map((path) => unlink(path))))
const { parseCaseFilters, caseDetailPath, caseReturnPath, validActionReference, validActionTime, locationNextAction } = modules.response
const occurrence = { occurrenceId: 11, safeLocationLabel: '위치 #11', responseStatus: 'OPEN', version: 2, assignedTeam: 'Platform', assignedUserId: 4, canAssign: false, canRecordAction: false, canCompleteActions: false, lastMaterialActionAt: null }
const detail = { caseId: 7, version: 3, isCurrent: true, stage: 'OPEN', occurrences: [occurrence], checklist: [], capabilities: { canRecordAction: true, canAssign: true, canUpdateChecklist: true } }
const common = { onReload() {}, onStale() {}, disabled: false }
function render(Component, props, seeds = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  for (const [key, data] of seeds) client.setQueryData(key, data)
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Component, { ...common, ...props })))
}
test('case detail round trip keeps filters, page and focus without accepting an external return', () => {
  const { filters, valid } = parseCaseFilters(new URLSearchParams('origin=TEST&scope=history&stages=RESOLVED&assignmentStatus=PERSONAL&assignee=ME&page=4'))
  assert.equal(valid, true)
  const href = caseDetailPath(7, filters, 11)
  assert.match(href, /^\/secrets\/cases\/7\?/)
  const returnPath = caseReturnPath(new URL(href, 'http://local').searchParams, 7)
  const params = new URL(returnPath, 'http://local').searchParams
  assert.equal(params.get('origin'), 'TEST'); assert.equal(params.get('page'), '4'); assert.equal(params.get('focus'), '7')
  assert.match(caseReturnPath(new URLSearchParams('returnQuery=https://evil.invalid'), 7), /^\/secrets\/cases\?/)
  assert.equal(parseCaseFilters(new URLSearchParams('page=0&stages=FAKE')).valid, false)
})
test('external action references and times reject secrets, paths and stale or future reports', () => {
  for (const value of ['ghp_12345', 'https://example.com', 'fixtures/config.env', 'POLICY:SEC-12', 'TICKET:sec-12']) assert.equal(validActionReference(value), false)
  assert.equal(validActionReference('CHANGE:SEC-123'), true)
  const now = Date.parse('2026-10-21T10:00:00Z')
  assert.equal(validActionTime('2026-10-21T10:03:00Z', now), true)
  assert.equal(validActionTime('2026-10-21T10:10:00Z', now), false)
  assert.equal(validActionTime('2026-09-01T10:00:00Z', now), false)
})
test('coordinator or case-wide rights do not reveal a location action form', () => {
  const html = render(modules.workflow.SecretCaseWorkflow, { detail, occurrence })
  assert.doesNotMatch(html, /외부 조치 저장|이 위치를 재검사 대기로|보안 검토|조치 시작/)
  assert.match(html, /현재 권한과 위치 상태/)
})
test('a remediator records actual work without a duplicate review or empty start step', () => {
  const location = { ...occurrence, canRecordAction: true }
  const html = render(modules.workflow.SecretCaseWorkflow, { detail, occurrence: location })
  assert.match(html, /외부 조치 기록/); assert.match(html, /키 원문·URL·자유 메모/)
  assert.doesNotMatch(html, /보안 검토|조치 시작|이 위치를 재검사 대기로/)
  assert.equal(locationNextAction({ ...location, assignedUserId: null, assignedTeam: null }), '담당자 지정')
})
test('manual lifecycle approval is visibly distinct from provider verification', () => {
  const html = render(modules.lifecycle.SecretLifecycleEvidence, { detail }, [[['secret-case-lifecycle', 7], { items: [{ evidenceId: 8, kind: 'REVOKED', verificationLevel: 'APPROVED_MANUAL', reviewStatus: 'APPROVED', evidenceRef: 'CHANGE:SEC-123', performedAt: '2026-10-20T00:00:00Z', observedAt: null, version: 1, limitations: [], capabilities: { canReview: false } }], allowedKinds: [], allowedReviewReasonCodes: {}, capabilities: { canSubmit: false } }]])
  assert.match(html, /수동 근거 승인/); assert.match(html, /공급자 상태를 자동 검증한 결과는 아니/)
  assert.doesNotMatch(html, /<summary>폐기·교체 근거 제출/)
})
test('commands include both location and case versions, and never call legacy review/start/resolve', async () => {
  const originalFetch = globalThis.fetch, originalDocument = globalThis.document
  const calls = []
  globalThis.document = { cookie: 'XSRF-TOKEN=csrf' }
  globalThis.fetch = async (path, options) => { calls.push({ path, body: JSON.parse(options.body) }); return new Response(JSON.stringify({ targetId: 7, version: 4, status: 'IN_PROGRESS' }), { status: 200, headers: { 'content-type': 'application/json' } }) }
  try {
    const versions = { expectedCaseVersion: 3, expectedOccurrenceVersion: 2, idempotencyKey: 'test-stable-id' }
    await modules.api.recordSecretCaseAction(7, { ...versions, occurrenceId: 11, actionType: 'REVOKED', performedAt: '2026-10-20T00:00:00Z', evidenceRef: 'CHANGE:SEC-123' })
    await modules.api.completeSecretLocationActions(7, 11, versions)
    await modules.revalidation.requestSecretCaseRevalidation(7, { ...versions, occurrenceId: 11 })
    await modules.revalidation.resumeSecretCase(7, { ...versions, occurrenceId: 11, reasonCode: 'REVALIDATION_PRESENT' })
    for (const call of calls) { assert.equal(call.body.expectedCaseVersion, 3); assert.equal(call.body.expectedOccurrenceVersion, 2); assert.equal(call.body.idempotencyKey, 'test-stable-id'); assert.equal('expectedVersion' in call.body, false); assert.doesNotMatch(call.path, /\/(review|start|resolve)$/) }
  } finally { globalThis.fetch = originalFetch; globalThis.document = originalDocument }
})
