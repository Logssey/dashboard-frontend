import type { WorkbenchFilters, WorkbenchMetric } from '../api/secretSummary'
import { positiveId } from './secretScan'

export const workbenchOptions = {
  origin: { PRODUCTION: '운영 출처', TEST: '시험 출처' },
  source: { ALL: '전체 소스', GITHUB: 'GitHub', AWS: 'AWS', NOTION: 'Notion', KUBERNETES: 'Kubernetes' },
  provider: { ALL: '전체 발급자', GITHUB: 'GitHub', AWS: 'AWS', NOTION: 'Notion', KUBERNETES: 'Kubernetes' },
  environment: { ALL: '전체 환경', PROD: '운영 환경', DEV: '개발 환경', UNKNOWN: '환경 미확인' },
  assignee: { '': '전체 허용 건', ME: '내 배정 위치', UNASSIGNED: '미지정 위치' },
} as const
export const workbenchMetricLabels: Record<string, { title: string; unit: string; description: string; bucket: string }> = {
  needsDecisionLocations: { title: '확인 필요', unit: '곳', description: '노출·보관 근거 확인', bucket: 'NEEDS_DECISION' },
  ongoingCases: { title: '대응 중', unit: '건', description: '신규·조치 중인 대응', bucket: 'ACTION_REQUIRED' },
  revalidationPendingCases: { title: '재검사 대기', unit: '건', description: '조치 후 다시 확인할 건', bucket: 'ACTION_REQUIRED' },
  coverageGapScopes: { title: '검사 누락', unit: '범위', description: '실패·지연·미검사 확인', bucket: 'COVERAGE_GAPS' },
  needsCaseLinkLocations: { title: '건 연결 필요', unit: '곳', description: '확인된 노출의 대응 연결', bucket: 'NEEDS_CASE_LINK' },
  unclassifiedScopes: { title: '범위 설정', unit: '범위', description: '출처·정책·검토 대기', bucket: 'UNCLASSIFIED' },
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export function parseWorkbenchFilters(params: URLSearchParams): { filters: WorkbenchFilters; valid: boolean } {
  const values: Record<string, string> = {}
  let valid = true
  for (const key of ['origin', 'source', 'provider', 'environment', 'assignee'] as const) {
    const value = params.get(key) ?? (key === 'origin' ? 'PRODUCTION' : key === 'assignee' ? '' : 'ALL')
    if (!Object.hasOwn(workbenchOptions[key], value)) valid = false
    values[key] = value
  }
  const connectionId = positiveId(params.get('connectionId'))
  if (params.get('connectionId') && !connectionId) valid = false
  const snapshotId = params.get('snapshotId') ?? ''
  if (snapshotId && !uuid.test(snapshotId)) valid = false
  return { filters: { ...values, connectionId, snapshotId } as WorkbenchFilters, valid }
}
export function workbenchSearch(filters: WorkbenchFilters): URLSearchParams {
  const params = new URLSearchParams({ origin: filters.origin })
  for (const key of ['source', 'provider', 'environment'] as const) if (filters[key] !== 'ALL') params.set(key, filters[key])
  if (filters.assignee) params.set('assignee', filters.assignee)
  if (filters.connectionId) params.set('connectionId', String(filters.connectionId))
  if (filters.snapshotId) params.set('snapshotId', filters.snapshotId)
  return params
}
export function workbenchQueuePath(filters: WorkbenchFilters, bucket: string, snapshotId: string, stages = ''): string {
  const params = workbenchSearch({ ...filters, snapshotId })
  params.set('bucket', bucket); params.set('page', '1')
  if (stages) params.set('stages', stages)
  return `/secrets/triage?${params}`
}
export function metricQueuePath(metric: WorkbenchMetric, filters: WorkbenchFilters, snapshotId: string): string {
  const config = workbenchMetricLabels[metric.key]
  if (!config) return '/secrets'
  return workbenchQueuePath(filters, String(metric.queueFilter.bucket ?? config.bucket), snapshotId, String(metric.queueFilter.stages ?? ''))
}
export function availableMetric(metric: Pick<WorkbenchMetric, 'status' | 'value'> | null | undefined): boolean {
  return metric?.status === 'AVAILABLE' && typeof metric.value === 'number' && Number.isSafeInteger(metric.value) && metric.value >= 0
}
export function summaryReason(status: string | undefined): string {
  return status === 'NOT_AUTHORIZED' ? '이 지표를 볼 권한이 없어요.' : status === 'NOT_APPLICABLE' ? '선택한 조건에 적용하지 않아요.' : '확인 가능한 집계가 없어요.'
}
export const filterLabel = (key: string) => ({ source: '소스', provider: '발급자', environment: '환경', connectionId: '연결', assignee: '담당자' } as Record<string, string>)[key] ?? '일부 조건'
export const workbenchBuckets: Record<string, { label: string; unit: string }> = {
  NEEDS_DECISION: { label: '확인 필요', unit: '위치' },
  NEEDS_CASE_LINK: { label: '건 연결 필요', unit: '위치' },
  ACTION_REQUIRED: { label: '조치 필요', unit: '대응 건' },
  CURRENT_CASES: { label: '현재 대응 건', unit: '대응 건' },
  NORMAL_INVENTORY: { label: '인벤토리', unit: '고유 키' },
  COVERAGE_GAPS: { label: '검사 누락', unit: '승인 범위' },
  UNCLASSIFIED: { label: '출처·보관 정책 확인', unit: '승인 범위' },
}
export function safeWorkbenchReturn(query: string | null, focus?: string): string {
  const raw = new URLSearchParams(query ?? '')
  const { filters, valid } = parseWorkbenchFilters(raw)
  const bucket = raw.get('bucket') ?? 'NEEDS_DECISION'
  if (!valid || !Object.hasOwn(workbenchBuckets, bucket)) return '/secrets/triage'
  const result = workbenchSearch(filters)
  result.set('bucket', bucket)
  const page = positiveId(raw.get('page')); if (page && page <= 1_000_001) result.set('page', String(page))
  const stages = raw.get('stages') ?? ''
  if (['CURRENT_CASES', 'ACTION_REQUIRED'].includes(bucket) && stages && stages.split(',').every((stage) => ['OPEN', 'IN_PROGRESS', 'REVALIDATION_PENDING', 'RESOLVED', 'RISK_ACCEPTED'].includes(stage))) result.set('stages', stages)
  if (focus && /^[1-9]\d*(?::[1-9]\d*)?$/.test(focus)) result.set('focus', focus)
  return `/secrets/triage?${result}`
}
export function workbenchWhyLabel(code: string | undefined): string {
  return ({ NEEDS_REVIEW: '위치·보관 근거 확인 필요', ACTIVE_RESPONSE: '확인된 노출의 대응 진행', CASE_LINK_REQUIRED: '노출 확인 · 대응 연결 필요', ACCESS_KEY_METADATA: '접근키 존재 정보', APPROVED_STORAGE: '정책에 따른 보관', PROVIDER_RETIREMENT_CONFIRMED: '공급자가 확인한 사용 종료', POLICY_PENDING: '보관 정책 확인 필요' } as Record<string, string>)[code ?? ''] ?? '현재 근거 확인 필요'
}
