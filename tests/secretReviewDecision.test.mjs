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

const bundle = await build({ stdin: { contents: "export * from './src/lib/secretReview'; export * from './src/api/secretTriage'; export { parseWorkbenchFilters } from './src/lib/secretWorkbench'; export { SecretTriagePage } from './src/pages/SecretTriagePage'; export { SecretTriageCandidatesPage } from './src/pages/SecretTriageCandidatesPage'", resolveDir: resolve('.') }, bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, alias: { '@': resolve('src') } })
const bundlePath = resolve('node_modules/.secret-review-decision-test.mjs')
await writeFile(bundlePath, bundle.outputFiles[0].contents)
const api = await import(pathToFileURL(bundlePath).href)
after(() => unlink(bundlePath))
const context = { credentialSetId: 12, occurrenceId: 8, connectionId: 3, scopeId: 5, scopeRevision: 4, origin: 'PRODUCTION', componentState: 'CONFIRMED', presence: 'PRESENT', exposureStatus: 'UNKNOWN', maskedLabel: 'ghp_••••1234', issuer: 'GITHUB', credentialType: 'GITHUB_CLASSIC_PAT', safeLocationLabel: '위치 #8', findings: [{ findingId: 91, ruleId: 'github-pat', ruleVersion: 'v2', detectedAt: '2026-10-21T00:00:00Z', valid: true }], storagePolicy: { result: 'DENIED', policyId: 3, version: 2, bindingId: 5, reasonCode: 'MATCHED_DENY_RULE', requiresReassessment: false }, validity: { result: 'UNCHECKED', reasonCode: 'NO_VERIFICATION_ATTEMPT', observedAt: null }, versions: { occurrence: 4, scope: 2, policy: 2 }, allowedDecisions: ['ABNORMAL', 'FALSE_POSITIVE', 'NEEDS_MORE_INFO'], allowedReasonCodes: { ABNORMAL: ['POLICY_PROHIBITED_LOCATION'], FALSE_POSITIVE: ['NOT_A_CREDENTIAL'], NEEDS_MORE_INFO: ['INSUFFICIENT_EVIDENCE'] }, allowedMissingReasonCodes: ['OWNER_UNKNOWN', 'POLICY_UNKNOWN', 'EVIDENCE_INCOMPLETE'], eligibleInvestigationAssignees: [{ userId: 7, displayName: '조사 담당자' }], caseLinkData: { caseId: null, canRepair: false, decisionId: null, decisionVersion: null } }
const input = { decision: 'ABNORMAL', reasonCode: 'POLICY_PROHIBITED_LOCATION', findingId: 91, evidenceRef: 'TICKET:SEC-12', missingReasonCode: '', followUpOwnerUserId: null, dueAt: null }
function renderContext(data, url = '/secrets/triage/12?occurrence=8') {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, gcTime: Infinity } } })
  if (data) client.setQueryData(['secret-review-context', 8], data)
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: [url] }, createElement(Routes, null, createElement(Route, { path: '/secrets/triage/:secretId', element: createElement(api.SecretTriagePage) })))))
  client.clear(); return html
}

