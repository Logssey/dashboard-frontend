import type { PriorityFinding } from '../api/types'

/** Secret IDs belong to their own namespace; never treat one as a detection event. */
export function priorityFindingKey(item: PriorityFinding): string {
  return `${item.sourceType ?? 'DETECTION_EVENT'}:${item.sourceId ?? item.eventId}`
}
export function secretPriorityPath(item: PriorityFinding): string | null {
  if (item.sourceType !== 'SECRET_CASE' || !Number.isSafeInteger(item.sourceId) || item.sourceId! <= 0 || !item.detailPath) return null
  const expected = `/secrets/cases/${item.sourceId}?origin=PRODUCTION`
  return item.detailPath === expected ? expected : null
}
/** 보안 기능의 묶은 위험: 그 기능 화면으로 (앱 안 경로만) */
export function partPriorityPath(item: PriorityFinding): string | null {
  if (item.sourceType !== 'PART_FINDING' || !item.detailPath) return null
  return item.detailPath.startsWith('/') && !item.detailPath.startsWith('//') ? item.detailPath : null
}
export function prioritySeverity(item: PriorityFinding): { label: string; tone: string } {
  const values = { CRITICAL: { label: 'Critical', tone: 'critical' }, HIGH: { label: 'High', tone: 'high' }, MEDIUM: { label: 'Medium', tone: 'medium' }, LOW: { label: 'Low', tone: '' } }
  if (item.severity && Object.hasOwn(values, item.severity)) return values[item.severity as keyof typeof values]
  return { label: item.assessmentStatus === 'NOT_APPLICABLE' ? '평가 대상 외' : '미평가', tone: '' }
}
export function priorityEnvironment(value: PriorityFinding['environment']): string {
  return ({ PROD: '운영', DEV: '개발', UNKNOWN: '미확인', MIXED: '여러 환경' })[value] ?? '미확인'
}
export function priorityStatus(item: PriorityFinding): string {
  if (item.sourceType === 'PART_FINDING') return '확인 필요'
  if (item.sourceType === 'SECRET_CASE') return ({ OPEN: '신규 대응', IN_PROGRESS: '조치 중', REVALIDATION_PENDING: '재검사 대기', RESOLVED: '해결', RISK_ACCEPTED: '위험 수용' })[item.actionStatus] ?? '대응 대상'
  return item.reviewStatus === 'REVIEWED' ? '검토 완료' : item.reviewStatus === 'UNREVIEWED' ? '미검토' : '미확인'
}
