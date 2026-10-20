import type { ReviewContext, ReviewDecision } from '../api/secretTriage'
import { futureEvidenceDeadline, validEvidenceRef } from './secretEvidence'

export const reviewDecisionLabel: Record<ReviewDecision, string> = { ABNORMAL: '노출 확인 및 조치 요청', NORMAL: '보관 허용 확인', FALSE_POSITIVE: '선택 근거 오탐 교정', NEEDS_MORE_INFO: '추가 조사 요청' }
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
export function reviewReturnPath(params: URLSearchParams, secretId?: number | null, occurrenceId?: number | null): string {
  const query = new URLSearchParams(params.get('returnQuery') ?? '')
  const bucket = query.get('bucket') ?? 'NEEDS_DECISION'
  const origin = query.get('origin') ?? 'PRODUCTION'
  const result = new URLSearchParams()
  if (Object.hasOwn(reviewBuckets, bucket)) result.set('bucket', bucket)
  if (['PRODUCTION', 'TEST', 'UNCLASSIFIED'].includes(origin)) result.set('origin', origin)
  if (/^[1-9]\d{0,5}$/.test(query.get('page') ?? '')) result.set('page', query.get('page')!)
  if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(query.get('snapshotId') ?? '')) result.set('snapshotId', query.get('snapshotId')!)
  if (secretId && occurrenceId) result.set('focus', `${secretId}:${occurrenceId}`)
  return `/secrets/triage?${result}`
}
export function reviewDetailPath(secretId: number, occurrenceId: number, listParams: URLSearchParams): string {
  return `/secrets/triage/${secretId}?${new URLSearchParams({ occurrence: String(occurrenceId), returnQuery: listParams.toString() })}`
}
export const reviewReasonLabel = (code: string): string => ({ POLICY_PROHIBITED_LOCATION: '보관 정책에서 금지한 위치', UNAPPROVED_SOURCE_LOCATION: '비승인 저장 위치 근거 확인', AUTHORIZED_STORAGE: '승인된 보관 정책 적용', AUTHORIZED_LOCATION: '정책상 허용 위치 확인', POLICY_ALLOWED_LOCATION: '허용 정책 적용', NOT_A_CREDENTIAL: '실제 자격 증명 아님', FORMAT_FALSE_POSITIVE: '탐지 형식 오인 확인', DOCUMENTED_PLACEHOLDER: '문서용 자리표시자 근거 확인', EVIDENCE_INCOMPLETE: '판단 근거 보완 필요', REQUIRES_INVESTIGATION: '조사 후 판단 필요', INSUFFICIENT_EVIDENCE: '판단에 필요한 근거 부족' } as Record<string, string>)[code] ?? `근거 확인 (${code})`
