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
  assert.match(html, /최근 자동 평가/); assert.match(html, /미평가/); assert.match(html, /현재 적용 판단/); assert.match(html, /치명적/); assert.match(html, /기존 판단 유지 · 재검토 필요/); assert.match(html, /R01/); assert.match(html, /R99/); assert.match(html, /마지막 확정 등급/); assert.doesNotMatch(html, /악용 없음/)
})
test('R00 with null severity remains distinct from R99 and low risk', () => {
  assert.equal(api.severityText(null, 'NOT_APPLICABLE'), '심각도 적용 대상 아님'); assert.equal(api.severityText(null, 'UNASSESSED'), '미평가')
  const html = render({ ...data, latestAutomaticAssessment: { ...assessment, assessmentStatus: 'NOT_APPLICABLE', ruleId: 'R00' } })
  assert.match(html, /보관 허용 · 심각도 적용 대상 아님/); assert.doesNotMatch(html, /<strong>낮음/)
})
test('manual acceptance is not provider verification and uninvestigated abuse is not absence', () => {
  const html = render({ ...data, evidenceSummary: [{ evidenceId: 4, kind: 'PERMISSION_MAPPING', verificationLevel: 'MANUAL_ACCEPTED', observedAt: null }] })
  assert.match(html, /담당자 확인/); assert.match(html, /확인된 악용 근거 없음 · 미조사일 수 있음/); assert.match(html, /권한·대상 확인 필요/); assert.doesNotMatch(html, /공급자 자동 관측|악용 없음/)
})
test('assessment history follows the URL page instead of appending current panels', () => {
  const html = render(data, '/?occurrence=8&riskView=history&assessmentPage=2', { items: [{ assessmentId: 5, recordKind: 'REVIEW', decision: 'APPROVE', createdAt: '2026-10-22T00:00:00Z' }], total: 21, page: 1, size: 20 })
  assert.match(html, /독립 검토/); assert.doesNotMatch(html, /확인한 여섯 가지 사실|현재 적용 판단/)
})
