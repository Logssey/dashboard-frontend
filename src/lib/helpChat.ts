import type { CveImpact, HelpCard, HelpSource, HelpTurn, IncidentStatus } from '@/api/help'

export const HELP_QUESTION_MAX = 500
const HISTORY_MESSAGES = 6
const STORAGE_KEY = 'logssey.help.chat'

export interface HelpMessage {
  role: 'user' | 'assistant'
  text: string
  grounded?: boolean
  sources?: HelpSource[]
  cards?: HelpCard[]
  error?: boolean
  /** 예전 저장 형식(CVE 하나). 읽을 때 impactCves로 바꾼다 */
  impactCve?: string
  /** 질문에 있던 CVE 번호들(또는 사고 이름에서 찾은 번호). 영향 상자를 그릴 때만 쓰고 숫자는 저장하지 않는다 */
  impactCves?: string[]
  /** 사고 이름 (예: Log4Shell). 질문에 CVE 번호 대신 이름이 있었을 때 */
  incidentName?: string
  /** 사고 이야기라서 "지금 우리 환경 현황" 상자를 그린다 */
  incidentStatus?: boolean
}

const CVE_IN_TEXT = /\bCVE-\d{4}-\d{4,7}\b/gi
const CVE_EXACT = /^CVE-\d{4}-\d{4,7}$/
const MAX_IMPACT_CVES = 3

/** 질문 속 첫 CVE 번호(대문자). 백엔드 HelpChecklist.wanted와 같은 모양 */
export function findCve(text: string): string | undefined {
  return findCves(text)[0]
}

/** 질문 속 CVE 번호들(대문자, 중복 없이 최대 3개) */
export function findCves(text: string): string[] {
  return [...new Set([...text.matchAll(CVE_IN_TEXT)].map((match) => match[0].toUpperCase()))].slice(0, MAX_IMPACT_CVES)
}

/**
 * 잘 알려진 사고 이름 → CVE 번호 (설계 문서 15장). 고정 표라서 AI가 번호를 지어낼 일이 없다.
 * 컨테이너 이미지 패키지로 잡히는 것만 넣는다.
 */
export const INCIDENT_ALIASES: ReadonlyArray<{ name: string; match: RegExp; cves: readonly string[] }> = Object.freeze([
  { name: 'Log4Shell', match: /log4\s*shell|log4j/i, cves: ['CVE-2021-44228', 'CVE-2021-45046'] },
  { name: 'Spring4Shell', match: /spring4\s*shell/i, cves: ['CVE-2022-22965'] },
  { name: 'Text4Shell', match: /text4\s*shell|commons[-\s]?text/i, cves: ['CVE-2022-42889'] },
  { name: 'PHP-CGI 원격 코드 실행', match: /php[-\s]?cgi|php\s*(원격|rce)/i, cves: ['CVE-2024-4577'] },
  { name: 'Apache Struts2 (S2-045)', match: /struts\s*2?|s2-045/i, cves: ['CVE-2017-5638'] },
  { name: 'Shellshock', match: /shell\s*shock/i, cves: ['CVE-2014-6271'] },
  { name: 'Heartbleed', match: /heart\s*bleed/i, cves: ['CVE-2014-0160'] },
  { name: 'xz 백도어', match: /xz[-\s]?(utils|백도어|backdoor)/i, cves: ['CVE-2024-3094'] },
  { name: 'regreSSHion', match: /regre\s*ssh\s*ion/i, cves: ['CVE-2024-6387'] },
])

/** 질문에 적힌 CVE 번호가 먼저, 없으면 사고 이름 표에서 찾는다 */
export function incidentCves(text: string): { cves: string[]; name?: string } {
  const explicit = findCves(text)
  if (explicit.length > 0) return { cves: explicit }
  const alias = INCIDENT_ALIASES.find((entry) => entry.match.test(text))
  return alias ? { cves: alias.cves.slice(0, MAX_IMPACT_CVES), name: alias.name } : { cves: [] }
}

const INCIDENT_WORDS =
  /뚫렸|뚫린|뚫려|해킹|침해|사고|터졌|터진|랜섬|유출|새어\s*나|털렸|공격|악성|이상한\s*(접속|프로그램|트래픽|로그인)|감염|breach|hacked|ransom|compromis|incident/i

/** 보안사고 이야기인지 (정해진 낱말로만 판단한다). 맞으면 "지금 우리 환경 현황" 상자를 붙인다 */
export function looksLikeIncident(text: string): boolean {
  return INCIDENT_WORDS.test(text)
}

export interface IncidentPriority {
  text: string
  /** HELP_SCREEN_ROUTES 키. OUTSIDE면 버튼 없음 */
  screen: string
}