test('a key/occurrence mismatch or missing scope never displays mutation forms or another key label', () => {
  const mismatched = renderContext({ ...context, credentialSetId: 13, maskedLabel: 'must-not-render-other-key' })
  assert.match(mismatched, /선택한 키·위치·승인 범위가 일치하지 않아요/)
  assert.doesNotMatch(mismatched, /must-not-render-other-key|가능한 결정 선택/)
  const noScope = renderContext({ ...context, scopeId: null })
  assert.match(noScope, /일치하지 않아요/)
  assert.doesNotMatch(noScope, /가능한 결정 선택/)
})
test('delayed context and incomplete URLs provide protected loading/return states', () => {
  assert.match(renderContext(null), /위치·범위·정책 근거를 불러오는 중/)
  const invalid = renderContext(null, '/secrets/triage/12')
  assert.match(invalid, /확인할 위치를 선택해 주세요/)
  assert.match(invalid, /키 상세에서 위치 선택/)
  assert.doesNotMatch(invalid, /가능한 결정 선택/)
})
test('incomplete TEST review links preserve their origin when recovering through key detail or returning', () => {
  const html = renderContext(null, '/secrets/triage/12?origin=TEST')
  const urls = [...html.matchAll(/href="([^"]+)"/g)].map((match) => new URL(match[1].replaceAll('&amp;', '&'), 'http://local'))
  assert.equal(urls.find((url) => url.pathname === '/secrets/12').searchParams.get('origin'), 'TEST')
  assert.equal(urls.find((url) => url.pathname === '/secrets/triage').searchParams.get('origin'), 'TEST')
})
test('an existing TEST case link retains the exact occurrence and safe return filters', () => {
  const returnQuery = 'origin=TEST&source=GITHUB&environment=DEV&bucket=NEEDS_CASE_LINK&page=3'
  const html = renderContext({ ...context, origin: 'TEST', allowedDecisions: [], caseLinkData: { ...context.caseLinkData, caseId: 6, caseOrigin: 'TEST' } }, `/secrets/triage/12?occurrence=8&returnQuery=${encodeURIComponent(returnQuery)}`)
  const href = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1].replaceAll('&amp;', '&')).find((href) => href.startsWith('/secrets/cases/6?'))
  const url = new URL(href, 'http://local')
  assert.equal(url.searchParams.get('origin'), 'TEST'); assert.equal(url.searchParams.get('occurrence'), '8')
  const back = new URLSearchParams(url.searchParams.get('returnQuery'))
  assert.equal(back.get('bucket'), 'NEEDS_CASE_LINK'); assert.equal(back.get('source'), 'GITHUB'); assert.equal(back.get('page'), '3')
})
test('case queue entry buttons preserve TEST origin, occurrence and the return list', () => {
  const query = 'origin=TEST&bucket=ACTION_REQUIRED&snapshotId=11111111-1111-1111-1111-111111111111'
  const { filters } = api.parseWorkbenchFilters(new URLSearchParams(query))
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, gcTime: Infinity } } })
  client.setQueryData(['secret-review-queue', filters, 'ACTION_REQUIRED', '', 0, 0], { unit: 'ResponseCase', items: [{ caseId: 6, occurrenceId: 8, maskedLabel: '키 후보', stage: 'OPEN' }], total: 1, size: 20, asOf: '2026-10-21T00:00:00Z', snapshotId: filters.snapshotId })
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: [`/secrets/triage?${query}`] }, createElement(api.SecretTriageCandidatesPage))))
  const href = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1].replaceAll('&amp;', '&')).find((href) => href.startsWith('/secrets/cases/6?'))
  const url = new URL(href, 'http://local')
  assert.equal(url.searchParams.get('origin'), 'TEST'); assert.equal(url.searchParams.get('occurrence'), '8')
  assert.equal(new URLSearchParams(url.searchParams.get('returnQuery')).get('bucket'), 'ACTION_REQUIRED')
  client.clear()
})
test('unchecked validity does not block evidence-backed exposure, while stale/mismatched findings do', () => {
  assert.deepEqual(api.reviewInputErrors(context, input), [])
  assert.ok(api.reviewInputErrors(context, { ...input, findingId: 92 }).includes('VALID_FINDING_REQUIRED'))
  assert.ok(api.reviewInputErrors({ ...context, versions: { ...context.versions, scope: null } }, input).includes('VERSIONS_REQUIRED'))
})
test('incomplete candidates cannot become approved storage or an exposure case', () => {
  const candidate = { ...context, componentState: 'CANDIDATE', allowedDecisions: ['ABNORMAL', 'NORMAL', 'NEEDS_MORE_INFO'] }
  assert.deepEqual(api.allowedReviewDecisions(candidate), ['NEEDS_MORE_INFO'])
  assert.ok(api.reviewInputErrors(candidate, input).includes('DECISION_NOT_ALLOWED'))
})
test('NORMAL requires an actual applicable ALLOWED policy and its version, beyond a server-provided option', () => {
  assert.ok(!api.allowedReviewDecisions({ ...context, allowedDecisions: ['NORMAL'] }).includes('NORMAL'))
  assert.deepEqual(api.allowedReviewDecisions({ ...context, allowedDecisions: ['NORMAL'], storagePolicy: { ...context.storagePolicy, result: 'ALLOWED' } }), ['NORMAL'])
})
test('human additional investigation requires a permitted owner, future deadline, missing reason and safe reference', () => {
  const more = { ...input, decision: 'NEEDS_MORE_INFO', reasonCode: 'INSUFFICIENT_EVIDENCE', findingId: null }
  const errors = api.reviewInputErrors(context, more, Date.parse('2026-10-21T00:00:00Z'))
  assert.ok(errors.includes('INVESTIGATION_OWNER_REQUIRED'))
  assert.ok(errors.includes('FUTURE_DEADLINE_REQUIRED'))
  assert.ok(errors.includes('MISSING_REASON_REQUIRED'))
  assert.deepEqual(api.reviewInputErrors(context, { ...more, missingReasonCode: 'OWNER_UNKNOWN', followUpOwnerUserId: 7, dueAt: '2026-10-22T00:00:00Z' }, Date.parse('2026-10-21T00:00:00Z')), [])
  assert.ok(api.reviewInputErrors(context, { ...more, evidenceRef: 'https://example.invalid' }).includes('SAFE_REFERENCE_REQUIRED'))
})
test('valid existing exposure repairs the case link without a repeated exposure decision', () => {
  const html = renderContext({ ...context, exposureStatus: 'ABNORMAL', allowedDecisions: [], caseLinkData: { caseId: null, canRepair: true, decisionId: 17, decisionVersion: 1 } })
  assert.match(html, /확인된 노출을 대응 건에 연결/)
  assert.match(html, /같은 판단을 다시 승인하지 않아요/)
  assert.doesNotMatch(html, /가능한 결정 선택|노출 판정 저장|대응 건 생성 확인/)
})

