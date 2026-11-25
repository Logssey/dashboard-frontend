// 사용법 도우미 API (docs/design/usage-chatbot-design.md)
// 프론트는 우리 백엔드만 부른다. Claude 주소·키는 프론트에 없다.
import { ApiError, apiRequest } from './client'

export interface HelpSource {
  doc: string
  title: string
  section: string
}

export interface HelpTurn {
  role: 'user' | 'assistant'
  text: string
}

/** 사고 대응 체크리스트 카드 한 장. screen은 정해진 키이고 경로는 프론트 표(HELP_SCREEN_ROUTES)에서만 찾는다 */
export interface HelpCard {
  checks: number[]
  titles: string[]
  screen: string
  focus: string
}

export interface HelpChatResponse {
  answer: string
  grounded: boolean
  sources: HelpSource[]
  remainingToday: number
  cached: boolean
  /** 체크리스트 카드. 일반 답이거나 카드 형식이 틀려 글로 대체됐으면 null */
  cards?: HelpCard[] | null
}

export type HelpMode = 'checklist'

export interface HelpStatus {
  ready: boolean
  reasonCode: string
  documentCount: number
}

export function fetchHelpStatus(): Promise<HelpStatus> {
  return apiRequest<HelpStatus>('/api/v1/help/status')
}

/**
 * 질문 속 CVE의 우리 환경 영향 (설계 문서 14장).
 * 기존 취약점 API를 로그인한 사용자 권한 그대로 부른다. 숫자만 받고, 이 값은 Claude로 보내지 않는다.
 */
export interface CveImpact {
  cve: string
  total: number
  running: number
  reachable: number
  runningReachable: number
  /** 실행 중인데 스캔이 없는 워크로드 수 (CVE와 무관한 전체 수). 서버가 주지 않으면 null */
  unscannedRunning: number | null
  /** 실제로 쓴 집계 기준. RUNNING을 요청해도 실행 중 정보가 없으면 LATEST */
  basis: 'RUNNING' | 'LATEST' | null
}

async function countFindings(cve: string | null, extra: Record<string, string>): Promise<number> {
  const params = new URLSearchParams({ ...(cve ? { cveContains: cve } : {}), ...extra, size: '1', include: 'total' })
  const page = await apiRequest<{ totalCount?: number | null }>(`/api/v1/reach/findings?${params}`)
  if (typeof page.totalCount !== 'number') throw new Error('totalCount missing')
  return page.totalCount
}

export async function fetchCveImpact(cve: string): Promise<CveImpact> {
  const [total, running, reachable, runningReachable, summary] = await Promise.all([
    countFindings(cve, {}),
    countFindings(cve, { deployment: 'RUNNING' }),
    countFindings(cve, { status: 'REACHABLE' }),
    countFindings(cve, { deployment: 'RUNNING', status: 'REACHABLE' }),
    apiRequest<{ basis?: { applied?: string; unscannedRunning?: unknown[] } | null }>('/api/v1/reach/summary'),
  ])
  const applied = summary.basis?.applied
  return {
    cve,
    total,
    running,
    reachable,
    runningReachable,
    unscannedRunning: Array.isArray(summary.basis?.unscannedRunning) ? summary.basis.unscannedRunning.length : null,
    basis: applied === 'RUNNING' || applied === 'LATEST' ? applied : null,
  }
}

/** 런타임 화면과 같은 기본 클러스터 */
export const INCIDENT_RUNTIME_CLUSTER = 'logssey-prod'

/**
 * 사고 이야기에 붙이는 "지금 우리 환경 현황" (설계 문서 15장).
 * 기존 런타임·시크릿·IaC·취약점 API를 내 권한으로 읽기만 한다(GET).
 * 한 곳이 실패하거나 권한이 없어도 나머지는 보여 준다. 숫자는 AI로 보내지 않는다.
 */
export interface IncidentStatus {
  /** 의심스러운 시도: 런타임 탐지 */
  runtime: {
    unreviewedFindings: number
    affectedWorkloads: number
    /** 탐지가 많은 규칙 (최대 3개). 규칙 이름은 Logssey가 정한 이름이다 */
    topRules: Array<{ title: string; count: number }>
    sensors: { healthy: number; degraded: number; offline: number; unknown: number }
  } | null
  /** 살아 있는 키: 시크릿 대응 건 중 유효성 확인 결과가 VALID인 것과 실키 경고 */
  keys: {
    validKeyCases: number
    crossEnvironmentAlerts: number
    reviewRequiredLocations: number | null
  } | null
  /** 바깥에서 닿는 경로·설정 변경: IaC 요약 */
  exposure: {
    openPaths: number
    tier1OpenPaths: number
    drifts: number
    stateSecrets: number
  } | null
  vuln: {
    /** 실행 중 + 도달 가능 + Critical/High */
    runningReachableSevere: number
    runningReachable: number
    unscannedRunning: number | null
  } | null
  /** 불러오지 못한 곳. denied는 권한이 없어 못 본 곳 */
  unavailable: Array<{ source: IncidentSource; denied: boolean }>
}

export type IncidentSource = 'runtime' | 'keys' | 'exposure' | 'vuln'

