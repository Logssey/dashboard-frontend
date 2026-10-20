import type { RunFilters } from '../api/secretRuns'

export const scanTypes = { ALL: '전체 실행', SCHEDULED: '정기 전체 스캔', MANUAL: '수동 전체 스캔', REVALIDATION: '위치별 재검증' } as const
export const scanPlatforms = { GITHUB: 'GitHub', AWS: 'AWS', NOTION: 'Notion', KUBERNETES: 'Kubernetes' } as const
export const scanStatuses = { PENDING: '대기', RUNNING: '진행 중', SUCCEEDED: '정상 종료', PARTIAL: '부분 실패', FAILED: '실패', CANCELLED: '취소' } as const
export const terminalRunStatuses = new Set(['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED'])

export function positiveId(raw: string | null | undefined): number | null {
  if (!raw || !/^[1-9]\d*$/.test(raw)) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) ? value : null
}

/** Only supported list parameters may cross from a detail URL back to the list. */
export function parseRunFilters(params: URLSearchParams): { filters: RunFilters; errors: string[] } {
  const errors: string[] = []
  const type = params.get('type') ?? 'ALL'
  const status = params.get('status') ?? ''
  const provider = params.get('provider') ?? ''
  const connectionId = positiveId(params.get('connectionId'))
  if (!Object.hasOwn(scanTypes, type)) errors.push('실행 유형을 다시 선택해 주세요.')
  if (status && !Object.hasOwn(scanStatuses, status)) errors.push('실행 상태를 다시 선택해 주세요.')
  if (provider && !Object.hasOwn(scanPlatforms, provider)) errors.push('수집 플랫폼을 다시 선택해 주세요.')
  if (params.has('connectionId') && params.get('connectionId') && !connectionId) errors.push('연결을 다시 선택해 주세요.')
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  if (Boolean(from) !== Boolean(to)) errors.push('조회 기간은 시작과 종료를 함께 지정해 주세요.')
  const isTimestamp = (value: string) => !value || (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)))
  if (!isTimestamp(from) || !isTimestamp(to) || (from && to && Date.parse(from) >= Date.parse(to))) errors.push('조회 기간의 시작은 종료보다 앞서야 해요.')
  const snapshotId = params.get('snapshotId') ?? ''
  if (snapshotId && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(snapshotId)) errors.push('이력 조회 기준을 확인해 주세요.')
  return { filters: { page: (positiveId(params.get('page')) ?? 1) - 1, size: 20, type: Object.hasOwn(scanTypes, type) ? type as RunFilters['type'] : 'ALL', status: Object.hasOwn(scanStatuses, status) ? status : '', provider: Object.hasOwn(scanPlatforms, provider) ? provider : '', connectionId, from, to, snapshotId }, errors }
}

