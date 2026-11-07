import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { build } from 'esbuild'
const built = await build({ stdin: { contents: "export * from './src/api/secretUsage'; export * from './src/lib/secretUsage'; export * from './src/components/SecretUsageHistory'; export * from './src/components/SecretUsageForms'; export * from './src/components/SecretKeyHistory';", resolveDir: resolve('.') }, bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, alias: { '@': resolve('src') } })
const modulePath = resolve('node_modules/.secret-usage-test.mjs')
await writeFile(modulePath, built.outputFiles[0].contents)
const api = await import(pathToFileURL(modulePath).href)
after(() => unlink(modulePath))
const now = Date.now(), stamp = new Date(now - 60000).toISOString(), start = new Date(now - 7 * 86400000).toISOString()
const kst = (value) => new Date(Date.parse(value) + 9 * 3600000).toISOString().slice(0, 16)
const location = { occurrenceId: 8, safeLocationLabel: '승인된 문서 위치', source: 'GITHUB', origin: 'PRODUCTION', capabilities: {} }
const observation = { observationId: 1, credentialId: 12, occurrenceId: 8, evidenceRevision: 2, sourceKind: 'MANUAL', bindingLevel: 'PRINCIPAL_ONLY', coverageStatus: 'UNKNOWN', actionCode: 'RESOURCE_CHANGE', operationCode: 'UNKNOWN', actionResult: 'SUCCESS', actorAttribution: 'UNATTRIBUTED', eventAt: stamp, windowStart: start, windowEnd: new Date(now).toISOString(), sourceRef: { type: 'INVESTIGATION_HISTORY', id: 3 }, targetRef: { type: 'APPROVED_SCOPE', id: 5 }, reviewStatus: 'PENDING', observationRevision: 0, allowedDecisions: ['ACCEPT', 'REJECT', 'WITHDRAW'], decisionHistory: [], currentApplicable: true }
const context = { credentialId: 12, occurrenceId: 8, credentialRevision: 2, scopeRevision: 3, support: { status: 'PARTIAL', reasonCodes: ['MANAGEMENT_EVENTS_ONLY'] }, capabilities: { canRequest: true, canSubmit: true, blockedReasonCodes: [] }, targetOptions: [{ targetId: 5, displayName: 'AWS 승인 조회', accountRef: '계정 #1', region: 'ap-northeast-2' }], availableSourceRefs: [{ type: 'INVESTIGATION_HISTORY', id: 3 }], availableTargetRefs: [{ type: 'APPROVED_SCOPE', id: 5 }], latestRequest: null, observationStatus: 'NOT_REQUESTED', iamLastUsed: null, observations: { items: [observation], page: 1, pageSize: 20, totalElements: 1 } }
const request = { requestId: 10, credentialId: 12, occurrenceId: 8, evidenceRevision: 2, status: 'COMPLETE', observationStatus: 'NOT_OBSERVED_IN_SCOPE', coverageStatus: 'COMPLETE', bindingLevel: 'EXACT_CREDENTIAL', reasonCodes: [], windowStart: start, windowEnd: stamp, requestedAt: stamp, startedAt: stamp, completedAt: stamp, pageCount: 1, eventCount: 0, target: context.targetOptions[0], currentApplicable: true }
function render(Component, props, seeds = [], url = '/secrets/12?tab=validation&historyView=usage&occurrence=8') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } })
  seeds.forEach(([key, value]) => client.setQueryData(key, value))
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: [url] }, createElement(Component, props))))
  client.clear()
  return html
}
const detail = { iamMetadata: { lastUsedAt: stamp, lastUsedService: 'ec2', lastUsedRegion: 'ap-northeast-2', observedAt: stamp } }
const viewProps = { secretId: 12, detail, locations: [location] }
test('zero completed usage, partial observed facts and no request remain different results', () => {
  const zero = render(api.UsageRequestSummary, { request })
  assert.match(zero, /조회 범위에서 관측 0건/)
  assert.match(zero, /이 키와 연결 확인/)
  assert.match(zero, /데이터 이벤트는 확인 범위 밖/)
  assert.doesNotMatch(zero, /한 번도 사용|미사용 키|악용 없음/)
  const partial = render(api.UsageRequestSummary, { request: { ...request, status: 'PARTIAL', observationStatus: 'OBSERVED', coverageStatus: 'PARTIAL', bindingLevel: 'PRINCIPAL_ONLY', eventCount: 1, reasonCodes: ['PAGE_LIMIT_REACHED'] } })
  assert.match(partial, /사용 자료 확인/)
  assert.match(partial, /일부 범위만 확인/)
  assert.match(partial, /같은 주체의 다른 키/)
  assert.match(partial, /조회 페이지 한도/)
  const unrequested = render(api.SecretUsageHistory, viewProps, [[['secret-usage', 12, 8, 1], { ...context, observations: { ...context.observations, items: [], totalElements: 0 } }]])
  assert.match(unrequested, /아직 조회하지 않음/)
  assert.doesNotMatch(unrequested, /조회 범위에서 관측 0건/)
})
test('IAM metadata stays separate from event results and unsupported providers expose only authorized manual material', () => {
  const data = { ...context, iamLastUsed: { lastUsedAt: stamp, service: 'ec2', region: 'ap-northeast-2', observedAt: stamp }, support: { status: 'UNSUPPORTED', reasonCodes: ['PROVIDER_USAGE_UNSUPPORTED'] }, capabilities: { canRequest: false, canSubmit: true, blockedReasonCodes: [] } }
  const html = render(api.SecretUsageHistory, viewProps, [[['secret-usage', 12, 8, 1], data]])
  assert.match(html, /IAM 최근 사용 정보/)
  assert.match(html, /전체 사용 이벤트와 정상 업무·사고 여부는 따로/)
  assert.match(html, /자동 사용 조회를 지원하지 않아요/)
  assert.match(html, /자료 제출/)
  assert.doesNotMatch(html, /AWS 조회 요청|사용 이력 조회 요청|권한 정보 가져오기/)
})
test('a selected location with no allowed IAM metadata never revives key-level fallback metadata', () => {
  const html = render(api.SecretUsageHistory, { ...viewProps, detail: { iamMetadata: { ...detail.iamMetadata, lastUsedService: 'fallback-sentinel' } } }, [[['secret-usage', 12, 8, 1], context]])
  assert.match(html, /현재 선택 위치에서 열람할 수 있는 IAM 최근 사용 메타데이터가 없어요/)
  assert.doesNotMatch(html, /fallback-sentinel|<h3>IAM 최근 사용 정보/)
})
test('manual data uses current registered parents, half-open bounded periods and server-owned identity', () => {
  const input = { source: 'INVESTIGATION_HISTORY:3', target: 'APPROVED_SCOPE:5', from: kst(start), until: kst(new Date(now).toISOString()), eventAt: kst(stamp), action: 'RESOURCE_CHANGE', result: 'SUCCESS', actor: 'UNATTRIBUTED' }
  const body = api.manualUsagePayload(context, input, now)
  assert.equal(body.sourceRef.id, 3)
  assert.equal(body.expectedCredentialRevision, 2)
  assert.equal(body.expectedScopeRevision, 3)
  assert.doesNotMatch(JSON.stringify(body), /bindingLevel|EXACT_CREDENTIAL|PROVIDER|rawSecret/)
  for (const changes of [{ source: 'ACTION_RECORD:999' }, { target: 'ASSET:999' }, { eventAt: input.until }, { actor: 'OWN_VALIDATION' }, { action: '__proto__' }]) assert.equal(api.manualUsagePayload(context, { ...input, ...changes }, now), null)
  assert.equal(api.manualUsagePayload({ ...context, capabilities: { ...context.capabilities, canSubmit: false } }, input, now), null)
  assert.equal(api.validUsageWindow(start, new Date(now + 1).toISOString(), now), false)
  assert.equal(api.validUsageWindow(new Date(now - 91 * 86400000).toISOString(), stamp, now), false)
  const labeledContext = { ...context, availableSourceRefs: [{ ...context.availableSourceRefs[0], labelCode: 'EVIDENCE_ADDED', recordedAt: stamp }] }
  assert.deepEqual(api.manualUsagePayload(labeledContext, input, now).sourceRef, { type: 'INVESTIGATION_HISTORY', id: 3 })
  assert.match(api.usageRefLabel(labeledContext.availableSourceRefs[0]), /근거 추가/)
  assert.doesNotMatch(api.usageRefLabel({ ...context.availableSourceRefs[0], labelCode: 'sensitive-sentinel' }), /sensitive-sentinel/)
})
test('missing source material offers only the current authorized investigation and case routes', () => {
  const html = render(api.SecretUsageMaterialForm, { context: { ...context, availableSourceRefs: [] }, location: { ...location, caseId: 7, capabilities: { canReview: true, canViewCase: true } }, disabled: false, onUpdated() {}, onStale() {} })
  assert.match(html, /href="\/secrets\/cases\/7\?origin=PRODUCTION&amp;occurrence=8"/)
  assert.match(html, /href="\/secrets\/triage\/12\?origin=PRODUCTION&amp;occurrence=8"/)
  assert.doesNotMatch(html, /사용 자료 제출<\/button>/)
  const blocked = render(api.SecretUsageHistory, viewProps, [[['secret-usage', 12, 8, 1], { ...context, capabilities: { ...context.capabilities, canRequest: false, blockedReasonCodes: ['FRESH_IDENTITY_VALIDATION_REQUIRED'] } }]])
  assert.match(blocked, /이 위치의 현재 인증 확인/)
  assert.doesNotMatch(blocked, /정확한 키 ID를 승인된 원천에서 확보하지 못했어요/)
})
test('review respects per-record decisions and preserves manual provenance after acceptance and withdrawal', () => {
  const accepted = render(api.UsageObservationDetail, { observation: { ...observation, reviewStatus: 'ACCEPTED', allowedDecisions: ['WITHDRAW'], decisionHistory: [{ decision: 'ACCEPT', reasonCode: 'REVIEWED_USAGE', decidedAt: stamp, revision: 1 }] }, disabled: false, onUpdated() {}, onStale() {} })
  assert.match(accepted, /담당자 수동 자료/)
  assert.match(accepted, /사용자·앱 수준 자료/)
  assert.match(accepted, /수용 철회/)
  assert.doesNotMatch(accepted, /<option value="ACCEPT"|<option value="REJECT"|EXACT_CREDENTIAL/)
  const assigned = render(api.UsageObservationDetail, { observation: { ...observation, allowedDecisions: [] }, disabled: false, onUpdated() {}, onStale() {} })
  assert.doesNotMatch(assigned, /사용 자료 검토 저장|<h3>보안 담당자 검토<\/h3>/)
  const provider = render(api.SecretUsageDecision, { observation: { ...observation, sourceKind: 'PROVIDER', allowedDecisions: ['ACCEPT'] }, disabled: false, onUpdated() {}, onStale() {} })
  assert.equal(provider, '')
})
test('selected usage material replaces the list, preserves its page and refuses another location context', () => {
  const selected = render(api.SecretUsageHistory, viewProps, [[['secret-usage', 12, 8, 1], context]], '/secrets/12?tab=validation&historyView=usage&occurrence=8&usageObservation=1')
  assert.match(selected, /사용 자료 목록으로/)
  assert.doesNotMatch(selected, /aria-label="사용 자료 목록"/)
  const mismatch = render(api.SecretUsageHistory, viewProps, [[['secret-usage', 12, 8, 1], { ...context, occurrenceId: 99, targetOptions: [{ ...context.targetOptions[0], displayName: 'protected-target-sentinel' }] }]])
  assert.match(mismatch, /다른 조회 자료/)
  assert.doesNotMatch(mismatch, /protected-target-sentinel|자료 제출/)
})
test('each provider record uses its own collection region and manual material never borrows the latest request scope', () => {
  const provider = { ...observation, sourceKind: 'PROVIDER', reviewStatus: 'NOT_REQUIRED', allowedDecisions: [], collectionScope: { accountRef: '계정 · …9012', region: 'us-east-1' } }
  const data = { ...context, latestRequest: { ...request, target: { ...request.target, region: 'ap-northeast-2' } }, observations: { ...context.observations, items: [provider] } }
  const html = render(api.SecretUsageHistory, viewProps, [[['secret-usage', 12, 8, 1], data], [['secret-usage-request', 12, 8, 10], data.latestRequest]])
  assert.match(html, /공급자 관측<small>us-east-1<\/small>/)
  const detailHtml = render(api.UsageObservationDetail, { observation: provider, disabled: false, onUpdated() {}, onStale() {} })
  assert.match(detailHtml, /계정 · …9012 · us-east-1/)
  const manual = render(api.UsageObservationDetail, { observation: { ...observation, collectionScope: provider.collectionScope }, disabled: false, onUpdated() {}, onStale() {} })
  assert.match(manual, /수동 자료의 등록 대상 참조를 확인하세요/)
  assert.doesNotMatch(manual, /us-east-1|…9012/)
})
test('partial operations have understandable labels and unknown values never leak into product copy', () => {
  assert.equal(api.usageOperationLabel('TerminateInstances', 'RESOURCE_CHANGE'), 'EC2 인스턴스 종료')
  assert.equal(api.usageOperationLabel('StopLogging', 'RESOURCE_CHANGE'), '이벤트 기록 중지')
  assert.equal(api.usageOperationLabel('secret-sentinel', 'RESOURCE_READ'), '자원 읽기')
  assert.equal(api.terminalUsageRequest('secret-sentinel'), false)
  assert.equal(api.activeUsageRequest('RUNNING'), true)
  assert.doesNotMatch(api.usageReason('secret-sentinel'), /secret-sentinel/)
  for (const reason of ['USAGE_ACCESS_DENIED', 'USAGE_PAGE_LIMIT', 'USAGE_EVENT_BINDING_UNCONFIRMED', 'KEY_IDENTIFIER_LIST_INCOMPLETE', 'USAGE_LEASE_EXPIRED']) assert.notEqual(api.usageReason(reason), api.usageReason('unknown-reason'))
})
test('five usage APIs send only registered IDs, bounded structured facts and CSRF', async () => {
  const originalFetch = globalThis.fetch, originalDocument = globalThis.document, calls = []
  globalThis.document = { cookie: 'XSRF-TOKEN=csrf-usage' }
  globalThis.fetch = async (url, init) => { calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null }); return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }) }
  try {
    await api.fetchSecretUsage(12, 8, 2)
    await api.requestSecretUsage(12, { occurrenceId: 8, serverRegisteredTargetId: 5, windowStart: start, windowEnd: stamp, expectedCredentialRevision: 2, expectedScopeRevision: 3, idempotencyKey: 'request-usage' })
    await api.fetchUsageRequest(10)
    await api.submitUsageObservation(12, { occurrenceId: 8, expectedCredentialRevision: 2, expectedScopeRevision: 3, sourceRef: observation.sourceRef, targetRef: observation.targetRef, windowStart: start, windowEnd: new Date(now).toISOString(), eventAt: stamp, actionCode: 'RESOURCE_READ', actionResult: 'SUCCESS', actorAttribution: 'UNATTRIBUTED', idempotencyKey: 'manual-usage' })
    await api.decideUsageObservation(1, { decision: 'ACCEPT', expectedObservationRevision: 0, reasonCode: 'REVIEWED_USAGE', idempotencyKey: 'review-usage' })
    assert.match(calls[0].url, /usage\?occurrenceId=8&page=2&pageSize=20$/)
    assert.match(calls[2].url, /usage-requests\/10$/)
    assert.match(calls[4].url, /usage-observations\/1\/decisions$/)
    assert.equal(calls[1].body.serverRegisteredTargetId, 5)
    assert.equal(calls[4].body.expectedObservationRevision, 0)
    assert.equal(calls[3].init.headers.get('X-XSRF-TOKEN'), 'csrf-usage')
    assert.doesNotMatch(JSON.stringify(calls), /rawSecret|AccessKeyId|logBody|EXACT_CREDENTIAL/)
  } finally { globalThis.fetch = originalFetch; globalThis.document = originalDocument }
})
