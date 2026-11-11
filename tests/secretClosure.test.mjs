import assert from 'node:assert/strict'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { build } from 'esbuild'

const modules = {}, paths = []
for (const [key, entry] of Object.entries({ lib: 'src/lib/secretClosure.ts', response: 'src/lib/secretResponse.ts', closure: 'src/components/SecretCaseClosure.tsx', exceptions: 'src/components/SecretRiskExceptions.tsx', dismissal: 'src/components/SecretCaseDismissal.tsx', api: 'src/api/secretClosure.ts', lifecycle: 'src/components/SecretLifecycleEvidence.tsx', verification: 'src/components/SecretCaseVerification.tsx', status: 'src/components/SecretCaseStatus.tsx' })) {
  const built = await build({ entryPoints: [resolve(entry)], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', alias: { '@': resolve('src') }, loader: { '.css': 'empty' } })
  const path = resolve(`node_modules/.secret-closure-${key}-test.mjs`); paths.push(path)
  await writeFile(path, built.outputFiles[0].contents); modules[key] = await import(pathToFileURL(path).href)
}
after(() => Promise.all(paths.map((path) => unlink(path))))
const empty = { unit: 'Occurrence', visibleCount: 0, items: [] }
const detail = { caseId: 7, version: 3, isCurrent: true, stage: 'REVALIDATION_PENDING', occurrences: [{ occurrenceId: 11, safeLocationLabel: '위치 #11', version: 2 }], checklist: [], capabilities: {} }
const checks = { caseId: 7, caseVersion: 3, targetOrigin: 'PRODUCTION', closureCheckVersion: 'current-check-version', checkedAt: '2026-10-21T00:00:00Z', restrictedCoverage: false, canResolve: true, allowedCoverageLevels: ['LIMITED'], coverageOptions: [{ level: 'LIMITED', limitations: ['PROVIDER_RETIREMENT_NOT_VERIFIED'], evidenceIds: [41, 51] }], closureChecks: [{ code: 'LOCATION_ABSENCE', status: 'PASSED', reasonCode: 'COMPARABLE_POST_ACTION_MISSING', occurrenceId: 11, evidenceIds: [41] }, { code: 'CREDENTIAL_LIFECYCLE', status: 'PASSED', reasonCode: 'EXTERNAL_RECORD_APPROVED', occurrenceId: null, evidenceIds: [51] }], requiredResponseLocations: { ...empty, visibleCount: 1, items: [{ occurrenceId: 11, safeLocationLabel: '위치 #11', status: 'PASSED', reasonCode: 'COMPARABLE_POST_ACTION_MISSING' }] }, unlinkedAbnormalLocations: empty, unassessedCurrentLocations: empty, authorizedStorageLocations: empty, historicalMissingLocations: empty, otherOriginNotice: null, capabilities: { canResolve: true, canApproveException: true, canDismiss: false }, allowedDismissalReasonCodes: [], eligibleDismissalEvidenceIds: [], eligibleDismissalEvidenceByReason: {} }
function render(Component, seeds, extra = {}, entry = '/secrets/cases/7?tab=verification') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } })
  for (const [key, data] of seeds) client.setQueryData(key, data)
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: [entry] }, createElement(Component, { detail, onReload() {}, onStale() {}, disabled: false, refreshVersion: 0, ...extra }))))
  client.clear(); return html
}
test('manual evidence permits only the server-listed level and exact option evidence', () => {
  assert.equal(modules.lib.eligibleResolution(checks, 3, 'LIMITED', true), true)
  assert.equal(modules.lib.eligibleResolution(checks, 3, 'FULL', true), false)
  assert.equal(modules.lib.eligibleResolution(checks, 4, 'LIMITED', true), false)
  assert.equal(modules.lib.eligibleResolution({ ...checks, canResolve: false }, 3, 'LIMITED', true), false)
  assert.equal(modules.lib.eligibleResolution({ ...checks, closureCheckVersion: null }, 3, 'LIMITED', true), false)
  assert.equal(modules.lib.eligibleResolution(checks, 3, 'LIMITED', false), false)
  assert.deepEqual(modules.lib.resolutionEvidenceIds(checks, 'LIMITED'), [41, 51])
  assert.deepEqual(modules.lib.resolutionEvidenceIds(checks, 'FULL'), [])
})
test('limited viewers see blockers without full-case versions, resolution choices or hidden counts', () => {
  const limited = { ...checks, caseVersion: null, closureCheckVersion: null, restrictedCoverage: true, canResolve: false, allowedCoverageLevels: [], coverageOptions: [], capabilities: { canResolve: false, canDismiss: false, canApproveException: false } }
  const html = render(modules.closure.SecretCaseClosure, [[['secret-case-closure', 7], limited]])
  assert.match(html, /모든 필수 위치에 권한 있는 보안 담당자/)
  assert.doesNotMatch(html, /<option value="FULL"|<option value="LIMITED"|해결 확인 저장|제한 위치 0|전체 위치 0/)
})
test('closure form never offers FULL when only limited evidence is allowed', () => {
  const html = render(modules.closure.SecretCaseClosure, [[['secret-case-closure', 7], checks]])
  assert.match(html, /<option value="LIMITED">제한 확인/)
  assert.doesNotMatch(html, /<option value="FULL"|<option value="SIMULATION"/)
  assert.match(html, /독립 검토자가 수동 근거를 승인했어요/)
})

