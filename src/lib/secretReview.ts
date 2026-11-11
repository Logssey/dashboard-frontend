import type { ReviewContext, ReviewDecision } from '../api/secretTriage'
import { futureEvidenceDeadline, validEvidenceRef } from './secretEvidence'
import { safeWorkbenchReturn } from './secretWorkbench'
import { canonicalSecretListParams } from './secretReadSelection'

export const reviewDecisionLabel: Record<ReviewDecision, string> = { ABNORMAL: '노출 확인 및 조치 요청', NORMAL: '보관 허용 확인', FALSE_POSITIVE: '선택 근거 오탐 교정', NEEDS_MORE_INFO: '추가 조사 요청' }
export const decisionUnavailableLabel = (code: string) => ({ SECURITY_ROLE_REQUIRED: '보안 담당자의 확인이 필요해요.', METADATA_NOT_EXPOSURE: '접근키 정보에는 값 노출 판정을 적용하지 않아요.', CURRENT_PRESENCE_REQUIRED: '이 위치의 현재 존재를 먼저 확인해야 해요.', CURRENT_FINDING_REQUIRED: '현재 적용 가능한 탐지 근거가 필요해요.', REAL_CREDENTIAL_CONFIRMED: '실제 키 근거가 있어 오탐으로 교정할 수 없어요.', INCOMPLETE_CREDENTIAL: '부족한 키 구성을 먼저 확인해야 해요.', SOURCE_CLASSIFICATION_REQUIRED: '현재 수집 범위의 승인 근거를 확인해야 해요.', SOURCE_COLLECTION_APPROVAL_REQUIRED: '현재 활성 연결과 승인 대상에서 수집한 근거를 확인해 주세요.', EXPLICIT_ALLOW_REQUIRED: '유효한 보관 허용 정책이 필요해요.', STORAGE_ALLOWED: '현재 적용 정책에서 보관을 허용하고 있어요.' } as Record<string, string>)[code] ?? '현재 적용 가능한 판단 근거를 확인해 주세요.'
export const correctionRecheckLabel = (code: string | null) => ({ APPROVAL_REVOKED: '기존 승인 철회', REPLACED: '후속 판단으로 대체', EVIDENCE_CHANGED: '탐지 근거 변경', APPROVAL_EXPIRED: '오탐 근거 유효 기간 만료', CONTRADICTORY_EVIDENCE: '상충하는 근거 발견' } as Record<string, string>)[code ?? ''] ?? '현재 적용되지 않는 과거 근거'
export const reviewBuckets: Record<string, { label: string; unit: string }> = { NEEDS_DECISION: { label: '확인 필요', unit: '위치' }, NEEDS_CASE_LINK: { label: '건 연결 필요', unit: '위치' }, ACTION_REQUIRED: { label: '조치 필요', unit: '대응 건' }, NORMAL_INVENTORY: { label: '인벤토리', unit: '고유 키' } }
export function matchingReviewContext(context: ReviewContext | null | undefined, secretId: number | null, occurrenceId: number | null): context is ReviewContext {
  return context != null && context.credentialSetId === secretId && context.occurrenceId === occurrenceId && Number.isSafeInteger(context.scopeId) && context.scopeId > 0 && Number.isSafeInteger(context.connectionId) && context.connectionId > 0
}
export function currentReviewVersions(context: ReviewContext): boolean {
  return Number.isSafeInteger(context.versions?.occurrence) && context.versions.occurrence >= 0 && Number.isSafeInteger(context.versions?.scope) && context.versions.scope >= 0 && (context.versions.policy == null || (Number.isSafeInteger(context.versions.policy) && context.versions.policy >= 0))
}
export function allowedReviewDecisions(context: ReviewContext): ReviewDecision[] {
  return (context.allowedDecisions ?? []).filter((decision) => Object.hasOwn(reviewDecisionLabel, decision)).filter((decision) => !['ABNORMAL', 'NORMAL'].includes(decision) || (context.componentState === 'CONFIRMED' && context.presence === 'PRESENT')).filter((decision) => decision !== 'NORMAL' || (context.storagePolicy?.result === 'ALLOWED' && context.versions?.policy != null))
}
export interface ReviewInput {
  decision: ReviewDecision | ''
  reasonCode: string
  findingId: number | null
  evidenceRef: string
  missingReasonCode: string
  followUpOwnerUserId: number | null
  dueAt: string | null
}
export function reviewInputErrors(context: ReviewContext, input: ReviewInput, now = Date.now()): string[] {
  const errors: string[] = []
  if (!currentReviewVersions(context)) errors.push('VERSIONS_REQUIRED')
  if (!input.decision || !allowedReviewDecisions(context).includes(input.decision)) errors.push('DECISION_NOT_ALLOWED')
  if (!context.allowedReasonCodes?.[input.decision]?.includes(input.reasonCode)) errors.push('REASON_REQUIRED')
  if (!validEvidenceRef(input.evidenceRef)) errors.push('SAFE_REFERENCE_REQUIRED')
  if (input.decision !== 'NEEDS_MORE_INFO' && !context.findings?.some((entry) => entry.findingId === input.findingId && entry.valid)) errors.push('VALID_FINDING_REQUIRED')
  if (input.decision === 'NEEDS_MORE_INFO') {
    if (!context.allowedMissingReasonCodes?.includes(input.missingReasonCode)) errors.push('MISSING_REASON_REQUIRED')
    if (!context.eligibleInvestigationAssignees?.some((entry) => entry.userId === input.followUpOwnerUserId)) errors.push('INVESTIGATION_OWNER_REQUIRED')
    if (!futureEvidenceDeadline(input.dueAt, now)) errors.push('FUTURE_DEADLINE_REQUIRED')
  }
  return errors
}
export function reviewReturnPath(params: URLSearchParams, secretId?: number | null, occurrenceId?: number | null, actualOrigin?: string): string {
  const directOrigin = ['PRODUCTION', 'TEST'].includes(actualOrigin ?? '') ? actualOrigin : 'PRODUCTION'
  return safeWorkbenchReturn(params.get('returnQuery') || `origin=${directOrigin}&bucket=NEEDS_DECISION`, secretId && occurrenceId ? `${secretId}:${occurrenceId}` : undefined)
}
export function reviewDetailPath(secretId: number, occurrenceId: number, listParams: URLSearchParams): string {
  return `/secrets/triage/${secretId}?${new URLSearchParams({ occurrence: String(occurrenceId), returnQuery: canonicalSecretListParams(listParams).toString() })}`
}
export const reviewReasonLabel = (code: string): string => ({ POLICY_PROHIBITED_LOCATION: '보관 정책에서 금지한 위치', UNAPPROVED_SOURCE_LOCATION: '비승인 저장 위치 근거 확인', AUTHORIZED_STORAGE: '승인된 보관 정책 적용', AUTHORIZED_LOCATION: '정책상 허용 위치 확인', POLICY_ALLOWED_LOCATION: '허용 정책 적용', NOT_A_CREDENTIAL: '실제 자격 증명 아님', FORMAT_FALSE_POSITIVE: '탐지 형식 오인 확인', DOCUMENTED_PLACEHOLDER: '문서용 자리표시자 근거 확인', EVIDENCE_INCOMPLETE: '판단 근거 보완 필요', REQUIRES_INVESTIGATION: '조사 후 판단 필요', INSUFFICIENT_EVIDENCE: '판단에 필요한 근거 부족' } as Record<string, string>)[code] ?? `근거 확인 (${code})`
