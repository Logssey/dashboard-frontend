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
const bundle = await build({ stdin: { contents: "export * from './src/api/secretRisk'; export * from './src/lib/secretRisk'; export * from './src/components/SecretRiskPanel';", resolveDir: resolve('.') }, bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, alias: { '@': resolve('src') } })
const path = resolve('node_modules/.secret-risk-test.mjs'); await writeFile(path, bundle.outputFiles[0].contents); const api = await import(pathToFileURL(path).href); after(() => unlink(path))
const assessment = { assessmentId: 9, assessmentStatus: 'UNASSESSED', severity: null, ruleId: 'R99', policyVersion: 'severity-v2', assessedAt: '2026-10-22T00:00:00Z' }
const data = { latestAutomaticAssessment: assessment, effectiveAssessment: null, lastConfirmedSeverity: null, evidenceRevision: 3, inputs: { exposure: 'ABNORMAL', exposureRange: 'UNKNOWN', credential: 'CONFIRMED', impact: 'UNKNOWN', abuse: 'NOT_CONFIRMED', validity: 'UNCHECKED' }, evidenceSummary: [], missingReasonCodes: ['IMPACT_UNKNOWN'], capabilities: {}, readAt: '2026-10-22T00:00:00Z' }
function render(value, url = '/?occurrence=8', history) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } }); client.setQueryData(['secret-risk', 8], value); if (history) client.setQueryData(['secret-assessment-history', 8, 1], history)
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: [url] }, createElement(api.SecretRiskPanel, { occurrenceId: 8 })))); client.clear(); return html
}
test('unassessed automatic risk preserves and explains a separately held incident grade', () => {
  const html = render({ ...data, effectiveAssessment: { ...assessment, assessmentId: 2, sourceAssessmentId: 1, assessmentStatus: 'ASSESSED', severity: 'CRITICAL', ruleId: 'R01', held: true, reviewRequired: true, holdReasonCodes: ['EXPOSURE_INCIDENT_CONFLICT'] }, lastConfirmedSeverity: { assessmentId: 1, severity: 'CRITICAL', assessedAt: '2026-10-20T00:00:00Z' } })
  assert.match(html, /최근 자동 평가/); assert.match(html, /미평가/); assert.match(html, /현재 적용 판단/); assert.match(html, /Critical/); assert.match(html, /기존 판단 유지 · 재검토 필요/); assert.match(html, /R01/); assert.match(html, /R99/); assert.match(html, /마지막 확정 등급/); assert.doesNotMatch(html, /악용 없음/)
})
test('R00 with null severity remains distinct from R99 and low risk', () => {
  assert.equal(api.severityText(null, 'NOT_APPLICABLE'), '위험도 적용 대상 아님'); assert.equal(api.severityText(null, 'UNASSESSED'), '미평가')
  const html = render({ ...data, latestAutomaticAssessment: { ...assessment, assessmentStatus: 'NOT_APPLICABLE', ruleId: 'R00' } })
  assert.match(html, /유효한 보관 허용 근거/); assert.match(html, /위험도 적용 대상 아님/); assert.doesNotMatch(html, /<strong>낮음/)
})
test('manual acceptance is not provider verification and uninvestigated abuse is not absence', () => {
  const html = render({ ...data, evidenceSummary: [{ evidenceId: 4, kind: 'PERMISSION_MAPPING', verificationLevel: 'MANUAL_ACCEPTED', observedAt: null }] })
  assert.match(html, /담당자 확인/); assert.match(html, /확인된 악용 근거 없음 · 미조사일 수 있음/); assert.match(html, /권한·대상 확인 필요/); assert.doesNotMatch(html, /공급자 자동 관측|악용 없음/)
})
test('assessment history follows the URL page instead of appending current panels', () => {
  const html = render(data, '/?occurrence=8&riskView=history&assessmentPage=2', { items: [{ assessmentId: 5, recordKind: 'REVIEW', decision: 'APPROVE', createdAt: '2026-10-22T00:00:00Z' }], total: 21, page: 1, size: 20 })
  assert.match(html, /독립 검토/); assert.doesNotMatch(html, /확인한 여섯 가지 사실|현재 적용 판단/)
})
test('rejected evidence and failed assessment have explicit states without claiming pending or success', () => {
  assert.equal(api.riskEvidenceState('MANUAL_SUBMITTED', 'REJECTED'), '자료 거절 · 현재 근거로 사용하지 않음')
  assert.match(api.assessmentFailureReason('ASSESSMENT_PROCESSING_FAILED'), /완료하지 못했어요/)
  assert.doesNotMatch(api.assessmentFailureReason('secret-sentinel'), /secret-sentinel/)
  const html = render({ ...data, evidenceSummary: [{ evidenceId: 9, type: 'ASSET_CLASSIFICATION', verificationLevel: 'MANUAL_SUBMITTED', status: 'REJECTED', observedAt: null }] })
  assert.match(html, /자료 거절/); assert.doesNotMatch(html, /담당자 제출 · 수용 대기/)
})

