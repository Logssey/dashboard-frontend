import type { InventoryFilter, LocationFilter } from '../api/secrets'
import { positiveId } from './secretScan'
import { safeWorkbenchReturn } from './secretWorkbench'
import { canonicalSecretListParams, canonicalSecretLocationParams, safeSecretSearch, validSecretSearch } from './secretReadSelection'

export const inventoryOptions = {
  origin: { ALL: '전체', PRODUCTION: '운영', TEST: '검증 자료', UNCLASSIFIED: '미분류' },
  contentKind: { VALUE_FINDINGS: '값 후보', METADATA: '메타데이터', ALL: '전체 기록' },
  workBucket: { ALL: '전체 업무', NEEDS_DECISION: '확인 필요', ACTION_REQUIRED: '조치 필요', NORMAL_INVENTORY: '보관 허용', NEEDS_CASE_LINK: '건 연결 필요', EXCLUDED_HISTORY: '오탐 교정 이력' },
  source: { ALL: '전체 소스', GITHUB: 'GitHub', AWS: 'AWS', NOTION: 'Notion', KUBERNETES: 'Kubernetes' },
  provider: { ALL: '전체 발급자', GITHUB: 'GitHub', AWS: 'AWS', NOTION: 'Notion', KUBERNETES: 'Kubernetes' },
  environment: { ALL: '전체 환경', PROD: '운영', DEV: '개발', UNKNOWN: '환경 미확인' },
  componentState: { ALL: '전체 구성', CONFIRMED: '구성 확인', CANDIDATE: '일부 구성', METADATA_ONLY: '메타데이터' },
  validity: { ALL: '전체 검증', VALID: '유효', INVALID: '무효', UNKNOWN: '확인 불가', UNCHECKED: '미검증' },
  severity: { ALL: '전체 위험도', UNASSESSED: '미평가', LOW: '낮음', MEDIUM: '보통', HIGH: '높음', CRITICAL: '심각' },
} as const
const defaults = { origin: 'ALL', contentKind: 'ALL', workBucket: 'ALL', source: 'ALL', provider: 'ALL', environment: 'ALL', componentState: 'ALL', validity: 'ALL', severity: 'ALL' } as const
export function parseInventoryFilters(params: URLSearchParams): { filters: InventoryFilter; errors: string[] } {
  params = canonicalSecretListParams(params)
  const errors: string[] = []
  const parsed: Record<string, string> = {}
  for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
    const value = params.get(key) ?? (key === 'provider' ? params.get('issuer') : null) ?? defaults[key]
    if (!Object.hasOwn(inventoryOptions[key], value)) errors.push(`${key} 조회 조건을 확인해 주세요.`)
    parsed[key] = Object.hasOwn(inventoryOptions[key], value) ? value : defaults[key]
  }
  const page = positiveId(params.get('page')) ?? 1
  const snapshotId = params.get('snapshotId') ?? ''
  const runId = positiveId(params.get('runId'))
  if (params.has('runId') && !runId) errors.push('실행 결과 조회 주소를 확인해 주세요.')
  if (snapshotId && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(snapshotId)) errors.push('조회 기준을 새로고침해 주세요.')
  const q = (params.get('q') ?? '').trim()
  if (!validSecretSearch(q)) errors.push('검색어는 100자 이내로 입력해 주세요.')
  return { filters: { ...parsed, issuer: 'ALL', page: page - 1, size: 20, snapshotId, runId, ...(q ? { q } : {}) } as InventoryFilter, errors }
}
export function inventorySearch(filter: InventoryFilter): URLSearchParams {
  const params = new URLSearchParams({ page: String(filter.page + 1), origin: filter.origin })
  for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) if (filter[key] !== defaults[key]) params.set(key, filter[key])
  if (filter.snapshotId) params.set('snapshotId', filter.snapshotId)
  if (filter.runId) params.set('runId', String(filter.runId))
  if (filter.q) params.set('q', safeSecretSearch(filter.q))
  return params
}
export function keyDetailPath(id: number, filter?: InventoryFilter): string {
  if (!filter) return `/secrets/${id}`
  const params = inventorySearch(filter)
  const result = new URLSearchParams({ origin: filter.origin, return: 'inventory', returnQuery: params.toString() })
  return `/secrets/${id}?${result}`
}
export function inventoryReturnPath(params: URLSearchParams, id: number | null): string {
  const fallback = '/secrets/findings'
  if (params.get('return') === 'run-findings') {
    const runId = positiveId(params.get('runId')), page = positiveId(params.get('returnPage'))
    if (runId) return `/secrets/history/${runId}/findings${page ? `?page=${page}` : ''}`
  }
  if (params.get('return') === 'workbench') return safeWorkbenchReturn(params.get('returnQuery'), id ? String(id) : undefined)
  if (params.get('return') !== 'inventory') return fallback
  const parsed = parseInventoryFilters(new URLSearchParams(params.get('returnQuery') ?? ''))
  if (parsed.errors.length) return fallback
  const safe = inventorySearch(parsed.filters)
  if (id) safe.set('focus', String(id))
  return `/secrets/findings?${safe}`
}
export const inventorySubtypeLabel = (code: string | undefined): string => ({ AUTHORIZED_STORAGE: '승인된 보관', METADATA_ONLY: '메타데이터만 확인', RETIRED_HISTORY: '공급자 확인 폐기 이력', MANAGED_LOCATIONS: '보관·폐기 확인' } as Record<string, string>)[code ?? ''] ?? '분류 확인 필요'
export const whyLabel = (code: string | undefined): string => ({ ACCESS_KEY_METADATA: '접근키 존재 정보', INCOMPLETE_CREDENTIAL: '키 구성 일부만 발견', CASE_LINK_REQUIRED: '노출 확인 · 건 연결 필요', EXPOSURE_CONFIRMED: '노출 확인', COVERAGE_GAP: '현재 존재 확인 필요', APPROVED_STORAGE: '정책에 따른 보관', PROVIDER_RETIREMENT_CONFIRMED: '공급자가 확인한 사용 종료', MANAGED_LOCATIONS_CONFIRMED: '보관·폐기 확인', STORAGE_POLICY_REQUIRED: '보관 정책 확인 필요' } as Record<string, string>)[code ?? ''] ?? '근거 확인 필요'
export const nextLabel = (code: string | undefined): string => ({ VIEW_METADATA: '키 정보', VIEW_CASE: '대응 건', LINK_CASE: '연결 근거 확인', REVIEW_EVIDENCE: '근거 확인', VIEW_DETAIL: '키 상세' } as Record<string, string>)[code ?? ''] ?? '키 상세'
export const presenceLabels: Record<string, string> = { PRESENT: '마지막 검사에서 발견', MISSING: '마지막 검사에서 미발견', UNKNOWN: '검사 근거 미확인' }
export const exposureLabels: Record<string, string> = { ABNORMAL: '노출 확인', NORMAL: '보관 허용', UNKNOWN: '노출 미확인' }
export const actionLabels: Record<string, string> = { OPEN: '신규 및 분석', IN_PROGRESS: '조치 중', REVALIDATION_PENDING: '재검사 대기', RESOLVED: '해결', NO_CASE: '대응 건 없음' }
export function parseLocationFilters(params: URLSearchParams): { filters: LocationFilter; errors: string[] } {
  params = canonicalSecretLocationParams(params)
  const errors: string[] = []
  const parsed: Record<string, string> = {}
  const options: Record<string, Record<string, string>> = { origin: inventoryOptions.origin, source: inventoryOptions.source, environment: inventoryOptions.environment, presence: { ALL: '전체', ...presenceLabels }, exposure: { ALL: '전체', ...exposureLabels }, actionStatus: { ALL: '전체', ...actionLabels } }
  for (const [key, values] of Object.entries(options)) {
    const value = params.get(key) ?? 'ALL'
    if (!Object.hasOwn(values, value)) errors.push('위치 조회 조건을 확인해 주세요.')
    parsed[key] = Object.hasOwn(values, value) ? value : 'ALL'
  }
  return { filters: { ...parsed, page: (positiveId(params.get('locationPage')) ?? 1) - 1, size: 20, expectedDetailVersion: params.get('detailVersion') ?? undefined } as LocationFilter, errors }
}