interface RuntimeOverviewShape {
  summary?: { unreviewedFindingCount?: number; affectedWorkloadCount?: number }
  findingsByRule?: Array<{ title?: unknown; count?: unknown }>
  sensorSummary?: { healthy?: number; degraded?: number; offline?: number; unknown?: number }
}

interface SecretSummaryShape {
  metrics?: Array<{ key?: unknown; value?: unknown }>
  caseSummary?: { severityValidityMatrix?: { cells?: Array<{ validity?: unknown; value?: unknown }> } }
  crossEnvironmentAlerts?: { value?: unknown }
}

interface IacSummaryShape {
  metrics?: { openPaths?: unknown; tier1OpenPaths?: unknown; drifts?: unknown; stateSecrets?: unknown }
}

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0)
const RULE_TITLE_MAX = 60

async function readRuntime(): Promise<NonNullable<IncidentStatus['runtime']>> {
  const overview = await apiRequest<RuntimeOverviewShape>(`/api/v1/runtime/overview?clusterId=${encodeURIComponent(INCIDENT_RUNTIME_CLUSTER)}`)
  const rules = Array.isArray(overview.findingsByRule) ? overview.findingsByRule : []
  return {
    unreviewedFindings: count(overview.summary?.unreviewedFindingCount),
    affectedWorkloads: count(overview.summary?.affectedWorkloadCount),
    topRules: rules
      .filter((rule) => typeof rule.title === 'string' && count(rule.count) > 0)
      .map((rule) => ({ title: String(rule.title).slice(0, RULE_TITLE_MAX), count: count(rule.count) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3),
    sensors: {
      healthy: count(overview.sensorSummary?.healthy),
      degraded: count(overview.sensorSummary?.degraded),
      offline: count(overview.sensorSummary?.offline),
      unknown: count(overview.sensorSummary?.unknown),
    },
  }
}

async function readKeys(): Promise<NonNullable<IncidentStatus['keys']>> {
  const params = new URLSearchParams({ origin: 'ALL', source: 'ALL', provider: 'ALL', environment: 'ALL' })
  const summary = await apiRequest<SecretSummaryShape>(`/api/v1/secrets/summary?${params}`)
  const cells = summary.caseSummary?.severityValidityMatrix?.cells ?? []
  const review = (summary.metrics ?? []).find((metric) => metric.key === 'reviewRequiredLocations')
  return {
    validKeyCases: cells.filter((cell) => cell.validity === 'VALID').reduce((sum, cell) => sum + count(cell.value), 0),
    crossEnvironmentAlerts: count(summary.crossEnvironmentAlerts?.value),
    reviewRequiredLocations: review && typeof review.value === 'number' ? count(review.value) : null,
  }
}

async function readExposure(): Promise<NonNullable<IncidentStatus['exposure']>> {
  const summary = await apiRequest<IacSummaryShape>('/api/v1/iac/summary')
  return {
    openPaths: count(summary.metrics?.openPaths),
    tier1OpenPaths: count(summary.metrics?.tier1OpenPaths),
    drifts: count(summary.metrics?.drifts),
    stateSecrets: count(summary.metrics?.stateSecrets),
  }
}

async function readVuln(): Promise<NonNullable<IncidentStatus['vuln']>> {
  const [severe, reachable, summary] = await Promise.all([
    countFindings(null, { deployment: 'RUNNING', status: 'REACHABLE', severity: 'CRITICAL,HIGH' }),
    countFindings(null, { deployment: 'RUNNING', status: 'REACHABLE' }),
    apiRequest<{ basis?: { unscannedRunning?: unknown[] } | null }>('/api/v1/reach/summary'),
  ])
  return {
    runningReachableSevere: severe,
    runningReachable: reachable,
    unscannedRunning: Array.isArray(summary.basis?.unscannedRunning) ? summary.basis.unscannedRunning.length : null,
  }
}

export async function fetchIncidentStatus(): Promise<IncidentStatus> {
  const sources: IncidentSource[] = ['runtime', 'keys', 'exposure', 'vuln']
  const results = await Promise.allSettled([readRuntime(), readKeys(), readExposure(), readVuln()])
  if (results.every((result) => result.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason
  const value = <T,>(index: number) => (results[index].status === 'fulfilled' ? (results[index] as PromiseFulfilledResult<T>).value : null)
  return {
    runtime: value<NonNullable<IncidentStatus['runtime']>>(0),
    keys: value<NonNullable<IncidentStatus['keys']>>(1),
    exposure: value<NonNullable<IncidentStatus['exposure']>>(2),
    vuln: value<NonNullable<IncidentStatus['vuln']>>(3),
    unavailable: results.flatMap((result, index) =>
      result.status === 'rejected'
        ? [{ source: sources[index], denied: result.reason instanceof ApiError && result.reason.status === 403 }]
        : [],
    ),
  }
}

export function askHelp(question: string, page: string, history: HelpTurn[], mode?: HelpMode): Promise<HelpChatResponse> {
  return apiRequest<HelpChatResponse>('/api/v1/help/chat', {
    method: 'POST',
    body: JSON.stringify(mode ? { question, page, history, mode } : { question, page, history }),
  })
}