test('legacy resolved history preserves its unknown evidence level without upgrading it to FULL', () => {
  const historical = { ...checks, canResolve: false, allowedCoverageLevels: [], coverageOptions: [], capabilities: { canResolve: false, canDismiss: false }, lastResolution: { resolutionId: 12, coverageLevel: 'UNKNOWN_LEGACY', decidedAt: '2026-10-10T00:00:00Z', evidenceIds: [], limitations: ['LEGACY_VERIFICATION_EVIDENCE_UNAVAILABLE'] } }
  const html = render(modules.closure.SecretCaseClosure, [[['secret-case-closure', 7], historical]])
  assert.match(html, /과거 해결 · 확인 수준 미기록/)
  assert.match(html, /현재 기준의 해결로 재해석하지 않아요/)
  assert.doesNotMatch(html, /<strong>승인 범위 확인<\/strong>|해결 확인 저장/)
})
test('risk acceptance remains distinct from resolution and never borrows a general admin capability', () => {
  const data = { caseId: 7, caseVersion: 3, items: [{ exceptionId: 5, reasonCode: 'BUSINESS_CONTINUITY', evidenceRef: 'TICKET:SEC-123', approvedByUserId: 4, approvedAt: '2026-10-20T00:00:00Z', expiresAt: '2026-11-01T00:00:00Z', revokedAt: null, status: 'ACTIVE', currentlyApplicable: true, canRevoke: false, occurrenceIds: [11] }], canApprove: false, allowedReasonCodes: [], allowedRevokeReasonCodes: [], eligibleOccurrences: [], maxDurationDays: 90, restrictedCoverage: true }
  const html = render(modules.exceptions.SecretRiskExceptions, [[['secret-case-exceptions', 7], data]])
  assert.match(html, /위험 수용은 해결과 별도/)
  assert.match(html, /수용 중/)
  assert.doesNotMatch(html, /위험 수용 승인|위험 수용 취소 저장/)
})
test('unknown or absent dismissal evidence exposes no made-up action or manual ID form', () => {
  const html = render(modules.dismissal.SecretCaseDismissal, [[['secret-case-closure', 7], checks], [['secret-case-transfers', 7], { caseId: 7, caseVersion: 3, items: [], canSubmit: false, allowedReasonCodes: [], allowedReviewReasonCodes: {} }]])
  assert.match(html, /현재 근거로 교정 종료를 진행할 수 없어요/)
  assert.doesNotMatch(html, /교정 종료 저장|이관 검토 요청|type="number"/)
})
test('disabled risk acceptance preserves past approvals and authorized cancellation without an approval form', () => {
  const data = { caseId: 7, caseVersion: 3, items: [{ exceptionId: 5, reasonCode: 'BUSINESS_CONTINUITY', evidenceRef: 'TICKET:SEC-123', approvedByUserId: 4, approvedAt: '2026-10-20T00:00:00Z', expiresAt: '2026-11-11T00:00:00Z', status: 'POLICY_DISABLED', currentlyApplicable: false, canRevoke: true, occurrenceIds: [11] }], canApprove: false, blockedReasonCodes: ['RISK_ACCEPTANCE_DISABLED'], allowedReasonCodes: [], allowedRevokeReasonCodes: ['REASON_WITHDRAWN'], eligibleOccurrences: [], maxDurationDays: 7, restrictedCoverage: false }
  const html = render(modules.exceptions.SecretRiskExceptions, [[['secret-case-exceptions', 7], data]])
  assert.match(html, /위험 수용은 현재 비활성화/)
  assert.match(html, /정책 비활성 · 과거 승인/)
  assert.match(html, /위험 수용 취소 저장/)
  assert.doesNotMatch(html, /위험 수용 승인|기간을 정한 위험 수용|수용 중/)
})
test('verification panes do not pile up all response forms under the case', () => {
  const html = render(modules.verification.SecretCaseVerification, [[['secret-case-closure', 7], checks]])
  assert.match(html, /현재 해결 조건/)
  assert.doesNotMatch(html, /수행 내용 선택|기간을 정한 위험 수용|이관 근거 참조|작업 위치<select/)
})
test('a stale manually approved lifecycle record is historical and synthetic retirement stays simulation', () => {
  const data = { caseId: 7, caseVersion: 3, allowedKinds: [], allowedReviewReasonCodes: {}, capabilities: { canSubmit: false }, items: [{ evidenceId: 51, kind: 'FIXTURE_RETIRED', verificationLevel: 'APPROVED_MANUAL', reviewStatus: 'APPROVED', performedAt: '2026-10-20T00:00:00Z', observedAt: '2026-10-20T00:00:00Z', evidenceRef: 'TICKET:SEC-123', version: 2, isCurrentlyApplicable: false, coverageLimit: 'SIMULATION', capabilities: { canReview: false } }] }
  const html = render(modules.lifecycle.SecretLifecycleEvidence, [[['secret-case-lifecycle', 7], data]])
  assert.match(html, /현재 해결 판단에 적용되지 않는 근거/)
  assert.match(html, /합성 표본의 사용 종료 근거/)
  assert.doesNotMatch(html, /공급자 확인<|완전 해결/)
})
test('external lifecycle evidence accepts at most the past 90 days and exception deadlines at most the server limit', () => {
  const now = Date.parse('2026-10-21T00:00:00Z')
  assert.equal(modules.response.validLifecycleTime('2026-09-01T00:00:00Z', now), true)
  assert.equal(modules.response.validLifecycleTime('2026-10-21T00:01:00Z', now), false)
  assert.equal(modules.response.validLifecycleTime('2026-01-01T00:00:00Z', now), false)
  assert.equal(modules.lib.validRiskDeadline('2026-10-30T00:00:00Z', 10, now), true)
  assert.equal(modules.lib.validRiskDeadline('2026-11-01T00:00:00Z', 10, now), false)
})
test('resolution command sends server option evidence, current versions and a stable idempotency key', async () => {
  const originalFetch = globalThis.fetch, originalDocument = globalThis.document
  let request
  globalThis.document = { cookie: 'XSRF-TOKEN=csrf' }
  globalThis.fetch = async (path, init) => { request = { path, body: JSON.parse(init.body) }; return new Response(JSON.stringify({ caseId: 7, version: 4, status: 'RESOLVED', coverageLevel: 'LIMITED' }), { status: 200, headers: { 'content-type': 'application/json' } }) }
  try {
    await modules.api.resolveSecretResponse(7, { decision: 'RESOLVE', expectedCaseVersion: 3, closureCheckVersion: checks.closureCheckVersion, evidenceIds: modules.lib.resolutionEvidenceIds(checks, 'LIMITED'), coverageLevel: 'LIMITED', idempotencyKey: 'same-command' })
    assert.equal(request.path, '/api/v1/secrets/cases/7/resolution-decisions')
    assert.deepEqual(request.body.evidenceIds, [41, 51]); assert.equal(request.body.closureCheckVersion, checks.closureCheckVersion)
    assert.equal(request.body.expectedCaseVersion, 3); assert.equal(request.body.idempotencyKey, 'same-command')
    assert.doesNotMatch(JSON.stringify(request.body), /keyRaw|sourceObjectRef|providerResponse|riskAccepted/)
  } finally { globalThis.fetch = originalFetch; globalThis.document = originalDocument }
})