/**
 * "지금 먼저 볼 것" (설계 문서 15장, 대응 절차 문서 "상황별로 먼저 볼 것").
 * 실제 숫자로 정해진 규칙에 따라 순서를 매긴다. AI가 정하지 않는다.
 * 공격 흔적 → 볼 수 없는 곳 → 열려 있는 위험 → 빠진 곳 → 늘 확인할 것 순서.
 */
export function incidentPriorities(status: IncidentStatus): IncidentPriority[] {
  const list: IncidentPriority[] = []
  const runtime = status.runtime
  const vuln = status.vuln
  if (!runtime) {
    list.push({ text: '런타임 탐지를 불러오지 못했어요. 런타임 보안 화면에서 사고 이후 탐지를 직접 보세요 (5번).', screen: 'RUNTIME' })
  } else {
    if (runtime.unreviewedFindings > 0) {
      list.push({
        text: `검토하지 않은 런타임 탐지 ${runtime.unreviewedFindings}건(영향 워크로드 ${runtime.affectedWorkloads}개)부터 보세요. 이미 뚫렸는지 확인하는 단계예요 (5번).`,
        screen: 'RUNTIME',
      })
    }
    const sensorTotal = runtime.sensors.healthy + runtime.sensors.degraded + runtime.sensors.offline + runtime.sensors.unknown
    if (runtime.sensors.healthy === 0) {
      list.push({
        text: `${sensorTotal === 0 ? '연결된 런타임 센서가 없어' : '정상인 런타임 센서가 없어'} Logssey로는 침해 흔적을 볼 수 없어요. 웹 서버 접근 로그와 클라우드 감사 로그를 먼저 확인하세요 (Logssey 밖).`,
        screen: 'OUTSIDE',
      })
    } else if (runtime.sensors.offline + runtime.sensors.degraded > 0) {
      list.push({
        text: `꺼졌거나 불안정한 센서가 ${runtime.sensors.offline + runtime.sensors.degraded}개 있어요. 그 노드는 탐지가 비어 있을 수 있어요.`,
        screen: 'RUNTIME',
      })
    }
  }
  if (!vuln) {
    list.push({ text: '취약점 데이터를 불러오지 못했어요. Finding 목록에서 실행 중·도달 가능 Finding을 직접 보세요 (2·4번).', screen: 'VULN_FINDINGS' })
  } else {
    if (vuln.runningReachableSevere > 0) {
      list.push({
        text: `실행 중이면서 도달 가능한 Critical·High Finding ${vuln.runningReachableSevere}건이 있어요. 바깥에서 닿는지 보고 고치세요 (4·9번).`,
        screen: 'VULN_FINDINGS',
      })
    } else if (vuln.runningReachable > 0) {
      list.push({ text: `실행 중이면서 도달 가능한 Finding ${vuln.runningReachable}건을 확인하세요 (4번).`, screen: 'VULN_FINDINGS' })
    }
    if (vuln.unscannedRunning) {
      list.push({ text: `스캔 없는 실행 중 워크로드 ${vuln.unscannedRunning}개는 위 숫자에 빠져 있어요. 먼저 스캔하세요 (3번).`, screen: 'VULN_WORKLOADS' })
    }
  }
  list.push(
    { text: '뚫린 서버가 쓰던 키·비밀을 찾아 교체 대응 건을 만드세요 (7번).', screen: 'SECRET_FINDINGS' },
    { text: '새로 실패한 점검이나 바뀐 계정·권한·설정이 없는지 보세요 (8번).', screen: 'COMPLIANCE' },
  )
  return list
}

/** 저장소에서 읽은 값도 정확한 CVE 모양일 때만 조회에 쓴다 */
export function usableCve(value: unknown): string | undefined {
  return typeof value === 'string' && CVE_EXACT.test(value) ? value : undefined
}

/** 영향 조회 결과를 사람이 읽는 줄로 바꾼다. 숫자는 서버 조회 값 그대로이고 AI가 만든 문장이 아니다 */
export function impactLines(impact: CveImpact): { rows: Array<[string, string]>; notes: string[] } {
  const rows: Array<[string, string]> = [
    ['Finding 전체', `${impact.total}건`],
    ['실행 중인 곳', `${impact.running}건`],
    ['도달 가능 판정', `${impact.reachable}건`],
    ['실행 중 + 도달 가능', `${impact.runningReachable}건`],
  ]
  if (impact.unscannedRunning !== null) rows.push(['스캔 없는 실행 중 워크로드', `${impact.unscannedRunning}개`])
  const notes: string[] = []
  if (impact.runningReachable > 0) notes.push('실행 중이면서 도달 가능한 Finding부터 처리하세요.')
  if (impact.total === 0) notes.push('0건이라고 안전하다는 뜻은 아니에요. 스캔하지 않은 이미지는 목록에 나오지 않아요.')
  if (impact.unscannedRunning) notes.push('스캔 없는 워크로드는 이 숫자에 빠져 있어요. 워크로드 화면에서 먼저 스캔하세요.')
  if (impact.basis === 'LATEST') notes.push('실행 중 정보가 없어 최신 스캔 기준으로 셌어요.')
  return { rows, notes }
}

