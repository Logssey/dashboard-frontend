import { positiveId } from './secretScan'
export interface TaskGuidance {
  whyHereCode: string; priorityReasonCodes: string[]; evidenceObservedAt: string | null
  nextActionCode: string; target: { type: string; id: number; connectionId?: number; secretId?: number; caseId?: number; runId?: number; occurrenceId?: number }
  canExecute: boolean; blockedReasonCode: string | null; requiredRole: string | null
  waitingSince: string | null; relatedTaskId: number | null; remainingReasonCodes: string[]
}
export const actionLabels: Record<string, string> = { WAIT_FOR_REVALIDATION: '재검사 진행 보기', RESUME_REMEDIATION: '추가 조치 시작', RESTORE_SCAN: '검사 복구', SET_SCOPE_ORIGIN: '출처 설정', CONFIGURE_STORAGE_POLICY: '보관 정책 설정', REVIEW_SCOPE_CHANGE: '변경 검토', REQUEST_AUTHORIZED_ACTION: '담당자에게 요청', REVIEW_EVIDENCE: '위치 확인', OPEN_REVIEW: '위치 확인', LINK_CASE: '대응 건 연결', VIEW_CASE: '대응 보기', OPEN_CASE: '대응 보기', VIEW_DETAIL: '상세 보기', VIEW_METADATA: '메타데이터 보기', ASSIGN_INVESTIGATION: '담당자 지정', ADD_INVESTIGATION_EVIDENCE: '근거 추가', CLOSE_INVESTIGATION: '종료 근거 확인', RECORD_LOCATION_ACTION: '조치 기록', REQUEST_REVALIDATION: '재검사 요청', ASSIGN_LOCATION: '위치 담당자 지정', REVIEW_CLOSURE: '해결 근거 확인' }
export const blockerLabels: Record<string, string> = { ROLE_REQUIRED: '이 작업에 필요한 역할이 없어요.', INDEPENDENT_REVIEW_REQUIRED: '다른 보안 담당자의 검토를 기다리고 있어요.', EVIDENCE_REQUIRED: '필요한 근거를 먼저 보완하세요.', ASSIGNEE_REQUIRED: '위치 담당자를 지정하세요.', ALREADY_RUNNING: '같은 대상의 검사가 진행 중이에요.', COVERAGE_BLOCKED: '검사 범위의 실패를 먼저 확인하세요.', TASK_CLOSED: '종료된 요청이에요.' }
export const priorityLabels: Record<string, string> = { POST_ACTION_REDETECTED: '조치 후 재발견', CONFIRMED_EXPOSURE: '확인된 노출', VALID_AND_POLICY_DENIED: '유효 키 · 보관 금지', ASSIGNEE_REQUIRED: '담당 미지정', FOLLOWUP_OVERDUE: '기한 초과', REVALIDATION_REQUIRED: '재검사 필요', COVERAGE_BLOCKED: '현재 확인 불가', EVIDENCE_REQUIRED: '근거 보완' }
export const roleLabels: Record<string, string> = { SECURITY: '보안 담당자', OPERATIONS: '연결 운영 담당자', REMEDIATOR: '위치 조치 담당자' }
export function guidanceTargetPath(value: TaskGuidance): string | null {
  const t = value.target
  if (!positiveId(String(t.id))) return null
  if (t.type === 'SCOPE' && positiveId(String(t.connectionId))) return `/secrets/connections/${t.connectionId}/scopes/${t.id}`
  if (t.type === 'OCCURRENCE' && value.nextActionCode === 'VIEW_CASE' && positiveId(String(t.caseId))) return `/secrets/cases/${t.caseId}?occurrence=${t.id}`
  if (t.type === 'OCCURRENCE' && positiveId(String(t.secretId))) return value.nextActionCode === 'VIEW_METADATA' ? `/secrets/${t.secretId}?tab=info` : `/secrets/triage/${t.secretId}?occurrence=${t.id}`
  if (t.type === 'RUN') return `/secrets/history/${t.id}`
  if (t.type === 'CASE') return `/secrets/cases/${t.id}`
  if (t.type === 'INVESTIGATION') return `/secrets/triage/investigations/${t.id}`
  return null
}
