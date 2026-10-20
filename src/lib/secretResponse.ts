import type { CaseFilters, SecretCaseDetail, SecretCaseOccurrence } from '../api/secretCases'
import { positiveId } from './secretScan'

export const caseStageLabels: Record<string, string> = { OPEN: '신규 및 분석', IN_PROGRESS: '조치 중', REVALIDATION_PENDING: '재검사 대기', RESOLVED: '해결' }
export const caseActionLabels = { ROTATED: '키 교체', REVOKED: '키 폐기', REMOVED_FROM_SOURCE: '노출 위치에서 제거', PERMISSION_REDUCED: '권한 축소' } as const
export const caseReasonLabels = { INITIAL_ASSIGNMENT: '최초 지정', OWNERSHIP_CHANGE: '담당자 변경', TEAM_TRANSFER: '담당 팀 변경', UNASSIGNED: '지정 해제', OTHER: '운영 사유' } as const
export const checklistLabels = { IDENTIFY_OWNER: '소유자 확인', ROTATE_OR_REVOKE: '키 교체·폐기 확인', REMOVE_EXPOSURE: '노출 위치 정리', CHECK_ACCESS_LOGS: '접근 기록 확인' } as const
export function parseCaseFilters(params: URLSearchParams): { filters: CaseFilters; valid: boolean } {
  const origin = params.get('origin') ?? 'PRODUCTION', scope = params.get('scope') ?? 'currentCases'
  const stages = params.get('stages') ?? '', assignmentStatus = params.get('assignmentStatus') ?? '', assignee = params.get('assignee') ?? ''
  const rawPage = params.get('page') ?? '1'
  const valid = ['PRODUCTION', 'TEST'].includes(origin) && ['currentCases', 'history'].includes(scope)
    && (!stages || stages.split(',').every((stage) => Object.hasOwn(caseStageLabels, stage)))
    && ['', 'UNASSIGNED', 'TEAM_ONLY', 'PERSONAL'].includes(assignmentStatus)
    && ['', 'ME', 'UNASSIGNED'].includes(assignee) && positiveId(rawPage) !== null && Number(rawPage) <= 1_000_001
  return { valid, filters: { origin, scope, stages, assignmentStatus, assignee, page: (positiveId(rawPage) ?? 1) - 1, size: 20 } as CaseFilters }
}
export function caseSearch(filters: CaseFilters): URLSearchParams {
  const params = new URLSearchParams({ origin: filters.origin, scope: filters.scope, page: String(filters.page + 1) })
  for (const key of ['stages', 'assignmentStatus', 'assignee'] as const) if (filters[key]) params.set(key, filters[key])
  return params
}
export function caseDetailPath(caseId: number, filters?: CaseFilters, occurrenceId?: number): string {
  const params = new URLSearchParams()
  if (filters) params.set('returnQuery', caseSearch(filters).toString())
  if (occurrenceId) params.set('occurrence', String(occurrenceId))
  return `/secrets/cases/${caseId}${params.size ? `?${params}` : ''}`
}
export function caseReturnPath(params: URLSearchParams, caseId: number | null): string {
  const parsed = parseCaseFilters(new URLSearchParams(params.get('returnQuery') ?? ''))
  const search = caseSearch(parsed.valid ? parsed.filters : parseCaseFilters(new URLSearchParams()).filters)
  if (caseId) search.set('focus', String(caseId))
  return `/secrets/cases?${search}`
}
export const caseAssigneeLabel = (name?: string | null, team?: string | null, id?: number | null) => name ? `${name}${team ? ` · ${team}` : ''}` : id ? `사용자 #${id}${team ? ` · ${team}` : ''}` : team ? `${team} · 팀 배정` : '담당 미지정'
export const validActionReference = (ref: string) => /^(TICKET|CHANGE):[A-Z]{2,10}-[1-9][0-9]{0,9}$/.test(ref)
export function validActionTime(value: string | null, now = Date.now()): boolean {
  const timestamp = value ? Date.parse(value) : NaN
  return Number.isFinite(timestamp) && timestamp >= now - 30 * 86400000 && timestamp <= now + 5 * 60000
}
export function locationNextAction(location: SecretCaseOccurrence): string {
  if (location.responseStatus === 'RESOLVED') return '해결 이력 확인'
  if (!location.assignedTeam && !location.assignedUserId) return '담당자 지정'
  if (location.canResume) return '추가 조치'
  if (location.canRequestRevalidation) return '재검사 요청'
  if (location.responseStatus === 'REVALIDATION_PENDING') return '재검사 결과 확인'
  if (location.canCompleteActions) return '조치 기록 마침'
  return '외부 조치·기록'
}
export function responseNextAction(detail: SecretCaseDetail): string {
  if (!detail.isCurrent || detail.stage === 'RESOLVED') return '대응 이력 확인'
  if (detail.occurrences.some((o) => !o.assignedTeam && !o.assignedUserId)) return '위치별 담당자 지정'
  if (detail.occurrences.some((o) => o.responseStatus === 'OPEN' || o.responseStatus === 'IN_PROGRESS')) return '위치별 외부 조치'
  return '재검사·해결 근거 확인'
}
