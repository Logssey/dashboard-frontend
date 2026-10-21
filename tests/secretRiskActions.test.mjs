import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { build } from 'esbuild'
const bundle = await build({ stdin: { contents: "export * from './src/api/secretRisk'; export * from './src/lib/secretRiskForms'; export * from './src/lib/secretEvidence'; export * from './src/components/SecretRiskActions';", resolveDir: resolve('.') }, bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, alias: { '@': resolve('src') } })
const path = resolve('node_modules/.secret-risk-actions-test.mjs'); await writeFile(path, bundle.outputFiles[0].contents); const api = await import(pathToFileURL(path).href); after(() => unlink(path))
const form = { evidenceType: 'ASSET_CLASSIFICATION', subject: 'OCCURRENCE', fields: [{ name: 'environment', type: 'ENUM', required: true, options: ['PROD', 'TEST', 'UNKNOWN'] }, ...['sensitive', 'important', 'testOnly'].map((name) => ({ name, type: 'BOOLEAN', required: true }))] }
const risk = { latestAutomaticAssessment: { assessmentId: 1, assessmentStatus: 'NOT_APPLICABLE', severity: null, ruleId: 'R00' }, effectiveAssessment: { severity: 'HIGH', held: true }, evidenceRevision: 3, capabilities: {}, evidenceSummary: [], evidenceForms: [form], allowedOverrideReasonCodes: ['EXPOSURE_CORRECTED'] }
function render(data) { const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(api.SecretRiskActions, { occurrenceId: 8, risk: data, onReload() {} }))); client.clear(); return html }
test('closed registered facts preserve false and reject extra fields, arbitrary JSON and unknown enum values', () => {
  const input = { environment: 'TEST', sensitive: 'false', important: 'false', testOnly: 'true' }
  assert.deepEqual(api.closedRiskFacts(form, input), { environment: 'TEST', sensitive: false, important: false, testOnly: true })
  assert.equal(api.closedRiskFacts(form, { ...input, rawSecret: 'sentinel' }), null); assert.equal(api.closedRiskFacts(form, { ...input, environment: 'ADMIN' }), null)
  assert.equal(api.closedRiskFacts(form, { ...input, sensitive: '' }), null)
  assert.equal(api.supportedEvidenceForm({ ...form, fields: [{ name: 'rawSecret', type: 'INTEGER', required: true }] }), false)
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
