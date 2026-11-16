import type { ClosureCheck, ClosureChecks } from '../api/secretClosure'
export function closureBlockerGroups(checks: ClosureCheck[]) {
  const groups = new Map<string, { code: string; reasonCode: string; occurrenceIds: number[]; checkCount: number }>()
  for (const check of checks) {
    if (check.status === 'PASSED') continue
    const key = check.reasonCode || check.code
    const group = groups.get(key) ?? { code: check.code, reasonCode: check.reasonCode, occurrenceIds: [], checkCount: 0 }
    group.checkCount += 1
    if (check.occurrenceId && !group.occurrenceIds.includes(check.occurrenceId)) group.occurrenceIds.push(check.occurrenceId)
    groups.set(key, group)
  }
  return [...groups.values()]
}
export function closureBlockerTarget(code: string): { tab: string; check?: string; label: string } | null {
  if (['LOCATION_ABSENCE', 'LOCATION_ABSENCE_CHECK', 'REQUIRED_SCOPE', 'COVERAGE', 'COVERAGE_CHECK'].includes(code)) return { tab: 'verification', check: 'locations', label: '위치별 검사 확인' }
  if (['CREDENTIAL_LIFECYCLE', 'CREDENTIAL_LIFECYCLE_CHECK'].includes(code)) return { tab: 'verification', check: 'lifecycle', label: '폐기·교체 근거 연결' }
  if (['REQUIRED_LOCATIONS', 'POSITION_REQUIRED'].includes(code)) return { tab: 'locations', label: '조치 위치 확인' }
  return null
}
export const coverageLevelLabels: Record<string, string> = { FULL: '승인 범위 확인', LIMITED: '제한 확인', SIMULATION: '합성 표본 종료' }
export const closureCheckLabels: Record<string, string> = {
  POSITION_REQUIRED: '필수 대응 위치', POSITION_UNLINKED: '미연결 노출 위치', POSITION_UNASSESSED: '현재 미판정 위치', POSITION_AUTHORIZED: '보관 허용·메타데이터', POSITION_HISTORICAL: '과거 발견 근거', REQUIRED_SCOPE: '필수 위치의 검사 범위', ASSESSMENT_BASIS: '위치 판정의 현재 근거', CROSS_ENVIRONMENT_ALERTS: '자격증명 여부 확인', CASE_ACTIVE: '현재 대응 상태', REQUIRED_LOCATIONS: '필수 위치 근거', COMPLETE_AUTHORIZATION: '전체 범위 보안 권한',
  LOCATION_ABSENCE: '조치 후 위치 부재', LOCATION_ABSENCE_CHECK: '조치 후 위치 부재', CREDENTIAL_LIFECYCLE: '키 폐기·교체', CREDENTIAL_LIFECYCLE_CHECK: '키 폐기·교체', COVERAGE: '현재 검사 범위', COVERAGE_CHECK: '현재 검사 범위', CURRENT_CASE: '현재 대응 범위', CURRENT_UNASSESSED: '현재 미판정 위치', UNLINKED_ABNORMAL: '미연결 노출 위치', FULL_SECURITY_REQUIRED: '전체 범위의 보안 권한',
}
export const closureStatusLabels: Record<string, string> = { PASSED: '충족', BLOCKED: '조건 미충족', UNKNOWN: '확인 필요' }
export const closureReasonLabels: Record<string, string> = {
  METADATA_NOT_EXPOSURE: '접근키 존재 정보는 값 노출이 아니에요.', ALL_FINDINGS_CORRECTED: '현재 탐지 근거가 모두 오탐 교정됐어요.', CURRENT_POLICY_ALLOWED_STORAGE: '현재 유효한 보관 허용 정책이 적용돼요.', COMPARABLE_HISTORICAL_MISSING: '과거 위치의 비교 가능한 미발견 이력이에요.', UNLINKED_ABNORMAL: '확인된 노출을 현재 대응 건에 먼저 연결하세요.', LOCATION_STILL_PRESENT: '현재 위치에 키가 남아 있어요.', POST_ACTION_COMPARISON_REQUIRED: '조치 이후 동일한 조건의 재검사가 필요해요.', UNASSESSED_CURRENT_LOCATION: '현재 존재하거나 확인 불가인 위치의 판단이 필요해요.', CURRENT_REQUIRED_SCOPE_CHECKED: '필수 위치의 현재 승인 범위 검사 근거가 있어요.', POLICY_OR_SOURCE_REASSESSMENT_REQUIRED: '보관 정책·출처가 바뀌어 판단 근거를 다시 확인해야 해요.', NO_LOCATION_EVIDENCE: '판단할 위치 근거가 없어요.', RELATED_ALERTS_REVIEWED: '미해결 실키 경고가 없어요.', CROSS_ENVIRONMENT_ALERT_OPEN: '자격증명 여부 확인 항목을 먼저 확인하세요.', SYNTHETIC_FIXTURE_RETIRED: '입증된 합성 표본의 사용 종료 근거예요.', EXTERNAL_RETIREMENT_INDEPENDENTLY_APPROVED: '독립 보안 담당자가 수동 사용 종료 근거를 승인했어요.', CURRENT_LIFECYCLE_EVIDENCE_REQUIRED: '현재 적용할 수 있는 키 사용 종료 근거가 필요해요.', CASE_NOT_ACTIVE: '현재 처리 중인 대응 건이 아니에요.', SYNTHETIC_TEST_ONLY: '입증된 합성 표본 확인에만 해당해요.', PROVIDER_RETIREMENT_NOT_CLAIMED: '공급자 키 폐기를 확인한 결과는 아니에요.', APPROVED_SUPPORTED_SCOPES_ONLY: '승인된 지원 범위에 한정한 확인이에요.', MISUSE_NOT_ASSESSED: '과거 악용·사용 흔적의 부재를 판단한 결과는 아니에요.', SOURCE_CLASSIFICATION_CHANGED: '위치의 출처 분류가 바뀌었어요.', REQUIRED_SCOPE_UNAVAILABLE: '필수 위치의 연결·승인 범위를 확인하세요.', REQUIRED_SCOPE_INCOMPLETE: '필수 위치의 최근 검사가 완전히 끝나지 않았어요.', REQUIRED_SCOPE_OVERDUE: '필수 범위의 검사 예정 시각이 지났어요.', AUTHORIZED_SECURITY_COORDINATOR_REQUIRED: '전체 필수 위치에 권한 있는 보안 담당자의 확인이 필요해요.',
  LEGACY_VERIFICATION_EVIDENCE_UNAVAILABLE: '과거 해결의 검증 근거가 남아 있지 않아요.', POST_ACTION_EVIDENCE_REQUIRED: '조치 이후의 비교 가능한 재검사가 필요해요.', COMPARABLE_POST_ACTION_MISSING: '조치 이후 동일 범위에서 미발견을 확인했어요.', LIFECYCLE_EVIDENCE_REQUIRED: '키 폐기·교체 근거가 필요해요.', PROVIDER_RETIREMENT_NOT_VERIFIED: '공급자 폐기 상태는 자동 확인하지 못했어요.', EXTERNAL_RECORD_APPROVED: '독립 검토자가 수동 근거를 승인했어요.', PROVIDER_RETIREMENT_CONFIRMED: '공급자 근거로 사용 종료를 확인했어요.', CURRENT_SCOPE_CHECK_REQUIRED: '현재 승인 버전의 검사 범위를 확인하세요.', CURRENT_SCOPE_OBSERVED: '현재 승인 범위의 읽기 근거를 확인했어요.', FULL_SECURITY_REQUIRED: '전체 대응 범위에 권한 있는 보안 담당자의 확인이 필요해요.', UNASSESSED_CURRENT_LOCATIONS: '현재 미판정 위치를 먼저 확인하세요.', UNLINKED_ABNORMAL_LOCATIONS: '미연결 노출 위치를 대응 건에 연결하세요.', GIT_HISTORY_NOT_SCANNED: 'Git 과거 이력은 확인 범위에 포함되지 않아요.', OTHER_SOURCES_NOT_SCANNED: '다른 원천의 안전을 확인한 결과는 아니에요.', SYNTHETIC_FIXTURE_REMOVAL: '입증된 합성 표본의 사용 종료를 확인해요.', BUSINESS_CONTINUITY: '업무 연속성', TEMPORARY_DEPENDENCY: '일시적인 서비스 의존', COMPENSATING_CONTROL: '보완 통제 적용', RISK_REDUCED: '위험 감소', APPROVAL_WITHDRAWN: '승인 철회', SCOPE_CHANGED: '적용 범위 변경', FALSE_POSITIVE: '오탐 교정에 따른 종료', OUT_OF_SCOPE: '관리 범위 이관에 따른 종료', PROGRAM_SCOPE_ENDED: '관리 범위 종료', OWNER_TRANSFER: '소유·관리 책임 이관', TRANSFER_AND_ACCEPTANCE_CONFIRMED: '이관과 인수 근거 확인', INSUFFICIENT_EVIDENCE: '근거 부족', WRONG_SCOPE: '적용 범위 불일치',
}
export const closureReasonLabel = (code: string | null | undefined) => closureReasonLabels[code ?? ''] ?? '적용 근거와 현재 범위를 확인해 주세요.'
export function eligibleResolution(checks: ClosureChecks, caseVersion: number, level: string, confirmed: boolean): boolean {
  const option = checks.coverageOptions.find((entry) => entry.level === level)
  return confirmed && checks.canResolve && checks.capabilities?.canResolve === true && checks.caseVersion === caseVersion && !!checks.closureCheckVersion && Object.hasOwn(coverageLevelLabels, level) && checks.allowedCoverageLevels.includes(level) && Array.isArray(option?.evidenceIds) && option.evidenceIds.every((id) => Number.isSafeInteger(id) && id > 0)
}
export function resolutionEvidenceIds(checks: ClosureChecks, level: string): number[] {
  return [...new Set((checks.coverageOptions.find((entry) => entry.level === level)?.evidenceIds ?? []).filter((id) => Number.isSafeInteger(id) && id > 0))]
}
export function validRiskDeadline(value: string | null, maxDays: number, now = Date.now()): boolean {
  const timestamp = value ? Date.parse(value) : NaN
  return Number.isFinite(timestamp) && Number.isSafeInteger(maxDays) && maxDays > 0 && timestamp > now && timestamp <= now + maxDays * 86400000
}
