import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { build } from 'esbuild'
const bundle = await build({ stdin: { contents: "export * from './src/components/SecretTaskGuidance'; export * from './src/lib/secretTaskGuidance'; export * from './src/lib/secretInvestigationClosure'; export * from './src/api/secretInvestigations'; export * from './src/lib/secretScopeSetup'; export * from './src/lib/secretNavigation';", resolveDir: resolve('.') }, bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, alias: { '@': resolve('src') } })
const path = resolve('node_modules/.secret-task-guidance-test.mjs')
await writeFile(path, bundle.outputFiles[0].contents)
const api = await import(pathToFileURL(path).href)
after(() => unlink(path))
const guidance = { whyHereCode: 'PENDING_REVIEW', nextActionCode: 'REVIEW_SCOPE_CHANGE', priorityReasonCodes: [], evidenceObservedAt: null, target: { type: 'SCOPE', id: 5, connectionId: 2 }, canExecute: false, blockedReasonCode: 'INDEPENDENT_REVIEW_REQUIRED', requiredRole: 'SECURITY', waitingSince: null, relatedTaskId: 4, remainingReasonCodes: ['PENDING_REVIEW'] }
test('blocked guidance explains the required role and links to the existing request', () => {
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(api.SecretTaskGuidance, { guidance })))
  assert.match(html, /다른 보안 담당자의 검토/)
  assert.match(html, /필요한 역할: 보안 담당자/)
  assert.match(html, /\/secrets\/triage\/investigations\/4/)
  assert.doesNotMatch(html, /<button|approve/)
})
test('navigation only accepts known target kinds and positive internal IDs', () => {
  assert.equal(api.guidanceTargetPath(guidance), '/secrets/connections/2/scopes/5')
  assert.equal(api.guidanceTargetPath({ ...guidance, target: { type: 'https://untrusted.invalid', id: 5 } }), null)
  assert.equal(api.guidanceTargetPath({ ...guidance, target: { type: 'CASE', id: -1 } }), null)
})
test('a changed scope can return to fresh results without reusing its previous snapshot', () => {
  const path = api.refreshedWorkbenchReturn('origin=TEST&source=GITHUB&bucket=UNCLASSIFIED&snapshotId=old&page=3&focus=5')
  assert.match(path, /origin=TEST/); assert.match(path, /source=GITHUB/)
  assert.doesNotMatch(path, /snapshot|page=|focus=/)
})
test('investigation completion uses a matching result type rather than a manual status', () => {
  const options = api.investigationClosureOptions({ eligibleClosureEvidence: { decisions: [], runScopes: [], scopeDecisions: [{ scopeOriginDecisionId: 7 }], policyBindings: [{ policyBindingId: 8 }], acceptedEvidence: [{ historyId: 9 }] } })
  assert.deepEqual(options.map((entry) => entry.value), ['origin:7', 'policy:8', 'evidence:9'])
  const request = api.investigationClosureRequest('policy:8', 3)
  assert.equal(request.policyBindingId, 8)
  assert.equal(request.resolvingDecisionId, null)
  assert.equal(request.acceptedEvidenceHistoryId, null)
})
test('handoff requests carry the readable target version and a stable retry key', async () => {
  const oldFetch = globalThis.fetch, oldDocument = globalThis.document; const calls = []
  globalThis.document = { cookie: 'XSRF-TOKEN=csrf-test' }
  globalThis.fetch = async (path, init) => { calls.push({ path, init }); return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }) }
  try {
    await api.requestInvestigation({ targetType: 'SCOPE', targetId: 5, missingReasonCode: 'SOURCE_CLASSIFICATION', expectedTargetVersion: 3, idempotencyKey: 'retry-safe' })
    assert.equal(calls[0].path, '/api/v1/secrets/investigations')
    assert.equal(JSON.parse(calls[0].init.body).expectedTargetVersion, 3)
    assert.equal(calls[0].init.headers.get('X-XSRF-TOKEN'), 'csrf-test')
    assert.doesNotMatch(calls[0].init.body, /rawSecret|approvedRef|status/)
  } finally { globalThis.fetch = oldFetch; globalThis.document = oldDocument }
})

test('secret navigation has five task-oriented entries and keeps detail pages in their section', () => {
  assert.deepEqual(api.secretNavigation.map((entry) => entry.label), ['현황', '키·노출 위치', '대응 관리', '연결 관리', '스캔 이력', '키 형식 등록'])
  assert.equal(api.activeSecretNavigation('/secrets/findings', '/secrets/triage/12'), true)
  assert.equal(api.activeSecretNavigation('/secrets/findings', '/secrets/12'), true)
  assert.equal(api.activeSecretNavigation('/secrets', '/secrets/12'), false)
  assert.equal(api.activeSecretNavigation('/secrets/cases', '/secrets/cases/7'), true)
})