/** 체크리스트 버튼을 눌렀는데 입력칸이 비어 있을 때 보내는 질문 */
export const CHECKLIST_DEFAULT_QUESTION = '침해사고가 났을 때 무엇부터 확인해야 해요?'

/**
 * 카드의 화면 키 → 내부 경로 (설계 문서 12.2). "화면 열기"는 이 표에 있는 경로로만 간다.
 * 응답 문자열을 경로로 쓰지 않는다. 키 목록은 백엔드 HelpChecklist.SCREENS와 같다(양쪽 테스트로 확인).
 * OUTSIDE(Logssey 밖)는 경로가 없어 버튼을 그리지 않는다.
 */
export const HELP_SCREEN_ROUTES: Readonly<Record<string, { path: string; title: string } | null>> = Object.freeze({
  VULN_SUMMARY: { path: '/vulnerabilities', title: '취약점 관리' },
  VULN_FINDINGS: { path: '/vulnerabilities/findings', title: 'Finding 목록' },
  VULN_WORKLOADS: { path: '/vulnerabilities/workloads', title: '워크로드' },
  VULN_SCANS: { path: '/vulnerabilities/scans', title: '스캔' },
  RUNTIME: { path: '/runtime', title: '런타임 보안' },
  IAC: { path: '/iac', title: 'IaC 보안' },
  SECRET_FINDINGS: { path: '/secrets/findings', title: '키·노출 위치' },
  SECRET_CASES: { path: '/secrets/cases', title: '대응 관리' },
  COMPLIANCE: { path: '/configuration', title: '컴플라이언스' },
  OUTSIDE: null,
})

/** 표에 있는 키만 경로를 돌려준다. 모르는 키·OUTSIDE·이상한 값은 undefined (버튼 없음) */
export function helpScreenRoute(screen: unknown): { path: string; title: string } | undefined {
  if (typeof screen !== 'string' || !Object.prototype.hasOwnProperty.call(HELP_SCREEN_ROUTES, screen)) return undefined
  return HELP_SCREEN_ROUTES[screen] ?? undefined
}

/** 서버나 sessionStorage에서 온 카드 목록이 그릴 수 있는 모양인지 본다. 아니면 일반 텍스트로 보여 준다 */
export function usableCards(cards: unknown): HelpCard[] | undefined {
  if (!Array.isArray(cards) || cards.length === 0 || cards.length > 10) return undefined
  const ok = cards.every(
    (card) =>
      card !== null &&
      typeof card === 'object' &&
      Array.isArray(card.titles) &&
      card.titles.length > 0 &&
      card.titles.every((title: unknown) => typeof title === 'string') &&
      typeof card.screen === 'string' &&
      typeof card.focus === 'string',
  )
  return ok ? (cards as HelpCard[]) : undefined
}

// 서버(HelpQuestionGuard)와 같은 규칙의 간단판. 브라우저에서 먼저 막아 값이 아예 나가지 않게 한다.
const KNOWN_FORMATS =
  /sk-ant-[A-Za-z0-9_-]{8,}|\bgh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|\b(?:ntn|secret)_[A-Za-z0-9]{20,}|\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bxox[abposr]-[A-Za-z0-9-]{10,}|\bAIza[0-9A-Za-z_-]{35}|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./
const LONG_TOKEN = /[A-Za-z0-9+/_=-]{32,}/g

function entropy(value: string): number {
  const counts = new Map<string, number>()
  for (const c of value) counts.set(c, (counts.get(c) ?? 0) + 1)
  let result = 0
  for (const count of counts.values()) {
    const p = count / value.length
    result -= p * Math.log2(p)
  }
  return result
}

export function looksLikeSecret(text: string): boolean {
  if (KNOWN_FORMATS.test(text)) return true
  for (const match of text.matchAll(LONG_TOKEN)) {
    const token = match[0]
    if (/\d/.test(token) && /[A-Za-z]/.test(token) && entropy(token) >= 3.5) return true
  }
  return false
}

