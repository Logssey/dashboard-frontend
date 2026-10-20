import type { InventoryFilter, LocationFilter } from '../api/secrets'
import { positiveId } from './secretScan'
import { safeWorkbenchReturn } from './secretWorkbench'

export const inventoryOptions = {
  origin: { PRODUCTION: '운영', TEST: '시험', UNCLASSIFIED: '미분류' },
  contentKind: { VALUE_FINDINGS: '값 후보', METADATA: '메타데이터', ALL: '전체 기록' },
  workBucket: { ALL: '전체 업무', NEEDS_DECISION: '확인 필요', ACTION_REQUIRED: '조치 필요', NORMAL_INVENTORY: '보관 허용', NEEDS_CASE_LINK: '건 연결 필요' },
  source: { ALL: '전체 소스', GITHUB: 'GitHub', AWS: 'AWS', NOTION: 'Notion', KUBERNETES: 'Kubernetes' },
  provider: { ALL: '전체 발급자', GITHUB: 'GitHub', AWS: 'AWS', NOTION: 'Notion', KUBERNETES: 'Kubernetes' },
  environment: { ALL: '전체 환경', PROD: '운영', DEV: '개발', UNKNOWN: '환경 미확인' },
  componentState: { ALL: '전체 구성', CONFIRMED: '구성 확인', CANDIDATE: '일부 구성', METADATA_ONLY: '메타데이터' },
  validity: { ALL: '전체 검증', VALID: '유효', INVALID: '무효', UNKNOWN: '확인 불가', UNCHECKED: '미검증' },
  severity: { ALL: '전체 심각도', UNASSESSED: '미평가', LOW: '낮음', MEDIUM: '보통', HIGH: '높음', CRITICAL: '심각' },
} as const
const defaults = { origin: 'PRODUCTION', contentKind: 'VALUE_FINDINGS', workBucket: 'ALL', source: 'ALL', provider: 'ALL', environment: 'ALL', componentState: 'ALL', validity: 'ALL', severity: 'ALL' } as const
export function parseInventoryFilters(params: URLSearchParams): { filters: InventoryFilter; errors: string[] } {
  const errors: string[] = []
  const parsed: Record<string, string> = {}
  for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
    const value = params.get(key) ?? (key === 'provider' ? params.get('issuer') : null) ?? defaults[key]
    if (!Object.hasOwn(inventoryOptions[key], value)) errors.push(`${key} 조회 조건을 확인해 주세요.`)
    parsed[key] = Object.hasOwn(inventoryOptions[key], value) ? value : defaults[key]
  }
  const page = positiveId(params.get('page')) ?? 1
  const snapshotId = params.get('snapshotId') ?? ''
  if (snapshotId && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(snapshotId)) errors.push('조회 기준을 새로고침해 주세요.')
  return { filters: { ...parsed, issuer: 'ALL', page: page - 1, size: 20, snapshotId } as InventoryFilter, errors }
}
export function inventorySearch(filter: InventoryFilter): URLSearchParams {
  const params = new URLSearchParams({ page: String(filter.page + 1) })
  for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) if (filter[key] !== defaults[key]) params.set(key, filter[key])
  if (filter.snapshotId) params.set('snapshotId', filter.snapshotId)
  return params
}
export function keyDetailPath(id: number, filter?: InventoryFilter): string {
  if (!filter) return `/secrets/${id}`
  const params = inventorySearch(filter)
  const result = new URLSearchParams({ origin: filter.origin, return: 'inventory', returnQuery: params.toString() })
  return `/secrets/${id}?${result}`
}
export function inventoryReturnPath(params: URLSearchParams, id: number | null): string {
  if (params.get('return') === 'workbench') return safeWorkbenchReturn(params.get('returnQuery'), id ? String(id) : undefined)
  if (params.get('return') !== 'inventory') return '/secrets/findings'
  const parsed = parseInventoryFilters(new URLSearchParams(params.get('returnQuery') ?? ''))
  if (parsed.errors.length) return '/secrets/findings'
  const safe = inventorySearch(parsed.filters)
  if (id) safe.set('focus', String(id))
  return `/secrets/findings?${safe}`
}
export const whyLabel = (code: string | undefined): string => ({ ACCESS_KEY_METADATA: '접근키 존재 정보', INCOMPLETE_CREDENTIAL: '키 구성 보완 필요', CASE_LINK_REQUIRED: '노출 확인 · 건 연결 필요', EXPOSURE_CONFIRMED: '노출 확인', COVERAGE_GAP: '현재 존재 확인 필요', APPROVED_STORAGE: '정책에 따른 보관', STORAGE_POLICY_REQUIRED: '보관 정책 확인 필요' } as Record<string, string>)[code ?? ''] ?? '근거 확인 필요'
export const nextLabel = (code: string | undefined): string => ({ VIEW_METADATA: '키 정보', VIEW_CASE: '대응 건', LINK_CASE: '연결 근거 확인', REVIEW_EVIDENCE: '근거 확인', VIEW_DETAIL: '키 상세' } as Record<string, string>)[code ?? ''] ?? '키 상세'
export const presenceLabels: Record<string, string> = { PRESENT: '현재 발견', MISSING: '재검사에서 미발견', UNKNOWN: '현재 확인 불가' }
export const exposureLabels: Record<string, string> = { ABNORMAL: '노출 확인', NORMAL: '보관 허용', UNKNOWN: '노출 미확인' }
export const actionLabels: Record<string, string> = { OPEN: '신규 및 분석', IN_PROGRESS: '조치 중', REVALIDATION_PENDING: '재검사 대기', RESOLVED: '해결', NO_CASE: '대응 건 없음' }
export function parseLocationFilters(params: URLSearchParams): { filters: LocationFilter; errors: string[] } {
  const errors: string[] = []
  const parsed: Record<string, string> = {}
  const options: Record<string, Record<string, string>> = { origin: inventoryOptions.origin, source: inventoryOptions.source, environment: inventoryOptions.environment, presence: { ALL: '전체', ...presenceLabels }, exposure: { ALL: '전체', ...exposureLabels }, actionStatus: { ALL: '전체', ...actionLabels } }
  for (const [key, values] of Object.entries(options)) {
    const value = params.get(key) ?? (key === 'origin' ? 'PRODUCTION' : 'ALL')
    if (!Object.hasOwn(values, value)) errors.push('위치 조회 조건을 확인해 주세요.')
    parsed[key] = Object.hasOwn(values, value) ? value : key === 'origin' ? 'PRODUCTION' : 'ALL'
  }
  return { filters: { ...parsed, page: (positiveId(params.get('locationPage')) ?? 1) - 1, size: 20, expectedDetailVersion: params.get('detailVersion') ?? undefined } as LocationFilter, errors }
}
