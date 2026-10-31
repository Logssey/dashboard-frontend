import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { build } from 'esbuild'
const output = await build({ stdin: { contents: "export * from './src/api/secretPermissionAssistance'; export * from './src/lib/secretPermissionAssistance'; export * from './src/lib/secretRiskForms'; export * from './src/components/SecretPermissionAssistance';", resolveDir: resolve('.') }, bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, alias: { '@': resolve('src') } })
const modulePath = resolve('node_modules/.permission-assistance-test.mjs'); await writeFile(modulePath, output.outputFiles[0].contents); const api = await import(pathToFileURL(modulePath).href); after(() => unlink(modulePath))
const now = Date.now(), observedAt = new Date(now - 60000).toISOString(), expiresAt = new Date(now + 3600000).toISOString()
const toInput = (value) => new Date(Date.parse(value) + 9 * 3600000).toISOString().slice(0, 16)
const sources = [{ type: 'VALIDATION_ATTEMPT', role: 'BINDS_IDENTITY', id: 9, version: 1 }, { type: 'RISK_EVIDENCE', role: 'CLASSIFIES', id: 5, version: 2 }, { type: 'INVESTIGATION_HISTORY', role: 'ASSERTS', id: 13, version: 1 }, { type: 'INVESTIGATION_HISTORY', role: 'LIMITS', id: 13, version: 1 }]
const preview = { observationId: 10, status: 'PARTIAL', capabilities: ['RESOURCE_READ', 'secret-sentinel'], coverage: { permissionCoverage: 'PARTIAL', targetCoverage: 'UNKNOWN', restrictionCoverage: 'UNKNOWN', classificationCoverage: 'UNKNOWN' }, reasonCodes: ['secret-sentinel'], observedAt, expiresAt, contextVersion: 'opaque-current-context', evidenceRevision: 3, availableSourceRefs: sources, canConfirm: true, blockedReasonCodes: [] }
const input = { capability: 'RESOURCE_READ', targetScope: 'ASSET', coverage: { permissionCoverage: 'COMPLETE', targetCoverage: 'COMPLETE', restrictionCoverage: 'COMPLETE', classificationCoverage: 'COMPLETE' }, selectedSourceKeys: sources.map(api.riskSourceKey), evidenceRef: 'TICKET:SEC-123', attestedAt: new Date(now).toISOString(), until: toInput(expiresAt), attested: true }
const context = { occurrenceId: 8, contextVersion: 'opaque-current-context', evidenceRevision: 3, support: { status: 'PARTIAL', reasonCodes: [] }, identity: { provider: 'AWS', status: 'MATCHED', validationAttemptId: 9, observedAt }, collectorOptions: [{ connectionId: 2, displayName: '승인된 읽기 연결' }], latestRequest: null, latestObservation: preview, capabilities: { canRequest: true, blockedReasonCodes: [] } }
function render(Component, props, seeds = []) { const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); seeds.forEach(([key, value]) => client.setQueryData(key, value)); const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, createElement(Component, props)))); client.clear(); return html }
test('observation never prefills full coverage or accepts a grade without deliberate manual facts and parents', () => {
  assert.equal(api.permissionConfirmationFacts(preview, 3, { ...input, attested: false }, now), null)
  assert.equal(api.permissionConfirmationFacts(preview, 3, { ...input, coverage: {} }, now), null)
  assert.equal(api.permissionConfirmationFacts(preview, 3, { ...input, coverage: { ...input.coverage, restrictionCoverage: 'PARTIAL' } }, now), null)
  assert.equal(api.permissionConfirmationFacts(preview, 3, { ...input, attestedAt: new Date(now - 120000).toISOString() }, now), null)
  for (let i = 0; i < sources.length; i++) assert.equal(api.permissionConfirmationFacts(preview, 3, { ...input, selectedSourceKeys: input.selectedSourceKeys.filter((_, index) => index !== i) }, now), null)
  const ready = api.permissionConfirmationFacts(preview, 3, input, now)
  assert.equal(ready.attestation, true); assert.equal(ready.observedAt, input.attestedAt); assert.equal(ready.facts.permissionCoverage, 'COMPLETE'); assert.equal(ready.expectedContextVersion, preview.contextVersion)
  assert.doesNotMatch(JSON.stringify(ready), /impact|severity|PROVIDER_OBSERVED|secret-sentinel/)
})
test('stale, wrong revision, unavailable capability and extra assertion fields cannot be confirmed', () => {
  assert.equal(api.permissionConfirmationFacts({ ...preview, expiresAt: new Date(now - 1).toISOString() }, 3, input, now), null)
  assert.equal(api.permissionConfirmationFacts(preview, 4, input, now), null)
  assert.equal(api.permissionConfirmationFacts({ ...preview, canConfirm: false }, 3, input, now), null)
  assert.equal(api.permissionConfirmationFacts(preview, 3, { ...input, capability: 'IDENTITY_ADMINISTRATION' }, now), null)
  assert.equal(api.permissionConfirmationFacts(preview, 3, { ...input, coverage: { ...input.coverage, impact: 'ADMIN' } }, now), null)
  assert.equal(api.permissionConfirmationFacts(preview, 3, { ...input, targetScope: '__proto__' }, now), null)
  assert.equal(api.permissionConfirmationFacts(preview, 3, { ...input, until: toInput(new Date(now + 7200000).toISOString()) }, now), null)
  assert.equal(api.permissionConfirmationFacts(preview, 3, { ...input, evidenceRef: 'https://provider/secret' }, now), null)
})
test('manual review shows observation limitations and never preselects a coverage value', () => {
  const html = render(api.PermissionReviewForm, { occurrenceId: 8, preview, evidenceRevision: 3, onUpdated() {}, onStale() {} })
  assert.match(html, /자동으로 영향도나 등급을 확정하지 않아요/); assert.match(html, /직접 확인한 값 선택/)
  assert.doesNotMatch(html, /value="COMPLETE" selected|checked=""|secret-sentinel|textarea|type="file"/)
  assert.match(html, /검토한 권한 근거 저장/); assert.match(html, /확인 자료의 기록 번호/); assert.match(html, /TICKET·CHANGE·POLICY로 시작하는 실제 내부 기록 번호/)
  assert.match(html, /disabled=""/)
})
test('missing independent proof links the exact existing investigation and the relevant asset form', () => {
  const value = { ...preview, availableSourceRefs: [], canConfirm: false, blockedReasonCodes: ['ASSET_CLASSIFICATION_REQUIRED', 'PERMISSION_ASSERTION_REQUIRED'], supplementation: { investigationTaskId: 31, occurrenceVersion: 4, canRequestInvestigation: true } }
  const html = render(api.PermissionReviewForm, { occurrenceId: 8, preview: value, evidenceRevision: 3, onUpdated() {}, onStale() {}, onSupplement() {} })
  assert.match(html, /자산 분류 보완/); assert.match(html, /href="\/secrets\/triage\/investigations\/31"/)
  assert.match(html, /추가 조사에서 권한·대상 확인 자료/); assert.doesNotMatch(html, /검토한 권한 근거 저장|VALIDATION_ATTEMPT|INVESTIGATION_HISTORY|type="number"/)
  const reviewed = render(api.PermissionReviewForm, { occurrenceId: 8, preview: { ...preview, decision: 'REJECTED', canConfirm: false, canReject: true }, evidenceRevision: 3, onUpdated() {}, onStale() {} })
  assert.match(reviewed, /이미 검토를 기록한 자료/); assert.doesNotMatch(reviewed, /자료 제외 기록|검토한 권한 근거 저장/)
})
test('GitHub observations identify reused validation facts without implying a fresh permissions lookup', () => {
  const data = { ...context, identity: { ...context.identity, provider: 'GITHUB', principalType: 'GITHUB_USER' }, latestObservation: { ...preview, sourceBasis: 'RECENT_VALIDATION_METADATA' } }
  const html = render(api.SecretPermissionAssistance, { occurrenceId: 8, evidenceRevision: 3, onReload() {} }, [[['secret-permission-assistance', 8, 3], data]])
  assert.match(html, /최근 유효성 확인에서 수집한 토큰 정보/); assert.match(html, /자료 관측/); assert.doesNotMatch(html, /secret-sentinel|principal_ref|principal_id/)
  const first = api.permissionConfirmationFacts(preview, 3, input, now), retry = api.permissionConfirmationFacts(preview, 3, input, now + 1000)
  assert.deepEqual(first, retry); assert.equal(first.observedAt, input.attestedAt)
})
test('unavailable identity and unsupported provider disable requests with the next meaningful action', () => {
  const data = { ...context, support: { status: 'UNSUPPORTED', reasonCodes: ['PROVIDER_UNSUPPORTED'] }, identity: { ...context.identity, status: 'UNAVAILABLE', observedAt: null }, latestObservation: null, capabilities: { canRequest: false, blockedReasonCodes: ['IDENTITY_UNAVAILABLE'] } }
  const html = render(api.SecretPermissionAssistance, { occurrenceId: 8, evidenceRevision: 3, onReload() {} }, [[['secret-permission-assistance', 8, 3], data]])
  assert.match(html, /먼저 키 유효성을 확인/); assert.match(html, /현재 연결 근거 없음/)
  assert.match(html, /disabled="">권한 정보 가져오기/); assert.doesNotMatch(html, /권한 조회 완료|등급 확정/)
})
test('old unknown request state cannot be mistaken for completion and provider errors stay safe', () => {
  assert.equal(api.completedPermissionRequest('UNKNOWN'), false); assert.equal(api.activePermissionRequest('LEASED'), true)
  assert.equal(api.permissionRequestStatus('secret-sentinel'), '상태 확인 필요'); assert.doesNotMatch(api.permissionReason('secret-sentinel'), /secret-sentinel/)
  const data = { ...context, latestRequest: { requestId: 4, jobId: 5, status: 'UNKNOWN' } }
  const html = render(api.SecretPermissionAssistance, { occurrenceId: 8, evidenceRevision: 3, onReload() {} }, [[['secret-permission-assistance', 8, 3], data], [['secret-permission-request', 8, 4], data.latestRequest]])
  assert.match(html, /요청 종료 여부를 확인할 수 없어요/); assert.match(html, /disabled="">권한 정보 가져오기/)
  assert.doesNotMatch(html, /secret-sentinel/)
})
test('permission assistance APIs use only IDs, expected context and safe manual proof with CSRF', async () => {
  const originalFetch = globalThis.fetch, originalDocument = globalThis.document, calls = []
  globalThis.document = { cookie: 'XSRF-TOKEN=csrf-permissions' }; globalThis.fetch = async (url, init) => { calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null }); return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }) }
  try {
    await api.requestPermissionAssistance(8, { expectedContextVersion: 'opaque', collectorConnectionId: 2, idempotencyKey: 'stable-request' }); await api.fetchPermissionRequest(8, 4); await api.fetchPermissionPreview(8, 10)
    await api.confirmPermissionObservation(8, 10, { ...api.permissionConfirmationFacts(preview, 3, input, now), idempotencyKey: 'stable-proof' })
    await api.rejectPermissionObservation(8, 10, { expectedContextVersion: 'opaque', idempotencyKey: 'stable-reject', reasonCode: 'INSUFFICIENT_EVIDENCE' })
    assert.equal(calls[0].init.headers.get('X-XSRF-TOKEN'), 'csrf-permissions'); assert.match(calls[1].url, /occurrences\/8\/permission-assistance\/requests\/4$/)
    assert.equal(calls[3].body.facts.capability, 'RESOURCE_READ'); assert.equal(calls[3].body.sourceRefs.length, 4); assert.equal(calls[3].body.attestation, true)
    assert.doesNotMatch(JSON.stringify(calls), /rawSecret|secret-sentinel|PROVIDER_OBSERVED/)
  } finally { globalThis.fetch = originalFetch; globalThis.document = originalDocument }
})
