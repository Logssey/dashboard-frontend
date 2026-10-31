import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { build } from 'esbuild'
const bundle = await build({ stdin: { contents: "export * from './src/api/secretRisk'; export * from './src/lib/secretRiskForms'; export * from './src/lib/secretEvidence'; export * from './src/components/SecretRiskActions'; export * from './src/components/SecretRiskAssetPicker';", resolveDir: resolve('.') }, bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, alias: { '@': resolve('src') } })
const path = resolve('node_modules/.secret-risk-actions-test.mjs'); await writeFile(path, bundle.outputFiles[0].contents); const api = await import(pathToFileURL(path).href); after(() => unlink(path))
const form = { evidenceType: 'ASSET_CLASSIFICATION', subject: 'OCCURRENCE', fields: [{ name: 'environment', type: 'ENUM', required: true, options: ['PROD', 'TEST', 'UNKNOWN'] }, ...['sensitive', 'important', 'testOnly'].map((name) => ({ name, type: 'BOOLEAN', required: true }))] }
const risk = { latestAutomaticAssessment: { assessmentId: 1, assessmentStatus: 'NOT_APPLICABLE', severity: null, ruleId: 'R00' }, effectiveAssessment: { severity: 'HIGH', held: true }, evidenceRevision: 3, capabilities: {}, evidenceSummary: [], evidenceForms: [form], allowedOverrideReasonCodes: ['EXPOSURE_CORRECTED'], allowedOverrideTargets: [{ assessmentStatus: 'NOT_APPLICABLE', severity: null, basisAssessmentId: 1 }], overrideMaxDurationDays: 7 }
function render(data, assets) { const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); if (assets) client.setQueryData(['secret-risk-assets', 8, 3, 0], assets); const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(api.SecretRiskActions, { occurrenceId: 8, risk: data, onReload() {}, ...(assets ? { evidenceType: 'ASSET_CLASSIFICATION' } : {}) }))); client.clear(); return html }
test('closed registered facts preserve false and reject extra fields, arbitrary JSON and unknown enum values', () => {
  const input = { environment: 'TEST', sensitive: 'false', important: 'false', testOnly: 'true' }
  assert.deepEqual(api.closedRiskFacts(form, input), { environment: 'TEST', sensitive: false, important: false, testOnly: true })
  assert.equal(api.closedRiskFacts(form, { ...input, rawSecret: 'sentinel' }), null); assert.equal(api.closedRiskFacts(form, { ...input, environment: 'ADMIN' }), null)
  assert.equal(api.closedRiskFacts(form, { ...input, sensitive: '' }), null)
  assert.equal(api.supportedEvidenceForm({ ...form, fields: [{ name: 'rawSecret', type: 'INTEGER', required: true }] }), false)
})
test('permission evidence records capability and target claims without allowing manual impact or identity values', () => {
  const mapping = { evidenceType: 'PERMISSION_MAPPING', subject: 'OCCURRENCE', fields: [{ name: 'capability', type: 'ENUM', required: true, options: ['RESOURCE_READ'] }, { name: 'targetScope', type: 'ENUM', required: true, options: ['ASSET'] }, ...['permissionCoverage', 'targetCoverage', 'restrictionCoverage', 'classificationCoverage'].map((name) => ({ name, type: 'ENUM', required: true, options: ['COMPLETE', 'PARTIAL'] }))] }
  const values = { capability: 'RESOURCE_READ', targetScope: 'ASSET', permissionCoverage: 'COMPLETE', targetCoverage: 'PARTIAL', restrictionCoverage: 'PARTIAL', classificationCoverage: 'PARTIAL' }
  assert.ok(api.closedRiskFacts(mapping, values)); assert.equal(api.closedRiskFacts(mapping, { ...values, impact: 'ADMIN' }), null)
  assert.equal(api.supportedEvidenceForm({ ...mapping, fields: [{ name: 'identityBindingStatus', type: 'ENUM', required: true, options: ['MATCHED'] }] }), false)
})
test('source reference selection uses current server-listed IDs and strips labels and observation metadata', () => {
  const observed = { type: 'VALIDATION_ATTEMPT', id: 9, version: 1, role: 'BINDS_IDENTITY', labelCode: 'ACTUAL_IDENTITY_OBSERVATION', observedAt: '2026-10-22T00:00:00Z' }
  assert.deepEqual(api.riskSourcePayload([observed], [api.riskSourceKey(observed)]), [{ type: 'VALIDATION_ATTEMPT', id: 9, version: 1, role: 'BINDS_IDENTITY' }])
  assert.equal(api.riskSourcePayload([observed], ['VALIDATION_ATTEMPT:999:1:BINDS_IDENTITY']), null)
  assert.equal(api.allowedRiskSources([{ ...observed, role: 'ASSERTS' }]).length, 0)
  assert.deepEqual(api.riskSourcePayload([], []), [])
})
test('partial manual incident support is explained instead of claiming confirmed abuse', () => {
  const html = render({ ...risk, capabilities: { canSubmitEvidence: true }, evidenceForms: [{ evidenceType: 'ABUSE_LINK', subject: 'OCCURRENCE', assessmentSupport: 'PARTIAL', reasonCode: 'ABUSE_LINKAGE_UNVERIFIED', fields: ['unauthorizedUseConfirmed', 'materialImpactConfirmed', 'credentialLinked', 'occurrenceLinked'].map((name) => ({ name, type: 'BOOLEAN', required: true })) }] })
  assert.match(html, /사고 연관 근거/); assert.doesNotMatch(html, /textarea|원문 붙여넣기/)
})
test('manual current evidence expires at its declared window and historical incidents are separate', () => {
  const now = Date.parse('2026-10-22T00:00:00Z')
  assert.equal(api.validRiskEvidenceWindow('ACCESS_SCOPE', '2026-10-21T23:00:00Z', '2026-10-22T05:00:00Z', now), true)
  assert.equal(api.validRiskEvidenceWindow('ACCESS_SCOPE', '2026-10-21T23:00:00Z', '2026-10-22T05:01:00Z', now), false)
  assert.equal(api.validRiskEvidenceWindow('ABUSE_LINK', '2025-10-21T23:00:00Z', null, now), true)
  assert.equal(api.riskInputUtc('2026-02-30T12:00'), null)
})
test('read-only capability never exposes evidence or override mutations', () => {
  const html = render(risk); assert.match(html, /현재 허용된 범위는 판단 근거 조회/); assert.doesNotMatch(html, /자료 제출|독립 검토 요청|현재 근거로 다시 평가|textarea/)
})
test('normal correction and independent review are offered without turning ordinary submission into double approval', () => {
  const html = render({ ...risk, capabilities: { canSubmitEvidence: true, canProposeOverride: true }, overrideProposals: [{ assessmentId: 4, targetAssessmentStatus: 'NOT_APPLICABLE', targetSeverity: null, validUntil: '2000-01-01T00:00:00Z', canReview: false, allowedDecisionReasonCodes: [] }] })
  assert.match(html, /현재 R00 교정에 따른 등급 보류 해제/); assert.match(html, /일반 자료 수용은 등급 재정의 승인과 별개/); assert.match(html, /만료된 제안은 적용할 수 없어요/); assert.doesNotMatch(html, /textarea|type="file"|원문 붙여넣기/)
})
test('risk command APIs retain expected revision, exact safe facts, nullable R00 severity and stable command keys', async () => {
  const originalFetch = globalThis.fetch, originalDocument = globalThis.document, calls = []
  globalThis.document = { cookie: 'XSRF-TOKEN=csrf-risk' }; globalThis.fetch = async (url, init) => { calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null }); return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }) }
  try {
    const common = { expectedEvidenceRevision: 3, idempotencyKey: 'same-key' }
    await api.submitRiskEvidence(8, { ...common, evidenceType: 'ASSET_CLASSIFICATION', subject: 'OCCURRENCE', observedAt: '2026-10-22T00:00:00Z', validUntil: '2026-10-22T12:00:00Z', evidenceRef: 'TICKET:SEC-123', facts: { environment: 'TEST', sensitive: false, important: false, testOnly: true } })
    await api.decideRiskEvidence(8, 2, { ...common, decision: 'ACCEPT', reasonCode: 'EVIDENCE_VERIFIED' })
    await api.requestAssessment(8, common); await api.fetchAssessmentRequest(6)
    await api.proposeSeverityOverride(8, { ...common, targetAssessmentStatus: 'NOT_APPLICABLE', targetSeverity: null, basisAssessmentId: 1, reasonCode: 'EXPOSURE_CORRECTED', evidenceIds: [2], validUntil: '2026-10-22T12:00:00Z' })
    await api.decideSeverityOverride(8, 4, { ...common, decision: 'APPROVE', reasonCode: 'PRIOR_EVIDENCE_DISPROVED' })
    assert.equal(calls[0].init.headers.get('X-XSRF-TOKEN'), 'csrf-risk'); assert.equal(calls[0].body.facts.sensitive, false); assert.equal(calls[1].url, '/api/v1/secrets/occurrences/8/risk-evidence/2/decisions'); assert.equal(calls[3].url, '/api/v1/secrets/assessment-requests/6'); assert.equal(calls[4].body.targetSeverity, null); assert.equal(calls[4].body.basisAssessmentId, 1); assert.equal(calls[5].body.expectedEvidenceRevision, 3)
    for (const call of calls.filter((entry) => entry.body)) { assert.equal(call.body.idempotencyKey, 'same-key'); assert.doesNotMatch(JSON.stringify(call.body), /rawSecret|PROVIDER_VERIFIED|PROVIDER_OBSERVED|sourceUrl/) }
  } finally { globalThis.fetch = originalFetch; globalThis.document = originalDocument }
})
test('version and permission failures never echo a provider error body', () => {
  assert.match(api.safeMutationMessage({ status: 409, message: 'secret-sentinel' }), /기준|버전/); assert.match(api.safeMutationMessage({ status: 403, message: 'secret-sentinel' }), /권한/); assert.doesNotMatch(api.safeMutationMessage({ status: 500, message: 'secret-sentinel' }), /secret-sentinel/)
})
test('override options follow server targets and never offer unsupported R99 grades or lower ranks', () => {
  const unassessed = render({ ...risk, allowedOverrideTargets: [], capabilities: { canProposeOverride: true } })
  assert.doesNotMatch(unassessed, /<option value="(CRITICAL|HIGH|MEDIUM|LOW)">/); assert.match(unassessed, /허용된 수동 판단 대상이 없어요/)
  const assessed = render({ ...risk, allowedOverrideTargets: [{ assessmentStatus: 'ASSESSED', severity: 'HIGH', basisAssessmentId: 5 }], capabilities: { canProposeOverride: true } })
  assert.match(assessed, /<option value="HIGH">/); assert.doesNotMatch(assessed, /<option value="(CRITICAL|MEDIUM|LOW|NOT_APPLICABLE)">/)
  assert.equal(api.permittedOverrideTargets([{ assessmentStatus: 'UNASSESSED', severity: null, basisAssessmentId: 3 }]).length, 0)
})
test('override deadline is the earlier of seven days and every selected evidence expiry', () => {
  const now = Date.parse('2026-10-22T00:00:00Z')
  assert.equal(api.overrideDeadline(7, [{ validUntil: null }], now), '2026-10-29T00:00:00.000Z')
  assert.equal(api.overrideDeadline(7, [{ validUntil: '2026-10-23T00:00:00Z' }, { validUntil: '2026-10-22T06:00:00Z' }], now), '2026-10-22T06:00:00.000Z')
  assert.equal(api.overrideDeadline(7, [{ validUntil: '2026-10-21T00:00:00Z' }], now), null)
  assert.equal(api.overrideDeadline(undefined, [{ validUntil: null }], now), null)
  assert.equal(api.overrideDeadline(7, [{}], now), null)
})

