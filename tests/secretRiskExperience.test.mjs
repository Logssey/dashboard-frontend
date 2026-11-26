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

const built = await build({ stdin: { contents: "export * from './src/components/SecretRiskExperience'; export * from './src/components/SecretRiskPanel'; export * from './src/components/SecretRiskApplicability'; export * from './src/lib/secretRiskExperience'; export * from './src/lib/secretRiskForms';", resolveDir: resolve('.') }, bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, alias: { '@': resolve('src') } })
const modulePath = resolve('node_modules/.secret-risk-experience-test.mjs')
await writeFile(modulePath, built.outputFiles[0].contents)
const api = await import(pathToFileURL(modulePath).href)
after(() => unlink(modulePath))
const readAt = '2026-11-07T04:00:00Z'
const experience = {
  version: 'risk-experience-v1', readAt, severityLabel: '시크릿 노출 위험도', sourcePresenceObservedAt: '2026-11-07T03:00:00Z',
  summary: { status: 'UNASSESSED', reasonCode: 'RULE_R99', ruleId: 'R99', severity: null },
  criteria: [
    { axis: 'exposure', value: 'ABNORMAL', status: 'CONFIRMED', evidenceIds: [1], reasonCodes: [], nextAction: 'NONE' },
    { axis: 'exposureRange', value: 'UNKNOWN', status: 'UNKNOWN', evidenceIds: [], reasonCodes: ['ACCESS_COEXISTENCE_UNCONFIRMED'], nextAction: 'REVIEW_ACCESS' },
    { axis: 'credential', value: 'CONFIRMED', status: 'CONFIRMED', evidenceIds: [2], reasonCodes: [], nextAction: 'NONE' },
    { axis: 'impact', value: 'UNKNOWN', status: 'CANDIDATE', evidenceIds: [3], reasonCodes: ['IMPACT_UNKNOWN'], nextAction: 'REVIEW_PERMISSIONS' },
    { axis: 'abuse', value: 'NOT_CONFIRMED', status: 'UNKNOWN', evidenceIds: [], reasonCodes: [], nextAction: 'NONE' },
    { axis: 'validity', value: 'INVALID', status: 'CONFIRMED', evidenceIds: [4], reasonCodes: [], nextAction: 'NONE' },
  ],
  missingFacts: [{ code: 'IMPACT_UNKNOWN', evidenceType: 'PERMISSION_MAPPING', action: 'REVIEW_PERMISSIONS' }],
  workPriority: { policyVersion: 'work-priority-v1', level: 'PRIORITY', reasonCodes: ['PUBLIC_PRIVILEGED_CANDIDATE'], clockMode: 'BUSINESS_HOURS', timeZone: 'Asia/Seoul', targetBasis: 'FIRST_OBSERVED', targetBasisAt: readAt, acknowledgeDueAt: '2026-11-09T04:00:00Z', planDueAt: '2026-11-11T06:00:00Z', operatingHoursNow: false, holidayCalendarConfigured: false },
  riskAcceptance: { enabled: false, reasonCode: 'RISK_ACCEPTANCE_DISABLED', maximumDays: 7, allowedSeverities: ['MEDIUM', 'LOW'] },
  support: { permissionAssistance: { status: 'PARTIAL', reasonCodes: [] }, automaticUsage: { status: 'UNSUPPORTED', reasonCodes: [] } },
}
function render(Component, props, seeds = [], url = '/secrets/12?occurrence=8') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } })
  seeds.forEach(([key, value]) => client.setQueryData(key, value))
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: [url] }, createElement(Component, props))))
  client.clear()
  return html
}
const props = { experience, canSupplement: true, onAction() {} }

test('assessment waiting and missing evidence after completion have distinct explanations', () => {
  const waiting = render(api.SecretRiskExperience, { ...props, process: { status: 'PENDING', workerAvailable: false } })
  assert.match(waiting, /평가 작업이 대기 중/)
  assert.match(waiting, /평가 워커의 연결 상태/)
  const running = render(api.SecretRiskExperience, { ...props, process: { status: 'RUNNING', workerAvailable: true } })
  assert.match(running, /완료되면 자동으로 갱신/)
  const completed = render(api.SecretRiskExperience, { ...props, process: { status: 'COMPLETED', workerAvailable: true } })
  assert.match(completed, /평가는 완료됐지만 등급을 정할 근거가 부족/)
  assert.doesNotMatch(completed, /평가 작업이 대기 중/)
})