test('expired correction evidence stays historical and unavailable decisions explain the missing fact', () => {
  const html = renderContext({ ...context, allowedDecisions: ['NEEDS_MORE_INFO'], decisionUnavailableReasons: { ABNORMAL: 'CURRENT_PRESENCE_REQUIRED', NORMAL: 'EXPLICIT_ALLOW_REQUIRED', FALSE_POSITIVE: 'REAL_CREDENTIAL_CONFIRMED' }, corrections: [{ correctionId: 4, findingId: 90, decisionId: 15, source: 'EXACT_EVIDENCE_REUSE', expiresAt: '2026-10-20T00:00:00Z', currentlyApplicable: false, recheckReason: 'APPROVAL_EXPIRED' }] })
  assert.match(html, /현재 존재를 먼저 확인/)
  assert.match(html, /유효한 보관 허용 정책/)
  assert.match(html, /실제 키 근거가 있어 오탐으로 교정할 수 없어요/)
  assert.match(html, /과거 교정 근거/)
  assert.match(html, /오탐 근거 유효 기간 만료/)
  assert.doesNotMatch(html, /탐지 #90 · 현재 적용 중/)
})
test('review return navigation preserves allowlisted origin, bucket, page and snapshot only', () => {
  const params = new URLSearchParams({ returnQuery: 'origin=TEST&bucket=NEEDS_CASE_LINK&page=3&snapshotId=11111111-1111-1111-1111-111111111111&returnTo=https://example.invalid' })
  const back = new URL(api.reviewReturnPath(params, 12, 8), 'http://localhost')
  assert.equal(back.searchParams.get('origin'), 'TEST')
  assert.equal(back.searchParams.get('page'), '3')
  assert.equal(back.searchParams.get('focus'), '12:8')
  assert.equal(back.searchParams.has('returnTo'), false)
})
test('one exposure submission uses the atomic decision endpoint and separate scope/collection versions', async () => {
  const originalFetch = globalThis.fetch, originalDocument = globalThis.document
  const requests = []
  globalThis.document = { cookie: 'XSRF-TOKEN=test-token' }
  globalThis.fetch = async (path, init) => { requests.push({ path, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ decisionId: 17, caseId: 6, caseOperation: 'CREATED' }), { status: 201 }) }
  try {
    await api.decideSecretOccurrence(8, { decision: 'ABNORMAL', reasonCode: 'POLICY_PROHIBITED_LOCATION', findingId: 91, evidenceRefs: ['TICKET:SEC-12'], expectedOccurrenceVersion: 4, expectedScopeVersion: 2, expectedPolicyVersion: 2, idempotencyKey: 'stable-key' })
    assert.equal(requests.length, 1)
    assert.equal(requests[0].path, '/api/v1/secrets/occurrences/8/decisions')
    assert.equal(requests[0].body.expectedScopeVersion, 2)
    assert.notEqual(requests[0].body.expectedScopeVersion, context.scopeRevision)
    assert.doesNotMatch(JSON.stringify(requests), /rawSecret|approvedRef|assessments|triage-candidates/)
  } finally { globalThis.fetch = originalFetch; globalThis.document = originalDocument }
})