test('asset picker uses the same location and evidence revision, and requires explicit server linking capability', () => {
  const assets = { occurrenceId: 8, evidenceRevision: 3, items: [{ assetId: 5, label: '승인된 자산', provider: 'AWS', assetType: 'S3', environment: 'PROD' }], total: 1, page: 0, size: 20, capabilities: { canLinkAsset: true }, limitations: [] }
  const allowed = render({ ...risk, capabilities: { canSubmitEvidence: true } }, assets)
  assert.match(allowed, /등록 자산 연결/)
  assert.match(allowed, /<option value="5">승인된 자산/)
  assert.match(allowed, /자산 연결 없이 분류 자료만 기록/)
  assert.match(allowed, /연결만으로 이 키의 접근 권한이 확인되지는/)
  const scoped = render({ ...risk, capabilities: { canSubmitEvidence: true } }, { ...assets, capabilities: { canLinkAsset: false } })
  assert.match(scoped, /현재 권한으로 자산 연결을 변경할 수 없어요/)
  assert.doesNotMatch(scoped, /<option value="5">|승인된 자산/)
  const stale = render({ ...risk, capabilities: { canSubmitEvidence: true } }, { ...assets, occurrenceId: 9 })
  assert.match(stale, /근거가 바뀌었어요/)
  assert.doesNotMatch(stale, /<option value="5">|승인된 자산/)
})