test('policy grades are shown without replacing them with authentication status', () => {
  for (const [grade, label] of [['CRITICAL','Critical'],['HIGH','High'],['MEDIUM','Medium'],['LOW','Low']]) {
    const html = render(api.SecretRiskExperience, { ...props, experience: { ...experience,
      summary: { ...experience.summary, status: 'CURRENT', severity: grade, ruleId: 'R03' } },
      process: { status: 'COMPLETED', workerAvailable: true } })
    assert.match(html, new RegExp(`<strong>${label}</strong>`))
    assert.doesNotMatch(html, /평가는 완료됐지만 등급을 정할 근거가 부족/)
  }
})
test('risk explanation shows six read-only facts, candidates, current authentication and only the missing question', () => {
  const html = render(api.SecretRiskExperience, props)
  for (const label of ['보관·공유 적정성', '접근 가능 범위', '키 구성 확인', '권한과 자원 영향', '중대한 사고 근거', '현재 인증 상태']) assert.match(html, new RegExp(label))
  assert.match(html, /후보 · 확인 필요/)
  assert.match(html, /미평가/)
  assert.match(html, /같은 시점에 함께 있었는지/)
  assert.match(html, /사용 불가 · 원인은 별도 확인/)
  assert.match(html, /다음 행동/)
  assert.match(html, /권한·자산 근거 확인/)
  assert.doesNotMatch(html, /<select|textarea|AI로|사용 이력 조회|위험 수용 승인|value="ADMIN"/)
})
test('priority is distinct from grade and preserves server business-hours targets', () => {
  const html = render(api.SecretRiskExperience, props)
  assert.match(html, /우선 확인/)
  assert.match(html, /월~금 09~18시/)
  assert.match(html, /지금은 운영 시간 밖/)
  assert.match(html, /공휴일 캘린더는 연결되지 않았어요/)
  assert.match(html, /해결 완료 기한과는 구분/)
  assert.doesNotMatch(html, /1시간 안에 해결|24시간 운영/)
  for (const code of ['UNRESOLVED_CRITICAL', 'UNRESOLVED_HIGH', 'PUBLIC_CREDENTIAL_REQUIRES_INVESTIGATION', 'NO_OPEN_EXPOSURE_ACTION', 'LOW_EXPOSURE', 'EVIDENCE_REQUIRES_REVIEW', 'MEDIUM_EXPOSURE']) assert.equal(typeof api.priorityReason(code), 'string')
  assert.doesNotMatch(api.priorityReason('PUBLIC_CREDENTIAL_REQUIRES_INVESTIGATION'), /공개 원문.*확인/)
})
test('missing facts for the same action and evidence form become one question with all reasons and one action', () => {
  const value = { ...experience, missingFacts: [
    { code: 'EXPOSURERANGE_REQUIRED', evidenceType: 'ACCESS_SCOPE', action: 'REVIEW_ACCESS' },
    { code: 'ACCESS_COEXISTENCE_UNCONFIRMED', evidenceType: 'ACCESS_SCOPE', action: 'REVIEW_ACCESS' },
    { code: 'ACCESS_COEXISTENCE_UNCONFIRMED', evidenceType: 'ACCESS_SCOPE', action: 'REVIEW_ACCESS' },
    { code: 'IMPACT_REQUIRED', evidenceType: 'PERMISSION_MAPPING', action: 'REVIEW_PERMISSIONS' },
    { code: 'ASSESSMENT_REFRESH_REQUIRED', evidenceType: null, action: 'REQUEST_ASSESSMENT' },
  ] }
  const html = render(api.SecretRiskExperience, { ...props, experience: value })
  const questions = html.match(/<section class="secret-risk-questions"[^>]*>(.*?)<\/section>/s)[1]
  assert.equal((questions.match(/<li>/g) ?? []).length, 3)
  assert.equal((questions.match(/>접근 범위 근거 보완<\/button>/g) ?? []).length, 1)
  assert.match(questions, /원문을 실제로 읽을 수 있는 범위/)
  assert.equal((questions.match(/저장소 공개와 키 원문이 같은 시점/g) ?? []).length, 1)
  assert.match(questions, /저장된 근거로 다시 평가하세요/)
})
test('unsupported cross-source and Notion permission assistance never display a fake permission action', () => {
  for (const code of ['GITHUB_CROSS_SOURCE_UNSUPPORTED', 'NOTION_PERMISSION_UNSUPPORTED']) {
    const value = { ...experience, support: { ...experience.support, permissionAssistance: { status: 'UNSUPPORTED', reasonCodes: [code] } } }
    const html = render(api.SecretRiskExperience, { ...props, experience: value })
    assert.match(html, /지원하지 않아요/)
    assert.doesNotMatch(html, /권한 조회 완료|전체 권한 확인됨/)
  }
  assert.equal(api.priorityLabel('__proto__'), '우선순위 확인 필요')
  assert.equal(api.riskActionLabel('unknown-sensitive-sentinel'), null)
  assert.equal(api.criterionStatusLabel('__proto__'), '상태 확인 필요')
})
test('stale and metadata summaries do not present retained grades as fresh automatic results', () => {
  const stale = render(api.SecretRiskExperience, { ...props, experience: { ...experience, summary: { ...experience.summary, status: 'STALE', severity: 'HIGH' } } })
  assert.match(stale, /다시 확인 필요/)
  assert.doesNotMatch(stale, /<strong>High<\/strong>|현재 근거 기준/)
  const metadata = render(api.SecretRiskExperience, { ...props, experience: { ...experience, summary: { status: 'METADATA_ONLY', reasonCode: 'METADATA_ONLY', ruleId: null, severity: null }, missingFacts: [] } })
  assert.match(metadata, /원문 노출 평가 대상 아님/)
  assert.doesNotMatch(metadata, /<strong>낮음<\/strong>/)
  const held = render(api.SecretRiskExperience, { ...props, experience: { ...experience, summary: { ...experience.summary, severity: 'HIGH', automaticSeverity: null, held: true } } })
  assert.match(held, /<strong>High<\/strong>/)
  assert.match(held, /기존 높은 판단 유지/)
  assert.match(held, /최근 자동 평가 미평가/)
})
test('expired, post-action and inconclusive authentication facts explain why historical success is not current', () => {
  for (const reasonCode of ['CHECK_PERIOD_EXCEEDED', 'POST_ACTION_VALIDATION_REQUIRED', 'NO_CURRENT_CONCLUSIVE_RESULT']) {
    const value = { ...experience, criteria: experience.criteria.map((fact) => fact.axis === 'validity' ? { ...fact, value: 'UNKNOWN', status: 'STALE', reasonCodes: [reasonCode] } : fact) }
    const html = render(api.SecretRiskExperience, { ...props, experience: value })
    assert.match(html, /인증 확인 불가/)
    assert.match(html, /이전 근거 · 재확인/)
    assert.doesNotMatch(html, new RegExp(reasonCode))
    assert.doesNotMatch(html, /<strong>공급자 인증 확인<\/strong>/)
  }
})
test('current summary, evidence editing and history replace each other instead of piling up', () => {
  const risk = { latestAutomaticAssessment: null, effectiveAssessment: null, lastConfirmedSeverity: null, evidenceRevision: 3, capabilities: { canSubmitEvidence: true }, riskExperience: experience, readAt }
  const current = render(api.SecretRiskPanel, { occurrenceId: 8 }, [[['secret-risk', 8], risk]])
  assert.match(current, /이 항목만 확인하세요/)
  assert.doesNotMatch(current, /부족한 자료 보완|근거 보완·재평가·독립 검토<\/summary>/)
  const evidence = render(api.SecretRiskPanel, { occurrenceId: 8 }, [[['secret-risk', 8], risk]], '/secrets/12?occurrence=8&riskView=evidence')
  assert.match(evidence, /부족한 자료 보완/)
  assert.doesNotMatch(evidence, /이 항목만 확인하세요|시크릿 노출 위험도 요약/)
  const history = render(api.SecretRiskPanel, { occurrenceId: 8 }, [[['secret-risk', 8], risk], [['secret-assessment-history', 8, 0], { items: [], total: 0, page: 0, size: 20 }]], '/secrets/12?occurrence=8&riskView=history')
  assert.match(history, /저장된 평가 이력이 없어요/)
  assert.doesNotMatch(history, /이 항목만 확인하세요|부족한 자료 보완/)
})
test('explicit applicability has a half-open interval, no generated defaults and an independent observation time', () => {
  const from = '2026-11-07T00:00:00Z', until = '2026-11-07T04:00:00Z'
  assert.equal(api.validRiskApplicability(from, until, from), true)
  assert.equal(api.validRiskApplicability(from, until, until), false)
  assert.equal(api.validRiskApplicability(until, from, from), false)
  assert.equal(api.validRiskApplicability(null, until, from), false)
  assert.equal(api.validRiskApplicability(from, until, from, '2026-11-06T23:59:00Z'), false)
  assert.equal(api.validRiskApplicability(from, until, from, from, '2026-11-07T03:59:59Z'), false)
  const html = render(api.SecretRiskApplicability, { from: '', until: '', sourceObservedAt: from, onFrom() {}, onUntil() {} })
  assert.match(html, /사실이 적용된 기간/)
  assert.match(html, /자료로 확인한 기간만 입력/)
  assert.equal((html.match(/value=""/g) ?? []).length, 2)
})