test('a direct legacy review link returns to its verified origin without treating an unchecked sample as proof', () => {
  const back = new URL(api.reviewReturnPath(new URLSearchParams(), 12, 8, 'TEST'), 'http://localhost')
  assert.equal(back.searchParams.get('origin'), 'TEST'); assert.equal(back.searchParams.get('focus'), '12:8')
  const html = renderContext({ ...context, origin: 'TEST', validity: { result: 'UNCHECKED', reasonCode: 'SYNTHETIC_FIXTURE', observedAt: '2026-10-19T00:00:00Z' } })
  assert.match(html, /표본 분류로 검증 생략/); assert.match(html, /최근 검증 시도/)
})


test('a linked current exposure opens its exact case location and folds repeat decisions', () => {
  const value = { ...context, origin: 'TEST', exposureStatus: 'ABNORMAL', caseLinkData: { ...context.caseLinkData, caseId: 2, caseOrigin: 'TEST', caseLinkStatus: 'LINKED' } }
  const html = renderContext(value, '/secrets/triage/12?occurrence=8&returnQuery=origin%3DTEST%26bucket%3DNEEDS_DECISION%26page%3D3')
  assert.match(html, /이미 노출이 확인되어 대응 중이에요/)
  const section = html.match(/<details class="card secret-scan-technical"><summary>판정 변경<\/summary>([\s\S]*?)<\/details>/)?.[0]
  assert.ok(section); assert.match(section, /가능한 결정 선택/)
  assert.doesNotMatch(section, /<details[^>]* open=/)
  assert.match(html, /href="\/secrets\/cases\/2\?origin=TEST&amp;occurrence=8&amp;return=workbench/)
  const changed = renderContext({ ...value, storagePolicy: { ...value.storagePolicy, requiresReassessment: true } })
  assert.doesNotMatch(changed, /<summary>판정 변경/)
  assert.match(changed, /가능한 결정 선택/)
  const repair = renderContext({ ...value, caseLinkData: { ...value.caseLinkData, canRepair: true, decisionId: 17, decisionVersion: 1 } })
  assert.doesNotMatch(repair, /<summary>판정 변경/)
  assert.match(repair, /확인된 노출을 대응 건에 연결/)
})

test('a real legacy linked exposure keeps current case action above evidence despite required reconfirmation and no decision id', () => {
  const html = renderContext({ ...context, origin: 'TEST', exposureStatus: 'ABNORMAL', storagePolicy: { ...context.storagePolicy, requiresReassessment: true }, caseLinkData: { caseId: 2, caseOrigin: 'TEST', caseLinkStatus: 'LINKED', canRepair: false, decisionId: null } }, '/secrets/triage/12?origin=TEST&occurrence=8')
  assert.match(html, /기존 노출 판정과 현재 대응이 있어요/)
  assert.match(html, /최신 근거 재확인은 별도로/)
  assert.match(html, /href="\/secrets\/cases\/2\?origin=TEST&amp;occurrence=8"/)
  assert.ok(html.indexOf('현재 대응 건에서 이 위치 조치') < html.indexOf('마지막 위치 검사'))
  assert.match(html, /<details class="card secret-scan-technical"><summary>판정 근거 재확인·변경/)
  assert.doesNotMatch(html, /<details class="card secret-scan-technical" open=/)
})
