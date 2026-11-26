import type { AssessmentStatus, RiskInput } from '../api/secretRisk'

export const riskReasonLabels: Record<string, string> = {
  EXPOSURE_UNKNOWN: '보관·노출 판단 근거가 필요해요.', EXPOSURE_RANGE_UNKNOWN: '읽을 수 있는 대상과 범위를 확인해야 해요.', CREDENTIAL_UNCONFIRMED: '자격 증명의 구성·동일성 확인이 필요해요.',
  IMPACT_UNKNOWN: '이 키의 실제 권한·대상·제한을 확인해야 해요.', IDENTITY_BINDING_UNRESOLVED: '발견된 키와 권한 주체의 연결을 확인해야 해요.',
  PERMISSION_MAPPING_INCOMPLETE: '권한 해석이 일부만 확인됐어요.', TARGET_COVERAGE_INCOMPLETE: '접근 가능한 전체 대상은 확인되지 않았어요.',
  ASSET_CLASSIFICATION_UNKNOWN: '대상 자원의 운영·민감도 분류가 필요해요.', UNSUPPORTED_IMPACT_ANALYSIS: '이 유형의 영향 자동 분석은 지원하지 않아요.',
  STALE_EVIDENCE: '근거의 확인 기한이 지났어요.', TIME_UNCERTAIN: '근거의 관측 시각을 확인해야 해요.', CONFLICTING_EVIDENCE: '같은 사실에 대한 근거가 서로 충돌해요.',
  EXPOSURE_INCIDENT_CONFLICT: '정상 보관 주장과 연결된 사고 근거가 충돌해 재검토가 필요해요.', DOWNGRADE_REVIEW_REQUIRED: '기존 높은 등급을 낮추기 전에 반증과 독립 검토가 필요해요.',
  STALE_BASELINE: '평가 기준이 바뀌어 최신 근거로 다시 평가해야 해요.', METADATA_ONLY: '메타데이터만 확인해 위험도 평가 대상이 아니에요.',
  OVERRIDE_EXPIRED_REVIEW_REQUIRED: '수동 판단의 기간이 끝났어요. 기존 높은 등급의 하향 검토는 별도로 필요해요.', INVESTIGATE_CONFLICT: '충돌하는 근거 재검토',
  ABUSE_LINKAGE_UNVERIFIED: '제출한 사고 자료를 실제 키·노출에 연결할 자동 확인을 지원하지 않아요. 자료 수용만으로 악용 확인이나 CRITICAL이 되지 않아요.',
  REVIEW_EVIDENCE: '부족한 근거 확인', SUBMIT_EVIDENCE: '자료 보완', REQUEST_ASSESSMENT: '현재 근거로 다시 평가', REVIEW_OVERRIDE: '수동 판단 검토',
  CONFIRMED_INCIDENT: '해당 노출에 연결된 중대한 악용이 확인됐어요.',
  INITIAL_ASSESSMENT_REQUIRED: '이 위치는 아직 위험도를 평가하지 않았어요.',
  EVIDENCE_APPLICABILITY_UNCONFIRMED: '발견 당시에도 적용되는 사실인지 확인이 필요해요.',
  EVIDENCE_APPLICABILITY_MISMATCH: '자료의 적용 기간에 원문이 관찰된 시각이 포함되지 않아요.',
  SOURCE_REVISION_UNCONFIRMED: '자료와 원문 버전의 연결을 확인해야 해요.',
  ACCESS_COEXISTENCE_UNCONFIRMED: '저장소 공개와 키 원문이 같은 시점에 함께 있었는지 확인해야 해요.',
  EXPOSURE_REQUIRED: '이 위치에서 키 원문 보관·공유가 허용되는지 확인하세요.',
  EXPOSURERANGE_REQUIRED: '원문을 실제로 읽을 수 있는 범위를 확인하세요.',
  CREDENTIAL_REQUIRED: '필수 키 구성이 같은 자격 증명으로 연결되는지 확인하세요.',
  IMPACT_REQUIRED: '키의 실제 권한과 영향을 받는 자산을 확인하세요.',
  VALIDITY_REQUIRED: '공급자에서 현재 인증 가능한지 별도로 확인하세요.',
  CHECK_PERIOD_EXCEEDED: '이전 인증 확인의 6시간 기한이 지났어요. 현재 인증을 다시 확인하세요.',
  POST_ACTION_VALIDATION_REQUIRED: '키 조치 이후의 인증 확인이 필요해요. 이전 결과는 과거 기록으로 보존해요.',
  NO_CURRENT_CONCLUSIVE_RESULT: '현재 적용할 인증 결론이 없어요. 최신 시도의 이유를 확인하세요.',
  ASSESSMENT_REFRESH_REQUIRED: '현재 근거가 이전 평가 기준과 달라요. 저장된 근거로 다시 평가하세요.',
}
export const riskReason = (code: string) => Object.hasOwn(riskReasonLabels, code) ? riskReasonLabels[code] : '판단에 필요한 근거 또는 적용 조건을 확인해 주세요.'
export function severityText(severity?: string | null, status?: AssessmentStatus | string): string {
  if (status === 'NOT_APPLICABLE') return '위험도 적용 대상 아님'
  return ({ CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' } as Record<string, string>)[severity ?? ''] ?? '미평가'
}
export const riskAxisLabels: Record<string, string> = { exposure: '보관·공유 적정성', exposureRange: '접근 가능 범위', credential: '키 구성 확인', impact: '권한과 자원 영향', abuse: '중대한 사고 근거', validity: '현재 인증 상태' }
const axisValues: Record<string, Record<string, string>> = {
  exposure: { ABNORMAL: '노출 확인', NORMAL: '정상 보관', UNKNOWN: '판단 근거 부족' }, exposureRange: { BROAD: '광범위', BOUNDED: '제한된 접근 대상', UNKNOWN: '접근 대상 확인 필요' },
  credential: { CONFIRMED: '형식·구성 확인', CANDIDATE: '구성·동일성 확인 필요' }, impact: { ADMIN: '관리자 수준', IMPORTANT: '중요 자원·데이터', LIMITED: '특정 자원에 실질적 영향', MINIMAL: '권한·대상 제한 확인', UNKNOWN: '권한·대상 확인 필요' },
  abuse: { CONFIRMED: '연결된 중대한 악용 확인', NOT_CONFIRMED: '확인된 악용 근거 없음 · 미조사일 수 있음' }, validity: { VALID: '공급자 인증 확인', INVALID: '사용 불가 · 원인은 별도 확인', UNKNOWN: '인증 확인 불가', UNCHECKED: '인증 미검증' },
}
export const riskInputValue = (input: RiskInput | undefined) => typeof input === 'string' ? input : input?.value ?? null
export const riskAxisValue = (axis: string, input: RiskInput | undefined) => axisValues[axis]?.[riskInputValue(input) ?? ''] ?? '이 규칙에 사용한 확인 값 없음'
export const verificationLabel = (level: string) => ({ PROVIDER_OBSERVED: '공급자 자동 관측', ASSET_CLASSIFIED: '자산 분류', MANUAL_SUBMITTED: '담당자 제출 · 수용 대기', MANUAL_ACCEPTED: '담당자 확인' } as Record<string, string>)[level] ?? '확인 수준 확인 필요'
export const riskEvidenceLabels: Record<string, string> = { ACCESS_SCOPE: '접근 대상·노출 범위', PERMISSION_MAPPING: '권한·대상·제한', ASSET_CLASSIFICATION: '자산 중요도', ABUSE_LINK: '사고 연관 근거', ABUSE_COVERAGE: '악용 조사 범위' }
export const riskRuleLabels: Record<string, string> = { R00: '유효한 보관 허용 근거가 확인된 위치예요.', R01: '해당 노출에 연결된 중대한 비인가 사용과 영향이 확인됐어요.', R02: '넓게 노출된 관리자 수준 자격 증명이에요.', R03: '제한된 대상에게 노출된 운영 관리자 자격 증명이에요.', R04: '운영·민감 데이터 등 중요 대상에 영향을 줄 수 있어요.', R05: '특정 자원에 대한 실질적인 접근·변경 가능성이 확인됐어요.', R06: '권한·대상이 제한된 자격 증명이 넓게 노출됐어요.', R07: '권한·대상과 노출 범위가 제한됨을 확인했어요.', R99: '필요한 근거가 부족하거나 충돌해 등급을 확정하지 않았어요.' }
export const assessmentFailureReason = (code?: string | null) => ({ STALE_BASELINE: '근거 기준이 바뀌어 이 요청을 현재 판단에 적용하지 않았어요.', ASSESSMENT_LEASE_EXPIRED: '평가 작업의 실행 권한이 만료됐어요. 현재 자료를 다시 조회한 뒤 재요청하세요.', ASSESSMENT_PROCESSING_FAILED: '저장된 자료 평가를 완료하지 못했어요. 현재 판단은 변경하지 않았어요.', NOT_AUTHORIZED: '평가를 요청할 현재 권한이 없어요.' } as Record<string, string>)[code ?? ''] ?? '평가를 완료하지 못한 이유를 확인할 수 없어요. 현재 판단을 다시 조회한 뒤 재요청하세요.'
export function riskEvidenceState(level: string, status?: string): string {
  if (status === 'REJECTED') return '자료 거절 · 현재 근거로 사용하지 않음'
  if (status === 'RETRACTED') return '자료 철회 · 현재 근거로 사용하지 않음'
  if (status === 'EXPIRED') return '자료 적용 기한 만료'
  if (status === 'PENDING_OR_REJECTED') return '수용 여부 확인 필요 · 현재 판단과 구분'
  if (status === 'PENDING') return '자료 제출 · 보안 담당자 수용 대기'
  return verificationLabel(level)
}