test('asset listing and explicit classified asset submission keep location, revision and asset parent separate from facts', async () => {
  const originalFetch = globalThis.fetch, originalDocument = globalThis.document, calls = []
  globalThis.document = { cookie: 'XSRF-TOKEN=csrf-risk' }
  globalThis.fetch = async (url, init) => { calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null }); return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }) }
  try {
    await api.fetchRiskAssets(8, 2)
    await api.submitRiskEvidence(8, { expectedEvidenceRevision: 3, idempotencyKey: 'asset-claim', evidenceType: 'ASSET_CLASSIFICATION', subject: 'OCCURRENCE', observedAt: '2026-10-22T00:00:00Z', validUntil: '2026-10-22T12:00:00Z', evidenceRef: 'TICKET:SEC-123', facts: { environment: 'PROD', sensitive: false, important: false, testOnly: false }, assetId: 5 })
    assert.equal(calls[0].url, '/api/v1/secrets/occurrences/8/risk-assets?page=2&size=20')
    assert.equal(calls[1].url, '/api/v1/secrets/occurrences/8/risk-evidence')
    assert.equal(calls[1].body.assetId, 5)
    assert.equal(calls[1].body.expectedEvidenceRevision, 3)
    assert.equal(calls[1].body.facts.assetId, undefined)
    assert.equal(calls[1].body.facts.sensitive, false)
    assert.equal(calls[1].init.headers.get('X-XSRF-TOKEN'), 'csrf-risk')
  } finally { globalThis.fetch = originalFetch; globalThis.document = originalDocument }
})