test('identical current and automatic R99 is one result while facts stay in a closed disclosure', () => {
  const html = render({ ...data, effectiveAssessment: assessment })
  assert.equal((html.match(/<strong>미평가<\/strong>/g) ?? []).length, 1)
  assert.match(html, /<details class="secret-risk-technical"><summary>평가에 사용한 사실/)
  assert.doesNotMatch(html, /최근 자동 평가|현재 적용 판단/)
})

const analysisContext = {
  occurrenceId: 8, evidenceRevision: 3, profileVersion: 'risk-context-v1', readAt: '2026-10-22T00:00:00Z',
  source: { provider: 'GITHUB', issuer: 'AWS', credentialType: 'AWS_ACCESS_KEY_PAIR' },
  access: { status: 'CONFIRMED', range: 'BROAD', observedAt: '2026-10-22T00:00:00Z', validUntil: '2026-10-22T06:00:00Z', evidenceIds: [2], verificationLevel: 'PROVIDER_OBSERVED' },
  permissions: { status: 'PARTIAL', capabilities: ['RESOURCE_READ'], targetScopes: ['ASSET'], coverage: { permissionCoverage: 'COMPLETE', targetCoverage: 'PARTIAL', restrictionCoverage: 'UNKNOWN', classificationCoverage: 'COMPLETE' }, observedAt: '2026-10-22T00:00:00Z', validUntil: '2026-10-23T00:00:00Z', evidenceIds: [4], reasonCodes: ['PERMISSION_MAPPING_INCOMPLETE'], verificationLevel: 'MANUAL_ACCEPTED', mappingVersion: 'manual-evidence-v1' },
  asset: { status: 'CLASSIFIED', assetId: 5, label: '승인된 업무 자산', provider: 'AWS', assetType: 'S3', environment: 'PROD', classification: { sensitive: true, important: false, testOnly: false }, evidenceIds: [3] },
  explanation: { ruleId: 'R99', policyVersion: 'severity-v2', reasonCode: 'RULE_R99', inputs: {}, missingReasonCodes: ['IMPACT_UNKNOWN'], assessmentCurrent: true },
  limitations: ['AUTOMATED_PERMISSION_ANALYSIS_UNSUPPORTED', 'MANUAL_ASSET_LINK_NOT_PERMISSION_PROOF', 'VALIDITY_NOT_PERMISSION_PROOF'],
}

test('location context distinguishes public access, partial permission evidence and classified assets without changing v2 risk', () => {
  const html = render({ ...data, analysisContext })
  assert.match(html, /공개·광범위 접근 확인/)
  assert.match(html, /일부 권한만 확인/)
  assert.ok(html.indexOf('수용된 수동 근거') < html.indexOf('secret-risk-context-detail'))
  assert.match(html, /특정 자원 읽기/)
  assert.match(html, /승인된 업무 자산/)
  assert.match(html, /민감 데이터 있음/)
  assert.match(html, /자동 조회 결과가 아닌 수용된 근거/)
  assert.match(html, /인증 성공만으로 업무 권한을 확인하지/)
  assert.match(html, /<strong>미평가<\/strong>/)
  assert.doesNotMatch(html, /<strong>치명적<\/strong>|자산 분류 보완/)
})

test('wrong-location or stale-revision context never borrows another asset or permission claim', () => {
  for (const context of [{ ...analysisContext, occurrenceId: 9 }, { ...analysisContext, evidenceRevision: 2 }, { ...analysisContext, profileVersion: 'unsupported-v3' }]) {
    const html = render({ ...data, analysisContext: context })
    assert.match(html, /선택한 위치의 근거가 갱신/)
    assert.doesNotMatch(html, /승인된 업무 자산|공개·광범위 접근 확인|특정 자원 읽기/)
  }
})

test('unknown or unlinked context stays explicit and a permitted asset action does not become a severity editor', () => {
  const html = render({ ...data, analysisContext: { ...analysisContext, access: { ...analysisContext.access, status: 'UNKNOWN', range: 'UNKNOWN', verificationLevel: null }, permissions: { ...analysisContext.permissions, status: 'UNKNOWN', capabilities: [], targetScopes: [] }, asset: { ...analysisContext.asset, status: 'UNLINKED', assetId: null, label: null, classification: null } }, capabilities: { canSubmitEvidence: true }, evidenceForms: [{ evidenceType: 'ASSET_CLASSIFICATION', subject: 'OCCURRENCE', fields: [{ name: 'environment', type: 'ENUM', required: true, options: ['PROD', 'DEV'] }] }] })
  assert.match(html, /읽기 범위 미확인/)
  assert.match(html, /권한·대상 미확인/)
  assert.match(html, /연결된 자산 없음/)
  assert.match(html, /자산 분류 보완/)
  assert.doesNotMatch(html, /분류 근거 확인|<option value="CRITICAL"/)
})
