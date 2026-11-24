// 사용법 도우미 API (docs/design/usage-chatbot-design.md)
// 프론트는 우리 백엔드만 부른다. Claude 주소·키는 프론트에 없다.
import { apiRequest } from './client'

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
 * 사고 이야기(CVE 없이)에 붙이는 "지금 우리 환경 현황" (설계 문서 15장).
 * 기존 취약점·런타임 API를 내 권한으로 읽기만 한다. 한쪽이 실패해도 다른 쪽은 보여 준다. AI로 보내지 않는다.
 */
export interface IncidentStatus {
  vuln: {
    /** 실행 중 + 도달 가능 + Critical/High */
    runningReachableSevere: number
    runningReachable: number
    unscannedRunning: number | null
  } | null
  runtime: {
    unreviewedFindings: number
    affectedWorkloads: number
    sensors: { healthy: number; degraded: number; offline: number; unknown: number }
    period: { from: string; to: string } | null
  } | null
}

interface RuntimeOverviewShape {
  period?: { from: string; to: string }
  summary?: { unreviewedFindingCount?: number; affectedWorkloadCount?: number }
  sensorSummary?: { healthy?: number; degraded?: number; offline?: number; unknown?: number }
}

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0)

export async function fetchIncidentStatus(): Promise<IncidentStatus> {
  const [vuln, runtime] = await Promise.allSettled([
    Promise.all([
      countFindings(null, { deployment: 'RUNNING', status: 'REACHABLE', severity: 'CRITICAL,HIGH' }),
      countFindings(null, { deployment: 'RUNNING', status: 'REACHABLE' }),
      apiRequest<{ basis?: { unscannedRunning?: unknown[] } | null }>('/api/v1/reach/summary'),
    ]),
    apiRequest<RuntimeOverviewShape>(`/api/v1/runtime/overview?clusterId=${encodeURIComponent(INCIDENT_RUNTIME_CLUSTER)}`),
  ])
  if (vuln.status === 'rejected' && runtime.status === 'rejected') throw vuln.reason
  return {
    vuln:
      vuln.status === 'fulfilled'
        ? {
            runningReachableSevere: vuln.value[0],
            runningReachable: vuln.value[1],
            unscannedRunning: Array.isArray(vuln.value[2].basis?.unscannedRunning) ? vuln.value[2].basis.unscannedRunning.length : null,
          }
        : null,
    runtime:
      runtime.status === 'fulfilled'
        ? {
            unreviewedFindings: count(runtime.value.summary?.unreviewedFindingCount),
            affectedWorkloads: count(runtime.value.summary?.affectedWorkloadCount),
            sensors: {
              healthy: count(runtime.value.sensorSummary?.healthy),
              degraded: count(runtime.value.sensorSummary?.degraded),
              offline: count(runtime.value.sensorSummary?.offline),
              unknown: count(runtime.value.sensorSummary?.unknown),
            },
            period: runtime.value.period ?? null,
          }
        : null,
  }
}

export function askHelp(question: string, page: string, history: HelpTurn[], mode?: HelpMode): Promise<HelpChatResponse> {
  return apiRequest<HelpChatResponse>('/api/v1/help/chat', {
    method: 'POST',
    body: JSON.stringify(mode ? { question, page, history, mode } : { question, page, history }),
  })
}
