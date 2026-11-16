import assert from 'node:assert/strict'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { build } from 'esbuild'

const entries = { response: 'src/lib/secretResponse.ts', workflow: 'src/components/SecretCaseWorkflow.tsx', workspace: 'src/pages/SecretCaseDetailPage.tsx', api: 'src/api/secretCases.ts', revalidation: 'src/api/secretCaseRevalidations.ts', lifecycle: 'src/components/SecretLifecycleEvidence.tsx', navigation: 'src/lib/secretDetailNavigation.ts', lifecycleApi: 'src/api/secretLifecycle.ts' }
const modules = {}, paths = []
for (const [key, entry] of Object.entries(entries)) {
  const built = await build({ entryPoints: [resolve(entry)], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, alias: { '@': resolve('src') } })
  const path = resolve(`node_modules/.secret-response-${key}-test.mjs`)
  paths.push(path); await writeFile(path, built.outputFiles[0].contents); modules[key] = await import(pathToFileURL(path).href)
}
after(() => Promise.all(paths.map((path) => unlink(path))))
const { parseCaseFilters, caseDetailPath, caseReturnPath, validActionReference, validActionTime, locationNextAction } = modules.response
const occurrence = { occurrenceId: 11, safeLocationLabel: '위치 #11', responseStatus: 'OPEN', version: 2, assignedTeam: 'Platform', assignedUserId: 4, canAssign: false, canRecordAction: false, canCompleteActions: false, lastMaterialActionAt: null }
const detail = { caseId: 7, version: 3, isCurrent: true, stage: 'OPEN', occurrences: [occurrence], checklist: [], capabilities: { canRecordAction: true, canAssign: true, canUpdateChecklist: true } }
const common = { onReload() {}, onStale() {}, disabled: false }
test('response workflow uses four stages and recommends a visible location needing action', () => {
  assert.deepEqual(Object.values(modules.response.caseStageLabels), ['신규', '조치 중', '재검사 대기', '해결'])
  const other = { ...occurrence, occurrenceId: 12, postActionRedetected: true }
  assert.equal(modules.response.recommendedCaseLocation({ ...detail, occurrences: [occurrence, other] }).occurrenceId, 12)
  assert.equal(modules.response.recommendedCaseLocation({ ...detail, occurrences: [] }), undefined)
  assert.equal(modules.response.suggestedCaseTab({ ...detail, taskGuidance: { nextActionCode: 'REQUEST_REVALIDATION' } }), 'verification')
  const unassigned = { ...occurrence, occurrenceId: 15, assignedTeam: null, assignedUserId: null }
  const coordinated = { ...detail, assigneeUserId: 1, assigneeTeam: null, occurrences: [occurrence, unassigned] }
  assert.equal(modules.response.recommendedCaseLocation(coordinated).occurrenceId, 15)
  assert.equal(modules.response.responseNextAction(coordinated), '위치별 담당자 지정')
  assert.equal(locationNextAction(unassigned), '담당자 지정')
})
function render(Component, props, seeds = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  for (const [key, data] of seeds) client.setQueryData(key, data)
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(Component, { ...common, ...props })))
}
test('case detail round trip keeps filters, page and focus without accepting an external return', () => {
  const { filters, valid } = parseCaseFilters(new URLSearchParams('origin=ALL&scope=history&stages=RESOLVED&assignmentStatus=PERSONAL&assignee=ME&page=4'))
  assert.equal(valid, true)
  const href = caseDetailPath(7, filters, 11)
  assert.match(href, /^\/secrets\/cases\/7\?/)
  const returnPath = caseReturnPath(new URL(href, 'http://local').searchParams, 7)
  const params = new URL(returnPath, 'http://local').searchParams
  assert.equal(params.get('origin'), 'ALL'); assert.equal(params.get('page'), '4'); assert.equal(params.get('focus'), '7')
  assert.match(caseReturnPath(new URLSearchParams('returnQuery=https://evil.invalid'), 7), /^\/secrets\/cases\?/)
  assert.equal(new URL(caseReturnPath(new URLSearchParams('origin=ALL&occurrence=11'), 7), 'http://local').searchParams.get('origin'), 'ALL')
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
  assert.match(html, /수행한 조치 기록/); assert.match(html, /티켓·변경 참조를 입력/)
  assert.doesNotMatch(html, /보안 검토|조치 시작|이 위치를 재검사 대기로/)
  assert.equal(locationNextAction({ ...location, assignedUserId: null, assignedTeam: null }), '담당자 지정')
})
test('unassigned location opens its actual assignment while coordinator management stays collapsed', () => {
  const seeds = [[['secret-case-assignees', 7, 11], { items: [] }], [['secret-case-assignees', 7, undefined], { items: [] }]]
  const location = render(modules.workflow.SecretCaseAssignment, { detail, occurrence: { ...occurrence, assignedTeam: null, assignedUserId: null } }, seeds)
  assert.match(location, /id="case-location-assignment"/)
  assert.match(location, /<details[^>]* open=""><summary>이 위치의 담당자/)
  const coordinator = render(modules.workflow.SecretCaseAssignment, { detail }, seeds)
  assert.doesNotMatch(coordinator, /<details[^>]* open=/)
  assert.match(coordinator, /대응 담당자 지정·변경/)
})
test('case workspace keeps progress visible and puts selected location work before supporting records', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } })
  client.setQueryData(['secret-case', 7], { ...detail, maskedLabel: '키 후보', secretId: 3, caseOrigin: 'PRODUCTION', disposition: 'ACTIVE', visibleOccurrenceCount: 1, restrictedCoverage: true, readAt: '2026-10-21T00:00:00Z', occurrences: [{ ...occurrence, source: 'GITHUB', sourceDetails: { status: 'AVAILABLE', label: '검사 파일', repository: 'example/approved-source', branch: 'main', path: 'fixtures/config.env', line: 'L12' }, presence: 'PRESENT', actionCycle: 1, canRecordAction: true }] })
  client.setQueryData(['secret-case-assignees', 7, undefined], { items: [] })
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: ['/secrets/cases/7?tab=work'] }, createElement(Routes, null, createElement(Route, { path: '/secrets/cases/:caseId', element: createElement(modules.workspace.SecretCaseDetailPage) })))))
  assert.ok(html.indexOf('대응 진행 단계') < html.indexOf('대응 상세 구역'))
  assert.ok(html.indexOf('지금 할 일') < html.indexOf('조치 대상 위치'))
  assert.ok(html.indexOf('대응 상세 구역') < html.indexOf('수행한 조치 기록'))
  assert.ok(html.indexOf('수행한 조치 기록') < html.indexOf('<summary>대응 담당자·관련 근거'))
  assert.match(html, /<details class="card secret-case-context"><summary>/)
  assert.match(html, /열람할 수 있는 위치를 표시/)
  assert.match(html, /example\/approved-source/)
  assert.match(html, /브랜치 main/)
  assert.match(html, /fixtures\/config.env/)
  assert.match(html, /12번째 줄/)
  assert.ok(html.indexOf('fixtures/config.env') < html.indexOf('수행한 조치 기록'))
  assert.doesNotMatch(html, /이 위치의 담당자 지정·변경/)
  client.clear()
})
test('manual lifecycle approval is visibly distinct from provider verification', () => {
  const html = render(modules.lifecycle.SecretLifecycleEvidence, { detail }, [[['secret-case-lifecycle', 7], { caseId: 7, caseVersion: 3, items: [{ evidenceId: 8, kind: 'REVOKED', verificationLevel: 'APPROVED_MANUAL', reviewStatus: 'APPROVED', evidenceRef: 'CHANGE:SEC-123', performedAt: '2026-10-20T00:00:00Z', observedAt: null, version: 1, limitations: [], isCurrentlyApplicable: true, coverageLimit: 'LIMITED', capabilities: { canReview: false } }], allowedKinds: [], allowedReviewReasonCodes: {}, capabilities: { canSubmit: false } }]])
  assert.match(html, /수동 근거 승인/); assert.match(html, /공급자의 폐기·교체 상태는 미확인/)
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


test('key to response and review round trips restore the selected location and original list context', () => {
  const query = new URLSearchParams('origin=ALL&occurrence=11&locationPage=3&tab=locations&return=inventory&returnQuery=page%3D4%26source%3DGITHUB')
  const href = modules.navigation.keyContextPath('/secrets/cases/7?occurrence=11', 3, query)
  const params = new URL(href, 'https://local.invalid').searchParams
  const back = new URL(caseReturnPath(params, 7), 'https://local.invalid')
  assert.equal(back.pathname, '/secrets/3')
  assert.equal(back.searchParams.get('occurrence'), '11')
  assert.equal(back.searchParams.get('locationPage'), '3')
  assert.equal(back.searchParams.get('return'), 'inventory')
  assert.equal(back.searchParams.get('returnQuery'), 'page=4&source=GITHUB&origin=ALL')
  assert.equal(modules.navigation.keyContextReturn(new URLSearchParams('return=key&returnSecretId=https://evil.invalid')), null)
})

test('Claude same-case links retain the selected work and return context while changing the intended section', () => {
  const path = modules.navigation.contextualExplanationPath('/secrets/cases/7?tab=verification&check=locations#case-verification-title', '/secrets/cases/7', '?occurrence=11&tab=work&return=key&returnSecretId=3&returnQuery=locationPage%3D3')
  const url = new URL(path, 'https://local.invalid')
  assert.equal(url.searchParams.get('occurrence'), '11')
  assert.equal(url.searchParams.get('check'), 'locations')
  assert.equal(url.searchParams.get('returnSecretId'), '3')
  assert.equal(url.hash, '#case-verification-title')
  assert.equal(modules.navigation.contextualExplanationPath('/secrets/connections', '/secrets/cases/7', '?occurrence=11'), '/secrets/connections')
})

test('self assignment and internal action records are capability-gated and preserve safe legacy requirements', () => {
  const self = render(modules.workflow.SecretCaseAssignment, { detail: { ...detail, capabilities: { ...detail.capabilities, canAssignSelf: true, canAssignUnassigned: true }, occurrences: [{ ...occurrence, assignedUserId: null, assignedTeam: null }] } }, [[['secret-case-assignees', 7, undefined], { items: [] }]])
  assert.match(self, /내가 담당하기/)
  assert.match(self, /미배정 조치 위치 1곳에도 적용/)
  const internal = render(modules.workflow.SecretCaseWorkflow, { detail, occurrence: { ...occurrence, canRecordAction: true, canRecordInternalAction: true, canRecordAndCompleteActions: true } })
  assert.match(internal, /비워두면 내부 조치 기록 번호/)
  assert.match(internal, /저장하고 재검사로/)
  assert.match(internal, /기록만 저장/)
  const legacy = render(modules.workflow.SecretCaseWorkflow, { detail, occurrence: { ...occurrence, canRecordAction: true } })
  assert.doesNotMatch(legacy, /저장하고 재검사로|비워두면 내부/)
})

test('response commands reuse stored lifecycle action and atomically complete actual work without fabricated ticket fields', async () => {
  const originalFetch = globalThis.fetch, originalDocument = globalThis.document
  const calls = []
  globalThis.document = { cookie: 'XSRF-TOKEN=csrf' }
  globalThis.fetch = async (path, options) => { calls.push({ path, body: JSON.parse(options.body) }); return new Response(JSON.stringify({ status: 'PENDING', version: 4 }), { status: 200, headers: { 'content-type': 'application/json' } }) }
  try {
    await modules.api.assignSecretCaseToSelf(7, { expectedVersion: 3, applyToUnassigned: true })
    await modules.api.recordSecretCaseAction(7, { occurrenceId: 11, actionType: 'ROTATED', performedAt: '2026-11-17T00:00:00Z', completeActions: true, expectedCaseVersion: 3, expectedOccurrenceVersion: 2, idempotencyKey: 'action-command' })
    await modules.lifecycleApi.submitLifecycleEvidence(7, { sourceActionId: 31, expectedCaseVersion: 4, idempotencyKey: 'lifecycle-command' })
    await modules.revalidation.requestSecretCaseRevalidations(7, { expectedCaseVersion: 4, idempotencyKey: 'batch-command', items: [{ occurrenceId: 11, expectedOccurrenceVersion: 3 }, { occurrenceId: 12, expectedOccurrenceVersion: 2 }] })
    assert.equal(calls[0].path, '/api/v1/secrets/cases/7/assignment/self')
    assert.equal(calls[0].body.applyToUnassigned, true)
    assert.equal(calls[1].body.completeActions, true)
    assert.equal('evidenceRef' in calls[1].body, false)
    assert.deepEqual(calls[2].body, { sourceActionId: 31, expectedCaseVersion: 4, idempotencyKey: 'lifecycle-command' })
    assert.equal(calls[3].path, '/api/v1/secrets/cases/7/revalidations/batch')
    assert.deepEqual(calls[3].body.items, [{ occurrenceId: 11, expectedOccurrenceVersion: 3 }, { occurrenceId: 12, expectedOccurrenceVersion: 2 }])
  } finally { globalThis.fetch = originalFetch; globalThis.document = originalDocument }
})

test('one-person limited lifecycle confirmation is explicit and disappears when the server disallows it', () => {
  const base = { caseId: 7, caseVersion: 3, allowedKinds: [], allowedReviewReasonCodes: {}, capabilities: { canSubmit: false }, sourceActions: [], items: [{ evidenceId: 8, kind: 'REVOKED', verificationLevel: 'PENDING', reviewStatus: 'PENDING', evidenceRef: 'CHANGE:ACTION-31', performedAt: '2026-11-17T00:00:00Z', version: 1, isCurrentlyApplicable: false, coverageLimit: 'LIMITED', capabilities: { canReview: false, canSelfAttest: true } }] }
  const html = render(modules.lifecycle.SecretLifecycleEvidence, { detail }, [[['secret-case-lifecycle', 7], base]])
  assert.match(html, /제한 확인으로 기록/)
  assert.doesNotMatch(html, /검토 결과<select/)
  const confirmed = { ...base, items: [{ ...base.items[0], verificationLevel: 'SELF_ATTESTED', isCurrentlyApplicable: true, capabilities: { canReview: false, canSelfAttest: false } }] }
  const done = render(modules.lifecycle.SecretLifecycleEvidence, { detail }, [[['secret-case-lifecycle', 7], confirmed]])
  assert.match(done, /본인 확인 · 제한 수준/)
  assert.match(done, /공급자의 폐기·교체 상태는 미확인/)
  assert.doesNotMatch(done, /제한 확인으로 기록/)
})


test('reviewing the original action keeps its limited level and unavailable stored actions stay disabled', () => {
  const data = { caseId: 7, caseVersion: 3, allowedKinds: ['REVOKED'], allowedReviewReasonCodes: { APPROVE: ['EXTERNAL_RECORD_CONFIRMED'] }, capabilities: { canSubmit: true }, sourceActions: [{ actionId: 31, occurrenceId: 11, actionType: 'REVOKED', performedAt: '2026-11-17T00:00:00Z', evidenceRef: 'CHANGE:ACTION-31', reusable: false, unavailableReasonCode: 'ACTION_ALREADY_SUBMITTED', existingEvidenceId: 8 }], items: [{ evidenceId: 8, kind: 'REVOKED', verificationLevel: 'PENDING', reviewStatus: 'PENDING', evidenceRef: 'CHANGE:ACTION-31', performedAt: '2026-11-17T00:00:00Z', version: 1, isCurrentlyApplicable: false, coverageLimit: 'LIMITED', reviewVerificationLevel: 'SELF_ATTESTED', reviewLimitations: ['ACTION_AUTHOR_REVIEWED'], capabilities: { canReview: true, canSelfAttest: false } }] }
  const html = render(modules.lifecycle.SecretLifecycleEvidence, { detail }, [[['secret-case-lifecycle', 7], data]])
  assert.match(html, /원래 조치의 작성자가 확인/)
  assert.match(html, /value="APPROVE">제한 확인/)
  assert.match(html, /value="31" disabled=""/)
  assert.match(html, /이미 연결된 기록 #8/)
})

test('response progress refreshes pending work but pauses for unsaved forms and stops after completion or errors', () => {
  const pending = { ...detail, occurrences: [{ ...occurrence, recentRevalidation: { jobStatus: 'PENDING' } }] }
  assert.equal(modules.response.responseRefreshInterval(pending, false), 5000)
  assert.equal(modules.response.responseRefreshInterval(pending, true), false)
  assert.equal(modules.response.responseRefreshInterval(pending, false, true), false)
  assert.equal(modules.response.responseRefreshInterval({ ...pending, isCurrent: false }, false), false)
  for (const status of ['SUCCEEDED', 'FAILED', 'CANCELLED']) assert.equal(modules.response.responseRefreshInterval({ ...pending, occurrences: [{ ...occurrence, recentRevalidation: { jobStatus: status } }] }, false), false)
  assert.equal(modules.response.responseRefreshInterval(undefined, false), false)
})


test('changed approval context explains the specific revalidation mismatch', () => {
  assert.equal(modules.response.revalidationBlockLabel('SOURCE_APPROVAL_CHANGED'), '현재 검사 대상이 발견 당시 위치와 달라요. 대상 설정을 확인하세요.')
})
