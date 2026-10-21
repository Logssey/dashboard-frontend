import type { ScopeClassification, ScopeChangeResult } from '@/api/secretPolicy'

export const setupReasonLabels: Record<string, string> = {
  SOURCE_UNCLASSIFIED: '출처 미설정', CLASSIFICATION_EVIDENCE_REQUIRED: '출처 근거 필요',
  POLICY_MISSING: '보관 정책 미설정', POLICY_EXPIRED: '보관 정책 만료', POLICY_RETIRED: '보관 정책 폐기',
  POLICY_NOT_YET_VALID: '정책 적용 전', POLICY_SCOPE_MISMATCH: '정책 범위 불일치',
  PENDING_REVIEW: '다른 담당자 검토 대기', CLASSIFICATION_IMPACT_PENDING: '기존 대응 건 확인 필요',
}
export const approvalReasonLabels: Record<string, string> = {
  SECURITY_REVIEW_REQUIRED: '보안 담당자 검토가 필요해요.',
  TEST_CLASSIFICATION_REQUIRES_REVIEW: '시험 출처 지정은 별도 검토를 거쳐요.',
  POLICY_BINDING_CHANGE: '보관 정책 변경은 별도 검토를 거쳐요.',
}
export function scopeSetupReasons(scope: ScopeClassification): string[] {
  return scope.setupReasonCodes ?? [scope.origin === 'UNCLASSIFIED' ? 'SOURCE_UNCLASSIFIED' : null,
    scope.policyStatus === 'POLICY_PENDING' ? 'POLICY_MISSING' : null,
    scope.pendingProposal ? 'PENDING_REVIEW' : null].filter((reason): reason is string => reason != null)
}
export function scopeChangeMessage(change: ScopeChangeResult) {
  return change.effect === 'PENDING_REVIEW' ? '검토 요청이 등록됐어요. 승인 전까지 현재 설정을 유지해요.'
    : change.effect === 'UNCHANGED' ? '이미 같은 근거로 저장된 설정이에요.' : '출처 설정이 저장됐어요.'
}
export function refreshedWorkbenchReturn(query: string | null) {
  const params = new URLSearchParams(query ?? '')
  for (const key of ['snapshotId', 'snapshot', 'page', 'focus']) params.delete(key)
  // The return destination is fixed; query values cannot create an external redirect.
  return `/secrets/triage${params.size ? `?${params}` : ''}`
}
