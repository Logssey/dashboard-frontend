import type { OverrideTarget, RiskEvidenceForm } from '../api/secretRisk'
export const riskFieldLabels: Record<string, string> = {
  audienceClass: '읽을 수 있는 범위', coverageStatus: '확인 범위의 완전성', publicAccessConfirmed: '공개 접근 확인', boundedPrincipalCount: '식별한 접근 주체 수',
  identityBindingStatus: '발견 키와 권한 주체의 연결', support: '해당 유형의 영향 분석 지원', permissionCoverage: '권한 조회 완전성', targetCoverage: '전체 대상 조회 완전성', restrictionCoverage: '제한 통제 확인 완전성', classificationCoverage: '자산 분류 완전성', impact: '근거로 확인한 영향 범주',
  environment: '대상 환경', sensitive: '민감 데이터 포함', important: '중요 자원', testOnly: '테스트 전용 자원',
  unauthorizedUseConfirmed: '비인가 사용 확인', materialImpactConfirmed: '중대한 영향 확인', credentialLinked: '해당 키와 사고의 연결 확인', occurrenceLinked: '해당 위치·노출과 사고의 연결 확인', investigationStatus: '악용 조사 진행 상태',
}
const fields: Record<string, string[]> = {
  ACCESS_SCOPE: ['audienceClass', 'coverageStatus', 'publicAccessConfirmed', 'boundedPrincipalCount'],
  PERMISSION_MAPPING: ['identityBindingStatus', 'support', 'permissionCoverage', 'targetCoverage', 'restrictionCoverage', 'classificationCoverage', 'impact'],
  ASSET_CLASSIFICATION: ['environment', 'sensitive', 'important', 'testOnly'], ABUSE_LINK: ['unauthorizedUseConfirmed', 'materialImpactConfirmed', 'credentialLinked', 'occurrenceLinked'], ABUSE_COVERAGE: ['investigationStatus', 'coverageStatus'],
}
export const controlledCode = (code: string) => /^[A-Z][A-Z0-9_]{0,79}$/.test(code)
export function supportedEvidenceForm(form: RiskEvidenceForm): boolean {
  return form.subject === 'OCCURRENCE' && !!fields[form.evidenceType] && form.fields.length > 0 && new Set(form.fields.map((item) => item.name)).size === form.fields.length && form.fields.every((item) => fields[form.evidenceType].includes(item.name) && ['ENUM', 'BOOLEAN', 'INTEGER'].includes(item.type) && (item.type !== 'ENUM' || !!item.options?.length && item.options.every(controlledCode)))
}
export function closedRiskFacts(form: RiskEvidenceForm, values: Record<string, string>): Record<string, string | boolean | number> | null {
  if (!supportedEvidenceForm(form) || Object.keys(values).some((key) => !form.fields.some((item) => item.name === key))) return null
  const facts: Record<string, string | boolean | number> = {}
  for (const field of form.fields) {
    const value = values[field.name]
    if (!value) { if (field.required) return null; continue }
    if (field.type === 'BOOLEAN') { if (!['true', 'false'].includes(value)) return null; facts[field.name] = value === 'true' }
    else if (field.type === 'ENUM') { if (!field.options?.includes(value)) return null; facts[field.name] = value }
    else { const number = Number(value); if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < (field.minimum ?? 0) || number > (field.maximum ?? Number.MAX_SAFE_INTEGER)) return null; facts[field.name] = number }
  }
  return facts
}
export const riskOptionLabel = (value: string) => ({ BROAD: '광범위 접근', BOUNDED: '식별·제한된 접근', UNKNOWN: '확인되지 않음', COMPLETE: '전체 확인', PARTIAL: '일부만 확인', NOT_APPLICABLE: '비적용 근거 있음', MATCHED: '같은 키·주체로 연결 확인', UNRESOLVED: '연결 미확인', CONFLICT: '연결 근거 충돌', SUPPORTED: '지원', UNSUPPORTED: '미지원', ADMIN: '관리자 수준', IMPORTANT: '중요 자원·민감 데이터', LIMITED: '특정 자원에 실질적 영향', MINIMAL: '권한·대상 제한 확인', PROD: '운영', DEV: '개발', TEST: '테스트', NOT_STARTED: '미조사', IN_PROGRESS: '조사 중', COMPLETED: '조사 완료', UNAVAILABLE: '조사할 수 없음' } as Record<string, string>)[value] ?? value
export const riskReviewReason = (code: string) => ({ EVIDENCE_VERIFIED: '적용 범위와 사실 근거 확인', EVIDENCE_INCOMPLETE: '근거 부족', EVIDENCE_CONTRADICTED: '다른 근거와 충돌', EVIDENCE_RETRACTED: '기존 근거 철회', ADDITIONAL_IMPACT_EVIDENCE: '추가 영향 근거 확인', PRIOR_EVIDENCE_DISPROVED: '이전 높은 등급에 대한 반증', EXPOSURE_CORRECTED: '노출 판단 교정', INCIDENT_LINK_DISPROVED: '사고 연결 오류에 대한 반증', STALE_BASELINE: '현재 기준과 다른 제안', EVIDENCE_CONFIRMED: '적용 범위와 사실 근거 확인', EVIDENCE_ACCEPTED: '적용 범위와 사실 근거 확인', INSUFFICIENT_EVIDENCE: '근거 부족', WRONG_SUBJECT: '다른 대상의 근거', WRONG_CREDENTIAL: '다른 키의 근거', CONFLICTING_EVIDENCE: '다른 근거와 충돌', DOWNGRADE_SUPPORTED: '이전 등급에 대한 반증 확인', INCIDENT_LINK_CORRECTED: '사고 연결 오류 교정', NORMAL_STORAGE_CORRECTION: '정상 보관 교정 근거 확인', ADDITIONAL_IMPACT_CONFIRMED: '추가 영향 근거 확인', IMPACT_CORRECTED: '영향 범위 교정 근거', FALSE_INCIDENT_LINK: '잘못된 사고 연결 반증', EVIDENCE_REJECTED: '자료를 근거로 수용할 수 없음' } as Record<string, string>)[code] ?? `등록된 사유 · ${code}`
export function riskInputUtc(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const timestamp = Date.parse(`${value}:00+09:00`)
  return Number.isFinite(timestamp) && new Date(timestamp + 9 * 3600000).toISOString().slice(0, 16) === value ? new Date(timestamp).toISOString() : null
}
export function validRiskEvidenceWindow(type: string, observedAt: string | null, validUntil: string | null, now = Date.now()): boolean {
  if (!observedAt || !Number.isFinite(Date.parse(observedAt)) || Date.parse(observedAt) > now + 300000 || Date.parse(observedAt) < now - 10 * 366 * 86400000) return false
  if (type === 'ABUSE_LINK' && validUntil == null) return true
  if (!validUntil || !Number.isFinite(Date.parse(validUntil))) return false
  const end = Date.parse(validUntil), observed = Date.parse(observedAt)
  return end > now && end > observed && end <= observed + (type === 'ACCESS_SCOPE' ? 6 : 24) * 3600000
}
export const riskFactText = (name: string, value: string | boolean | number) => typeof value === 'boolean' ? value ? '확인함' : ['sensitive', 'important', 'testOnly'].includes(name) ? '해당하지 않음을 확인' : '확인하지 못함' : typeof value === 'number' ? String(value) : controlledCode(value) ? riskOptionLabel(value) : '지원하지 않는 값'
export function permittedOverrideTargets(targets?: OverrideTarget[]): OverrideTarget[] {
  return (targets ?? []).filter((item) => Number.isSafeInteger(item.basisAssessmentId) && item.basisAssessmentId > 0 && (item.assessmentStatus === 'NOT_APPLICABLE' ? item.severity === null : item.assessmentStatus === 'ASSESSED' && ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(item.severity ?? '')))
}
export function overrideDeadline(maxDays: number | undefined, selected: { validUntil?: string | null; expiresAt?: string | null }[], now = Date.now()): string | null {
  if (!Number.isInteger(maxDays) || maxDays! <= 0 || maxDays! > 365 || !selected.length) return null
  let until = now + maxDays! * 86400000
  for (const evidence of selected) {
    const end = evidence.validUntil === undefined ? evidence.expiresAt : evidence.validUntil
    if (end === undefined) return null
    if (end === null) continue
    const timestamp = Date.parse(end)
    if (!Number.isFinite(timestamp)) return null
    until = Math.min(until, timestamp)
  }
  return until > now ? new Date(until).toISOString() : null
}