test('the case header derives risk acceptance only from the current server contract and preserves the action stage', () => {
  const data = { caseId: 7, caseVersion: 3, fullyRiskAccepted: true }
  const html = render(modules.status.SecretCaseStatus, [[['secret-case-exceptions', 7], data]])
  assert.match(html, /위험 수용 중/)
  assert.match(html, /조치 단계: 재검사 대기 · 해결과 별도/)
  const stale = render(modules.status.SecretCaseStatus, [[['secret-case-exceptions', 7], { ...data, caseVersion: 2 }]])
  assert.doesNotMatch(stale, /위험 수용 중/)
  assert.match(stale, /최신 상태 조회 필요/)
  const changed = render(modules.status.SecretCaseStatus, [[['secret-case-exceptions', 7], { ...data, fullyRiskAccepted: false }]])
  assert.doesNotMatch(changed, /위험 수용 중/)
})
test('lifecycle mutations disappear when the evidence context is stale or belongs to another case', () => {
  const data = { caseId: 7, caseVersion: 2, allowedKinds: ['REVOKED'], allowedReviewReasonCodes: { APPROVE: ['EXTERNAL_RECORD_CONFIRMED'] }, capabilities: { canSubmit: true }, items: [{ evidenceId: 51, kind: 'REVOKED', verificationLevel: 'PENDING', reviewStatus: 'PENDING', performedAt: '2026-10-20T00:00:00Z', observedAt: null, evidenceRef: 'TICKET:SEC-123', version: 1, isCurrentlyApplicable: false, coverageLimit: 'LIMITED', capabilities: { canReview: true } }] }
  const html = render(modules.lifecycle.SecretLifecycleEvidence, [[['secret-case-lifecycle', 7], data]])
  assert.match(html, /다른 버전/)
  assert.doesNotMatch(html, /보안 검토 요청|근거 검토 저장/)
  const mismatch = render(modules.lifecycle.SecretLifecycleEvidence, [[['secret-case-lifecycle', 7], { ...data, caseId: 8 }]])
  assert.match(mismatch, /대상이 현재 대응 건과 다릅니다/)
  assert.doesNotMatch(mismatch, /TICKET:SEC-123/)
})
