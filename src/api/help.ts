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

async function countFindings(cve: string, extra: Record<string, string>): Promise<number> {
  const params = new URLSearchParams({ cveContains: cve, ...extra, size: '1', include: 'total' })
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

export function askHelp(question: string, page: string, history: HelpTurn[], mode?: HelpMode): Promise<HelpChatResponse> {
  return apiRequest<HelpChatResponse>('/api/v1/help/chat', {
    method: 'POST',
    body: JSON.stringify(mode ? { question, page, history, mode } : { question, page, history }),
  })
}