export function runFilterSearch(filters: RunFilters): URLSearchParams {
  const params = new URLSearchParams({ page: String(filters.page + 1) })
  if (filters.type !== 'ALL') params.set('type', filters.type)
  if (filters.status) params.set('status', filters.status)
  if (filters.provider) params.set('provider', filters.provider)
  if (filters.connectionId) params.set('connectionId', String(filters.connectionId))
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.snapshotId) params.set('snapshotId', filters.snapshotId)
  return params
}
export function scanDetailPath(runId: number, filters?: RunFilters): string {
  const params = filters ? runFilterSearch(filters) : new URLSearchParams()
  if (filters) params.set('return', 'history')
  return `/secrets/history/${runId}${params.size ? `?${params}` : ''}`
}
export function historyReturnPath(params: URLSearchParams, runId?: number): string {
  if (params.get('return') !== 'history') return '/secrets/history'
  const parsed = parseRunFilters(params)
  if (parsed.errors.length) return '/secrets/history'
  const query = runFilterSearch(parsed.filters)
  if (runId) query.set('focus', String(runId))
  return `/secrets/history?${query}`
}
const KST = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul', hour12: false })
export function scanDate(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '미확인'
  return `${KST.format(new Date(value))} KST`
}
export function scanDuration(start: string | null, end: string | null): string {
  if (!start || !end) return '—'
  const seconds = Math.round((Date.parse(end) - Date.parse(start)) / 1000)
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  return seconds < 60 ? `${seconds}초` : `${Math.floor(seconds / 60)}분 ${String(seconds % 60).padStart(2, '0')}초`
}
export function scanStatus(status: string): string {
  return Object.hasOwn(scanStatuses, status) ? scanStatuses[status as keyof typeof scanStatuses] : status === 'SKIPPED' ? '건너뜀' : status === 'LEASED' ? '진행 중' : '미확인'
}
/** datetime-local is explicitly KST, independent of the browser's local timezone. */
export function kstInput(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return ''
  return new Date(Date.parse(value) + 9 * 60 * 60 * 1000).toISOString().slice(0, 16)
}
export function kstInputToUtc(value: string): string {
  return value ? new Date(`${value}:00+09:00`).toISOString() : ''
}
export function scopeTypeLabel(type: string): string {
  return ({ GITHUB_REPOSITORY_FILES: 'GitHub 파일', IAM_ACCESS_KEY_METADATA: 'IAM 접근키 메타데이터', AWS_SECRETS_MANAGER_METADATA: 'Secrets Manager 목록', AWS_SSM_PARAMETER_METADATA: 'SSM Parameter 목록', AWS_S3_BUCKET_METADATA: 'S3 버킷 목록', AWS_SECRETS_MANAGER_VALUE: 'Secrets Manager 값', AWS_SSM_PARAMETER_VALUE: 'SSM Parameter 값', AWS_S3_OBJECT_CONTENT: 'S3 객체 내용', NOTION_PAGE_BLOCKS: 'Notion 페이지', KUBERNETES_SECRET: 'Kubernetes Secret' } as Record<string, string>)[type] ?? '수집 범위'
}
export function scanReason(code: string | null | undefined): string {
  if (!code) return '상세 근거 미기록'
  if (code.includes('ACCESS_DENIED') || code.includes('ACCOUNT_MISMATCH')) return '접근 권한 확인 필요'
  if (code.includes('NOT_APPLICABLE') || code.includes('METADATA')) return '키 값 검사 대상 아님'
  if (code.includes('NEVER_SCANNED') || code.includes('REVISION_UNCHECKED')) return '현재 승인 범위 검사 전'
  if (code.includes('OVERDUE')) return '검사 예정 시각 지남'
  if (code.includes('PAUSED')) return '연결 또는 범위 일시중지'
  if (code.includes('NOT_SCHEDULED')) return '정기 검사 일정 없음'
  if (code.includes('RATE_LIMITED')) return '요청 한도 도달'
  if (code.includes('CANCELLED')) return '작업 취소로 미검사'
  if (code.includes('UNSUPPORTED') || code.includes('NOT_SUPPORTED')) return '지원하지 않는 검사'
  if (code.includes('DISABLED')) return '검사 설정 비활성'
  if (code.includes('NON_TEXT') || code.includes('BINARY')) return '텍스트가 아닌 항목 제외'
  if (code.includes('TOO_LARGE') || code.includes('LIMIT')) return '읽기 제한 도달'
  if (code.includes('LEGACY') || code.includes('NOT_RECORDED') || code.includes('LINK_UNAVAILABLE')) return '확인 근거 미기록'
  if (code.includes('UNAVAILABLE') || code.includes('TEMPORARY')) return '원천 응답 확인 불가'
  if (code.includes('INCOMPLETE')) return '최근 검사 일부 누락'
  return '검사 근거 확인 필요'
}
export function hasScopeAggregation(run: { aggregationStatus: string; successfulScopeCount: number | null; scopeCount: number }): boolean {
  return ['AVAILABLE', 'COMPLETE', 'VERIFIED'].includes(run.aggregationStatus) && run.successfulScopeCount != null && run.scopeCount > 0
}
export function objectCountLabel(scope: { scopeOutcome: string; objectCount: number | null }): string {
  return ['SUCCEEDED', 'PARTIAL'].includes(scope.scopeOutcome) && scope.objectCount != null ? `${scope.objectCount}개 확인${scope.scopeOutcome === 'PARTIAL' ? ' · 일부 미확인' : ''}` : '확인 불가'
}
export function findingCountLabel(count: number | null | undefined, coverageComplete: boolean | undefined): string {
  return count == null || count < 0 || (count === 0 && coverageComplete !== true) ? '확인 불가' : `${count}개`
}