/** 성공한 질문·답변 쌍만 최근 것부터 최대 6개 메시지로 보낸다. 오류 답변과 짝 없는 질문은 뺀다. */
export function buildHistory(messages: HelpMessage[]): HelpTurn[] {
  const pairs: HelpTurn[] = []
  for (let i = 0; i + 1 < messages.length; i++) {
    const user = messages[i]
    const assistant = messages[i + 1]
    if (user.role === 'user' && assistant.role === 'assistant' && !assistant.error) {
      pairs.push({ role: 'user', text: user.text }, { role: 'assistant', text: assistant.text })
      i++
    }
  }
  return pairs.slice(-HISTORY_MESSAGES)
}

const suggestions: Array<{ match: (page: string) => boolean; questions: string[] }> = [
  { match: (p) => p === '통합 현황', questions: ['환경별로 보려면 어떻게 해요?', '위험 기준 점수는 어떻게 계산돼요?'] },
  { match: (p) => p === '키·노출 위치' || p === '키 상세', questions: ['CSV로 내보내려면 어떻게 해요?', '키 유효성 확인은 어떻게 해요?'] },
  { match: (p) => ['확인 대기열', '위치 확인', '추가 조사', '실키 경고'].includes(p), questions: ['대응 건은 어떻게 만들어요?', '추가 조사는 어떻게 종료해요?'] },
  { match: (p) => p === '대응 관리' || p === '대응 상세', questions: ['담당자는 어떻게 바꿔요?', '대응 건을 해결로 바꾸려면?'] },
  { match: (p) => p === '연결 관리' || p === '연결 범위', questions: ['GitHub 연결은 어떻게 추가해요?', '연결 테스트 결과는 어떻게 읽어요?'] },
  { match: (p) => p === '스캔 이력' || p === '스캔 상세', questions: ['스캔은 어떻게 시작해요?'] },
  { match: (p) => p === '키 형식 등록', questions: ['사내 키 형식은 어떻게 등록해요?'] },
  { match: (p) => p === '컴플라이언스', questions: ['컴플라이언스 점검은 어떻게 시작해요?'] },
  { match: (p) => ['요약', '취약점 관리', 'Finding 목록', '워크로드', '스캔'].includes(p), questions: ['Log4Shell 같은 취약점이 터지면 무엇부터 봐요?', 'CVE-2021-44228 우리 영향 있어?','취약점 스캔은 어떻게 요청해요?', 'Finding 검토는 어떻게 저장해요?'] },
]

/** 답 아래 근거 목록은 기본으로 접어 두고, 이 문구를 눌러 펼친다 */
export function sourcesToggleLabel(count: number): string {
  return `근거 ${count}개 보기`
}

export function suggestedQuestions(page: string): string[] {
  const found = suggestions.find((entry) => entry.match(page))
  return found ? found.questions : ['대응 건은 어떻게 만들어요?', '로그아웃은 어디서 해요?']
}

export const helpErrorMessages: Record<string, string> = {
  QUESTION_REJECTED: '키나 토큰처럼 보이는 값이 있어 보내지 않았어요. 값을 지우고 다시 물어봐 주세요.',
  NOT_CONFIGURED: '도움말 챗봇이 아직 준비되지 않았어요.',
  DAILY_LIMIT: '오늘 질문 한도를 모두 썼어요. 내일 다시 이용해 주세요.',
  BUSY: '이전 질문에 답하는 중이에요. 잠시 후 다시 보내 주세요.',
  INVALID_INPUT: `질문은 1~${HELP_QUESTION_MAX}자로 입력해 주세요.`,
}

export function loadHelpMessages(): HelpMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(parsed)) return []
    return (parsed as HelpMessage[]).slice(-40).map((message) => {
      if (message === null || typeof message !== 'object') return message
      const { impactCve, impactCves, incidentName, incidentStatus, ...rest } = message
      const cves = [...(Array.isArray(impactCves) ? impactCves : []), impactCve]
        .map(usableCve)
        .filter((cve): cve is string => cve !== undefined)
        .slice(0, MAX_IMPACT_CVES)
      const name = INCIDENT_ALIASES.find((entry) => entry.name === incidentName)?.name
      return {
        ...rest,
        ...(cves.length ? { impactCves: cves } : {}),
        ...(name ? { incidentName: name } : {}),
        ...(incidentStatus === true ? { incidentStatus: true } : {}),
      }
    })
  } catch {
    return []
  }
}

export function saveHelpMessages(messages: HelpMessage[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)))
  } catch {
    // 저장소를 쓸 수 없으면 이번 화면에서만 유지한다
  }
}

export function clearHelpMessages(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // 무시
  }
}