test('asset picker distinguishes loading, failure and an empty allowed list while letting a proposed choice be cancelled', () => {
  const selectedAsset = { assetId: 5, label: '선택한 자산', provider: 'AWS', assetType: 'S3', environment: 'PROD' }
  const props = { occurrenceId: 8, evidenceRevision: 3, selectedAsset, page: 0, onSelect() {}, onPage() {}, onRetry() {} }
  const loading = renderToStaticMarkup(createElement(api.SecretRiskAssetPicker, { ...props, state: 'LOADING' }))
  assert.match(loading, /자산을 불러오는 중/)
  assert.match(loading, /자산 선택 취소/)
  assert.doesNotMatch(loading, /현재 선택할 등록 자산이 없어요/)
  const failure = renderToStaticMarkup(createElement(api.SecretRiskAssetPicker, { ...props, state: 'ERROR' }))
  assert.match(failure, /자산 목록을 불러오지 못했어요/)
  assert.match(failure, /다시 조회/)
  assert.match(failure, /자산 선택 취소/)
  assert.doesNotMatch(failure, /<option value="5">|선택한 자산/)
  const empty = renderToStaticMarkup(createElement(api.SecretRiskAssetPicker, { ...props, state: 'READY', selectedAsset: null, data: { occurrenceId: 8, evidenceRevision: 3, items: [], total: 0, page: 0, size: 20, capabilities: { canLinkAsset: true }, limitations: [] } }))
  assert.match(empty, /현재 선택할 등록 자산이 없어요/)
  assert.match(empty, /자산 연결 없이 분류 자료만 기록/)
  assert.doesNotMatch(empty, /자산 목록을 불러오지 못했어요/)
  const selected = renderToStaticMarkup(createElement(api.SecretRiskAssetPicker, { ...props, state: 'READY', data: { occurrenceId: 8, evidenceRevision: 3, items: [selectedAsset], total: 1, page: 0, size: 20, capabilities: { canLinkAsset: true }, limitations: [] } }))
  assert.match(selected, /이전 분류·권한 자료는 이력에 보존하고 현재 근거를 다시 확인/)
})

test('new asset classification excludes prior asset and classification parents from both choices and submitted references', () => {
  const refs = [
    { type: 'ASSET', id: 5, version: 1, role: 'CLASSIFIES' },
    { type: 'RISK_EVIDENCE', id: 6, version: 1, role: 'CLASSIFIES' },
    { type: 'VALIDATION_ATTEMPT', id: 9, version: 1, role: 'BINDS_IDENTITY' },
    { type: 'INVESTIGATION_HISTORY', id: 10, version: 2, role: 'ASSERTS' },
    { type: 'INVESTIGATION_HISTORY', id: 11, version: 2, role: 'LIMITS' },
  ]
  const selected = refs.map(api.riskSourceKey)
  assert.deepEqual(api.riskEvidenceSources(refs, 'ASSET_CLASSIFICATION', 7), refs.slice(2))
  assert.deepEqual(api.riskEvidenceSourcePayload(refs, selected, 'ASSET_CLASSIFICATION', 7), refs.slice(2))
  assert.deepEqual(api.riskEvidenceSources(refs, 'ASSET_CLASSIFICATION'), [refs[0], ...refs.slice(2)])
  assert.deepEqual(api.riskEvidenceSources(refs, 'PERMISSION_MAPPING', 7), refs)
  assert.equal(api.riskEvidenceSourcePayload(refs, [...selected, 'ASSET:999:1:CLASSIFIES'], 'ASSET_CLASSIFICATION', 7), null)
})
