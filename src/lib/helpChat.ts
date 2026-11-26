import type { CveImpact, HelpCard, HelpReportDraft, HelpSource, HelpTurn, IncidentSource, IncidentStatus } from '@/api/help'

export const HELP_QUESTION_MAX = 1000
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
  /** 정해진 낱말로 고른 사고 유형 키 (INCIDENT_TYPES) */
  incidentTypes?: string[]
  /** 보내기 전에 고객 정보를 가렸다 (설계 문서 18.1) */
  masked?: boolean
  /** AI 연결이 안 돼 대응 절차 문서의 고정 10단계로 만든 답 (설계 문서 18.7) */
  withoutAi?: boolean
}

/**
 * 현황 상자에 보일 줄 묶음. "의심스러운 시도"와 "활발한 키"를 늘 맨 위에 둔다 (빨리 보이도록).
 * 값은 서버 조회 값 그대로이고, 불러오지 못한 묶음은 note로 바꾼다.
 */
export function incidentRows(status: IncidentStatus): Array<{ title: string; rows: Array<[string, string]>; note?: string }> {
  const missing = (source: IncidentSource) => status.unavailable.find((item) => item.source === source)
  const noteFor = (source: IncidentSource) => (missing(source)?.denied ? '볼 권한이 없어요' : '불러오지 못했어요')
  const groups: Array<{ title: string; rows: Array<[string, string]>; note?: string }> = []
  const { runtime, keys, exposure, vuln } = status
  groups.push(
    runtime
      ? {
          title: '의심스러운 시도 (런타임)',
          rows: [
            ['검토 안 한 탐지', `${runtime.unreviewedFindings}건`],
            ['영향 워크로드', `${runtime.affectedWorkloads}개`],
            ...runtime.topRules.map((rule): [string, string] => [rule.title, `${rule.count}건`]),
            ['센서 (정상 / 전체)', `${runtime.sensors.healthy} / ${runtime.sensors.healthy + runtime.sensors.degraded + runtime.sensors.offline + runtime.sensors.unknown}`],
          ],
        }
      : { title: '의심스러운 시도 (런타임)', rows: [], note: noteFor('runtime') },
    keys
      ? {
          title: '활발한 키 (시크릿)',
          rows: [
            ['살아 있는(유효한) 키 대응 건', `${keys.validKeyCases}건`],
            ['실키 경고', `${keys.crossEnvironmentAlerts}건`],
            ...(keys.reviewRequiredLocations !== null ? [['확인 필요 노출 위치', `${keys.reviewRequiredLocations}곳`] as [string, string]] : []),
            ...(exposure ? [['IaC State 속 실제 시크릿', `${exposure.stateSecrets}개`] as [string, string]] : []),
          ],
        }
      : { title: '활발한 키 (시크릿)', rows: [], note: noteFor('keys') },
    exposure
      ? {
          title: '바깥에서 닿는 경로·바뀐 설정 (IaC)',
          rows: [
            ['열린 공격 경로', `${exposure.openPaths}개`],
            ['그중 1순위', `${exposure.tier1OpenPaths}개`],
            ['실제 드리프트', `${exposure.drifts}건`],
          ],
        }
      : { title: '바깥에서 닿는 경로·바뀐 설정 (IaC)', rows: [], note: noteFor('exposure') },
    vuln
      ? {
          title: '열린 취약점',
          rows: [
            ['실행 중 + 호출 가능 (Critical·High)', `${vuln.runningReachableSevere}건`],
            ['실행 중 + 호출 가능 (전체)', `${vuln.runningReachable}건`],
            ...(vuln.unscannedRunning !== null ? [['검사 없는 실행 중 워크로드', `${vuln.unscannedRunning}개`] as [string, string]] : []),
          ],
        }
      : { title: '열린 취약점', rows: [], note: noteFor('vuln') },
  )
  return groups
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
  /뚫렸|뚫린|뚫려|해킹|침해|침입|사고|터졌|터진|랜섬|유출|새어\s*나|털렸|탈취|공격|악성|이상한\s*(접속|프로그램|트래픽|로그인|프로세스)|감염|채굴|웹\s*셸|breach|hacked|ransom|compromis|incident/i

/** 보안사고 이야기인지 (정해진 낱말로만 판단한다). 맞으면 "지금 우리 환경 현황" 상자를 붙인다 */
export function looksLikeIncident(text: string): boolean {
  return INCIDENT_WORDS.test(text) || INCIDENT_ALIASES.some((entry) => entry.match.test(text))
}

/**
 * 사고 유형 (설계 문서 15장). 정해진 낱말로만 고른다. 여러 개가 맞으면 모두 쓴다.
 * 유형은 "현황" 상자에서 어떤 항목을 위로 올릴지만 바꾼다. 확인 항목을 빼지는 않는다.
 */
export const INCIDENT_TYPES = Object.freeze([
  { key: 'key', label: '키·비밀 유출', match: /키|토큰|비밀번호|패스워드|자격\s*증명|시크릿|credential|secret|access\s*key|api\s*key/i },
  { key: 'account', label: '계정·권한 탈취', match: /계정|권한|로그인|관리자|탈취|\biam\b|\broot\b/i },
  { key: 'ransomware', label: '랜섬웨어·서비스 피해', match: /랜섬|ransom|암호화\s*됐|서비스.{0,6}(멈|장애|다운|중단)/i },
  { key: 'cloud', label: '클라우드 설정 노출', match: /버킷|\bs3\b|보안\s*그룹|security\s*group|공개\s*(설정|됐)|설정.{0,4}(노출|바뀌|변경)|클라우드/i },
  { key: 'web', label: '웹·취약점 공격', match: /취약점|cve|\brce\b|원격\s*코드|웹\s*셸|인젝션|\bsql\b|\bxss\b|터졌|터진|exploit/i },
  { key: 'intrusion', label: '서버 침입·이상 행위', match: /뚫렸|뚫린|뚫려|해킹|침입|침해|이상한|채굴|악성|감염|프로세스|hacked|breach|compromis/i },
] as const)

export type IncidentType = (typeof INCIDENT_TYPES)[number]['key']

export function incidentTypes(text: string): IncidentType[] {
  const found: IncidentType[] = INCIDENT_TYPES.filter((type) => type.match.test(text)).map((type) => type.key)
  if (INCIDENT_ALIASES.some((entry) => entry.match.test(text)) && !found.includes('web')) found.push('web')
  return found
}

export function incidentTypeLabel(type: string): string | undefined {
  return INCIDENT_TYPES.find((entry) => entry.key === type)?.label
}

export interface IncidentPriority {
  text: string
  /** HELP_SCREEN_ROUTES 키. OUTSIDE면 버튼 없음 */
  screen: string
  /** 사고 유형에 따라 위로 올릴 때 쓰는 항목 종류 */
  topic: 'isolate' | 'evidence' | 'blind' | 'key' | 'exposure' | 'vuln' | 'config' | 'coverage'
}

/** 사고 유형별로 위로 올릴 항목 종류. 격리(랜섬웨어)·공격 흔적·볼 수 없는 곳은 늘 맨 위다 */
const TYPE_TOPICS: Record<IncidentType, IncidentPriority['topic'][]> = {
  key: ['key'],
  account: ['config', 'key'],
  ransomware: [],
  cloud: ['exposure', 'config', 'key'],
  web: ['vuln', 'exposure'],
  intrusion: ['key', 'exposure'],
}

const SOURCE_NAMES: Record<IncidentSource, { name: string; screen: string; check: string }> = {
  runtime: { name: '런타임 탐지를', screen: 'RUNTIME', check: '5번' },
  keys: { name: '시크릿 키 현황을', screen: 'SECRET_FINDINGS', check: '7번' },
  exposure: { name: 'IaC 공격 경로를', screen: 'IAC', check: '4·6번' },
  vuln: { name: '취약점 데이터를', screen: 'VULN_FINDINGS', check: '2·4번' },
}

/**
 * "먼저 볼 것" (설계 문서 15장, 대응 절차 문서 "상황별로 먼저 볼 것").
 * 실제 숫자로 정해진 규칙에 따라 순서를 매긴다. AI가 정하지 않는다.
 * 기본 순서: 공격 흔적 → 볼 수 없는 곳 → 살아 있는 키 → 바깥에서 닿는 경로 → 열린 취약점 → 바뀐 설정 → 빠진 곳 → 늘 확인할 것.
 * 사고 유형이 있으면 그 유형의 항목을 공격 흔적·볼 수 없는 곳 바로 다음으로 올린다.
 */
export function incidentPriorities(status: IncidentStatus, types: readonly string[] = []): IncidentPriority[] {
  const list: IncidentPriority[] = []
  const { runtime, keys, exposure, vuln } = status

  if (types.includes('ransomware')) {
    list.push({
      text: '피해가 번지지 않게 영향 받은 서버를 먼저 격리하고 바깥 접근을 막으세요. Logssey는 차단하지 않아요 (6번, Logssey 밖).',
      screen: 'OUTSIDE',
      topic: 'isolate',
    })
  }
  if (runtime) {
    if (runtime.unreviewedFindings > 0) {
      const rules = runtime.topRules.map((rule) => `${rule.title} ${rule.count}건`).join(', ')
      list.push({
        text: `의심스러운 시도: 검토하지 않은 런타임 탐지 ${runtime.unreviewedFindings}건(영향 워크로드 ${runtime.affectedWorkloads}개)${rules ? ` — ${rules}` : ''}. 이미 뚫렸는지부터 보세요 (5번).`,
        screen: 'RUNTIME',
        topic: 'evidence',
      })
    }
    const sensorTotal = runtime.sensors.healthy + runtime.sensors.degraded + runtime.sensors.offline + runtime.sensors.unknown
    if (runtime.sensors.healthy === 0) {
      list.push({
        text: `${sensorTotal === 0 ? '연결된 런타임 센서가 없어' : '정상인 런타임 센서가 없어'} Logssey로는 침해 흔적을 볼 수 없어요. 웹 서버 접근 로그와 클라우드 감사 로그를 먼저 확인하세요 (Logssey 밖).`,
        screen: 'OUTSIDE',
        topic: 'blind',
      })
    } else if (runtime.sensors.offline + runtime.sensors.degraded > 0) {
      list.push({
        text: `꺼졌거나 불안정한 센서가 ${runtime.sensors.offline + runtime.sensors.degraded}개 있어요. 그 노드는 탐지가 비어 있을 수 있어요.`,
        screen: 'RUNTIME',
        topic: 'blind',
      })
    }
  }
  if (keys) {
    if (keys.validKeyCases > 0 || keys.crossEnvironmentAlerts > 0) {
      const parts = [
        keys.validKeyCases > 0 ? `살아 있는(유효한) 키 대응 건 ${keys.validKeyCases}건` : '',
        keys.crossEnvironmentAlerts > 0 ? `실키 경고 ${keys.crossEnvironmentAlerts}건` : '',
      ].filter(Boolean)
      list.push({ text: `활발한 키: ${parts.join(', ')}. 쓰이기 전에 교체하세요 (7번).`, screen: 'SECRET_CASES', topic: 'key' })
    }
    if (keys.reviewRequiredLocations) {
      list.push({
        text: `확인이 필요한 키 노출 위치 ${keys.reviewRequiredLocations}곳이 있어요. 뚫린 서버와 관련된 키가 있는지 보세요 (7번).`,
        screen: 'SECRET_FINDINGS',
        topic: 'key',
      })
    }
  }
  if (exposure) {
    if (exposure.stateSecrets > 0) {
      list.push({ text: `IaC State 속 실제 시크릿 ${exposure.stateSecrets}개가 있어요. 교체 대상에 넣으세요 (7번).`, screen: 'IAC', topic: 'key' })
    }
    if (exposure.openPaths > 0) {
      list.push({
        text: `바깥에서 닿는 공격 경로 ${exposure.openPaths}개(가장 위험한 1순위 ${exposure.tier1OpenPaths}개)가 열려 있어요. 막을 곳을 정하세요 (4·6번).`,
        screen: 'IAC',
        topic: 'exposure',
      })
    }
  }
  if (vuln) {
    if (vuln.runningReachableSevere > 0) {
      list.push({
        text: `실행 중이면서 호출 가능한 Critical·High Finding ${vuln.runningReachableSevere}건이 있어요. 바깥에서 닿는지 보고 고치세요 (4·9번).`,
        screen: 'VULN_FINDINGS',
        topic: 'vuln',
      })
    } else if (vuln.runningReachable > 0) {
      list.push({ text: `실행 중이면서 호출 가능한 Finding ${vuln.runningReachable}건을 확인하세요 (4번).`, screen: 'VULN_FINDINGS', topic: 'vuln' })
    }
  }
  if (exposure && exposure.drifts > 0) {
    list.push({
      text: `실제 드리프트 ${exposure.drifts}건: 코드와 다르게 바뀐 설정이에요. 사고 뒤에 바뀐 것인지 보세요 (8번).`,
      screen: 'IAC',
      topic: 'config',
    })
  }
  if (vuln?.unscannedRunning) {
    list.push({
      text: `검사 없는 실행 중 워크로드 ${vuln.unscannedRunning}개는 위 숫자에 빠져 있어요. 먼저 검사하세요 (3번).`,
      screen: 'VULN_WORKLOADS',
      topic: 'coverage',
    })
  }
  for (const missing of status.unavailable) {
    const source = SOURCE_NAMES[missing.source]
    list.push({
      text: `${source.name} ${missing.denied ? '볼 권한이 없어요. 담당자에게 확인을 부탁하세요' : '불러오지 못했어요. 화면에서 직접 보세요'} (${source.check}).`,
      screen: source.screen,
      // 키 현황을 못 보면 그 항목이 키 확인을 대신한다 (같은 화면 버튼이 두 번 나오지 않게)
      topic: missing.source === 'runtime' ? 'blind' : missing.source === 'keys' ? 'key' : 'coverage',
    })
  }
  list.push({ text: '새로 실패한 점검이나 바뀐 계정·권한·설정이 없는지 보세요 (8번).', screen: 'COMPLIANCE', topic: 'config' })
  if (!list.some((item) => item.topic === 'key')) {
    list.push({ text: '뚫린 서버가 쓰던 키·비밀을 찾아 교체 대응 건을 만드세요 (7번).', screen: 'SECRET_FINDINGS', topic: 'key' })
  }

  const boosted = types.flatMap((type) => TYPE_TOPICS[type as IncidentType] ?? [])
  const rank = (item: IncidentPriority) => {
    if (item.topic === 'isolate') return 0
    if (item.topic === 'evidence') return 1
    if (item.topic === 'blind') return 2
    const boost = boosted.indexOf(item.topic)
    return boost >= 0 ? 3 + boost / 10 : 4
  }
  return list
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
    .map(({ item }) => item)
}

/** 저장소에서 읽은 값도 정확한 CVE 모양일 때만 조회에 쓴다 */
export function usableCve(value: unknown): string | undefined {
  return typeof value === 'string' && CVE_EXACT.test(value) ? value : undefined
}

/** 영향 조회 결과를 사람이 읽는 줄로 바꾼다. 숫자는 서버 조회 값 그대로이고 AI가 만든 문장이 아니다 */
export function impactLines(impact: CveImpact): { rows: Array<[string, string]>; notes: string[] } {
  const rows: Array<[string, string]> = [
    ['취약점 전체', `${impact.total}건`],
    ['실행 중인 곳', `${impact.running}건`],
    ['호출 가능 판정', `${impact.reachable}건`],
    ['실행 중 + 호출 가능', `${impact.runningReachable}건`],
  ]
  if (impact.unscannedRunning !== null) rows.push(['검사 없는 실행 중 워크로드', `${impact.unscannedRunning}개`])
  const notes: string[] = []
  if (impact.runningReachable > 0) notes.push('실행 중이면서 호출 가능한 취약점부터 처리하세요.')
  if (impact.total === 0) notes.push('0건이라고 안전하다는 뜻은 아니에요. 검사하지 않은 이미지는 목록에 나오지 않아요.')
  if (impact.unscannedRunning) notes.push('검사 없는 워크로드는 이 숫자에 빠져 있어요. 워크로드 화면에서 먼저 검사하세요.')
  if (impact.basis === 'LATEST') notes.push('실행 중 정보가 없어 최신 검사 기준으로 셌어요.')
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
  VULN_SUMMARY: { path: '/vulnerabilities', title: '이미지 보안' },
  VULN_FINDINGS: { path: '/vulnerabilities/findings', title: '취약점 목록' },
  VULN_WORKLOADS: { path: '/vulnerabilities/workloads', title: '실행 중 워크로드' },
  VULN_SCANS: { path: '/vulnerabilities/scans', title: '이미지 검사' },
  RUNTIME: { path: '/runtime', title: '런타임 보안' },
  IAC: { path: '/iac', title: 'IaC 보안' },
  SECRET_FINDINGS: { path: '/secrets/findings', title: '발견된 키' },
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
// 이미지 다이제스트(sha256: + 64자 16진수)와 커밋 해시(40자 16진수)는 공개 식별자라 키로 보지 않는다 (서버와 같은 규칙)
const PUBLIC_HASHES = /(?<![A-Za-z0-9+/_=-])(?:sha256:[0-9a-fA-F]{64}|[0-9a-fA-F]{40})(?![A-Za-z0-9+/_=-])/g

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
  for (const match of text.replace(PUBLIC_HASHES, ' ').matchAll(LONG_TOKEN)) {
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
      // 예전에 저장된 대화에 고객 정보가 남아 있어도 다시 보낼 때 가린다 (설계 문서 18.1)
      pairs.push({ role: 'user', text: maskPrivate(user.text) }, { role: 'assistant', text: maskPrivate(assistant.text) })
      i++
    }
  }
  return pairs.slice(-HISTORY_MESSAGES)
}

const suggestions: Array<{ match: (page: string) => boolean; questions: string[] }> = [
  { match: (p) => p === '통합 현황', questions: ['환경별로 보려면 어떻게 해요?', '위험 기준 점수는 어떻게 계산돼요?'] },
  { match: (p) => p === '발견된 키' || p === '키 상세', questions: ['CSV로 내보내려면 어떻게 해요?', '키 유효성 확인은 어떻게 해요?'] },
  { match: (p) => ['확인 대기열', '위치 확인', '추가 조사', '실키 경고'].includes(p), questions: ['대응 건은 어떻게 만들어요?', '추가 조사는 어떻게 종료해요?'] },
  { match: (p) => p === '대응 관리' || p === '대응 상세', questions: ['담당자는 어떻게 바꿔요?', '대응 건을 해결로 바꾸려면?'] },
  { match: (p) => p === '연결 및 설정' || p === '연결 범위', questions: ['GitHub 연결은 어떻게 추가해요?', '연결 테스트 결과는 어떻게 읽어요?'] },
  { match: (p) => p === '검사 이력' || p === '검사 상세', questions: ['검사는 어떻게 시작해요?'] },
  { match: (p) => p === '키 형식 등록', questions: ['사내 키 형식은 어떻게 등록해요?'] },
  { match: (p) => p === '컴플라이언스', questions: ['컴플라이언스 점검은 어떻게 시작해요?', 'ISMS-P 2.11.2는 어디서 증적을 봐요?'] },
  { match: (p) => ['요약', '현황', '이미지 보안', '취약점 목록', '워크로드', '실행 중 워크로드', '검사', '이미지 검사', '검사 기준', '이미지 취약점 상세'].includes(p), questions: ['Log4Shell 같은 취약점이 터지면 무엇부터 봐요?', 'CVE-2021-44228 우리 영향 있어?','취약점 검사는 어떻게 요청해요?', 'Finding 검토는 어떻게 저장해요?'] },
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
  MEMO_INVALID: '조치 메모는 1~1500자로 입력해 주세요.',
  REPORT_BLOCKED: '초안을 만들지 못했어요. 메모를 조금 고쳐 다시 시도해 주세요.',
}

export function loadHelpMessages(): HelpMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(parsed)) return []
    return (parsed as HelpMessage[]).slice(-40).map((message) => {
      if (message === null || typeof message !== 'object') return message
      const { impactCve, impactCves, incidentName, incidentStatus, incidentTypes: storedTypes, masked, withoutAi, ...rest } = message
      const types = Array.isArray(storedTypes)
        ? [...new Set(storedTypes.filter((type) => INCIDENT_TYPES.some((entry) => entry.key === type)))]
        : []
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
        ...(incidentStatus === true && types.length ? { incidentTypes: types } : {}),
        ...(masked === true ? { masked: true } : {}),
        ...(withoutAi === true ? { withoutAi: true } : {}),
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
    sessionStorage.removeItem(SIGNALS_KEY)
  } catch {
    // 무시
  }
}

/**
 * 새 보안 신호 알림 (설계 문서 16장). 화면에 보이는 숫자만 비교하고 AI는 쓰지 않는다.
 * 이 탭에서 마지막으로 "확인했어요"를 누른 때의 숫자(기준)와 지금 숫자를 비교한다.
 */
const SIGNALS_KEY = 'logssey.help.signals.seen'

/** 비교에 쓰는 숫자. 불러오지 못한 곳은 null이고 그 신호는 비교하지 않는다 */
export interface SignalSnapshot {
  runtimeUnreviewed: number | null
  sensorsHealthy: number | null
  sensorsTotal: number | null
  validKeys: number | null
  crossAlerts: number | null
  severeReachable: number | null
  tier1Paths: number | null
  drifts: number | null
}

export function signalSnapshot(status: IncidentStatus): SignalSnapshot {
  const sensors = status.runtime?.sensors
  return {
    runtimeUnreviewed: status.runtime ? status.runtime.unreviewedFindings : null,
    sensorsHealthy: sensors ? sensors.healthy : null,
    sensorsTotal: sensors ? sensors.healthy + sensors.degraded + sensors.offline + sensors.unknown : null,
    validKeys: status.keys ? status.keys.validKeyCases : null,
    crossAlerts: status.keys ? status.keys.crossEnvironmentAlerts : null,
    severeReachable: status.vuln ? status.vuln.runningReachableSevere : null,
    tier1Paths: status.exposure ? status.exposure.tier1OpenPaths : null,
    drifts: status.exposure ? status.exposure.drifts : null,
  }
}

/**
 * 처음 보는 탭의 기준. 런타임 탐지와 살아 있는 키는 "지금 처리할 일"이라 0을 기준으로 두어 처음에도 알린다.
 * 센서·취약점·공격 경로·드리프트는 원래 있던 숫자를 기준으로 두어, 늘어날 때만 알린다.
 */
export function firstSeenBaseline(current: SignalSnapshot): SignalSnapshot {
  return { ...current, runtimeUnreviewed: current.runtimeUnreviewed === null ? null : 0, validKeys: current.validKeys === null ? null : 0, crossAlerts: current.crossAlerts === null ? null : 0 }
}

export interface IncidentSignal {
  kind: 'runtime' | 'keys' | 'sensors' | 'exposure'
  text: string
  /** HELP_SCREEN_ROUTES 키 */
  screen: string
}

const grew = (now: number | null, before: number | null) => now !== null && before !== null && now > before

/** 기준보다 나빠진 것만 신호로 만든다. 순서: 의심스러운 시도 → 활발한 키 → 센서 → 위험한 노출 */
export function incidentSignals(seen: SignalSnapshot, now: SignalSnapshot): IncidentSignal[] {
  const signals: IncidentSignal[] = []
  if (grew(now.runtimeUnreviewed, seen.runtimeUnreviewed)) {
    signals.push({
      kind: 'runtime',
      text: `새 런타임 탐지(의심스러운 시도) ${now.runtimeUnreviewed! - seen.runtimeUnreviewed!}건 — 검토 안 한 탐지 모두 ${now.runtimeUnreviewed}건`,
      screen: 'RUNTIME',
    })
  }
  const keyParts = [
    grew(now.validKeys, seen.validKeys) ? `살아 있는 키 대응 건 +${now.validKeys! - seen.validKeys!}` : '',
    grew(now.crossAlerts, seen.crossAlerts) ? `실키 경고 +${now.crossAlerts! - seen.crossAlerts!}` : '',
  ].filter(Boolean)
  if (keyParts.length) signals.push({ kind: 'keys', text: `활발한 키: ${keyParts.join(', ')}`, screen: 'SECRET_CASES' })
  if (now.sensorsHealthy !== null && seen.sensorsHealthy !== null && now.sensorsHealthy < seen.sensorsHealthy) {
    signals.push({
      kind: 'sensors',
      text: `정상 런타임 센서가 ${seen.sensorsHealthy}개에서 ${now.sensorsHealthy}개로 줄었어요. 그동안 침해 흔적을 볼 수 없어요`,
      screen: 'RUNTIME',
    })
  }
  const exposureParts = [
    grew(now.severeReachable, seen.severeReachable) ? `실행 중+호출 가능 Critical·High +${now.severeReachable! - seen.severeReachable!}` : '',
    grew(now.tier1Paths, seen.tier1Paths) ? `1순위 공격 경로 +${now.tier1Paths! - seen.tier1Paths!}` : '',
    grew(now.drifts, seen.drifts) ? `드리프트 +${now.drifts! - seen.drifts!}` : '',
  ].filter(Boolean)
  if (exposureParts.length) {
    signals.push({
      kind: 'exposure',
      text: `위험한 노출 증가: ${exposureParts.join(', ')}`,
      screen: grew(now.severeReachable, seen.severeReachable) ? 'VULN_FINDINGS' : 'IAC',
    })
  }
  return signals
}

/** 마지막으로 신호를 확인한 시각 (예: "14:05"). 패널의 "지금 확인" 옆에 보인다 */
export function signalCheckTime(epochMs: number): string {
  const time = new Date(epochMs)
  return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
}

const SIGNAL_SITUATIONS: Record<IncidentSignal['kind'], string> = {
  runtime: '이상한 접속이나 프로그램 실행 같은 런타임 탐지',
  keys: '살아 있는 키가 새어 나간 것 같은 신호',
  sensors: '런타임 센서가 꺼진 것',
  exposure: '바깥에서 닿는 위험한 노출이 늘어난 것',
}

/** "대응 순서 물어보기"로 보낼 질문. 신호 종류만 말로 쓰고 숫자는 넣지 않는다 (숫자는 AI에 보내지 않는다) */
export function signalQuestion(signals: IncidentSignal[]): string {
  const situations = [...new Set(signals.map((signal) => SIGNAL_SITUATIONS[signal.kind]))]
  return `보안 사고 신호가 떴어요: ${situations.join(', ')}. 무엇부터 봐야 해요?`
}

const SNAPSHOT_FIELDS: Array<keyof SignalSnapshot> = [
  'runtimeUnreviewed', 'sensorsHealthy', 'sensorsTotal', 'validKeys', 'crossAlerts', 'severeReachable', 'tier1Paths', 'drifts',
]

export function loadSeenSignals(): SignalSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SIGNALS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed === null || typeof parsed !== 'object') return null
    const snapshot = {} as SignalSnapshot
    for (const field of SNAPSHOT_FIELDS) {
      const value = parsed[field]
      snapshot[field] = typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
    }
    return snapshot
  } catch {
    return null
  }
}

export function saveSeenSignals(snapshot: SignalSnapshot): void {
  try {
    sessionStorage.setItem(SIGNALS_KEY, JSON.stringify(snapshot))
  } catch {
    // 저장소를 쓸 수 없으면 이번 화면에서만 유지한다
  }
}

/**
 * 고객 정보 가리기 (설계 문서 18.1). 서버(HelpPrivacyMask)와 같은 규칙을 브라우저에서 먼저 적용한다.
 * 질문과 다시 보내는 최근 대화 모두에 쓴다.
 */
const PRIVACY_RULES: Array<[RegExp, string]> = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[이메일]'],
  // 글자에 붙은 숫자(해시·토큰·다이제스트 안)는 가리지 않는다
  [/(?<![0-9A-Za-z])\d{6}\s?-\s?[1-8]\d{6}(?![0-9A-Za-z])/g, '[주민번호]'],
  [/(?<![0-9A-Za-z])(?:\d{4}[ -]?){3}\d{4}(?![0-9A-Za-z])/g, '[카드번호]'],
  [/(?<![0-9.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\/\d{1,2})?(?![0-9.])/g, '[IP]'],
  [/(?<![0-9a-z:])(?:(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){1,6}:(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,5})?)(?![0-9a-z:])/gi, '[IP]'],
  [/(?<![0-9A-Za-z])(?:\+82[ -]?1\d|0\d{1,2})[ .-]?\d{3,4}[ .-]?\d{4}(?![0-9A-Za-z])/g, '[전화번호]'],
]

export function maskPrivate(text: string): string {
  return PRIVACY_RULES.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text)
}

/**
 * AI에 넘기는 예/아니오 신호 (설계 문서 18.3). 숫자·이름은 넘기지 않는다. 불러오지 못한 곳은 빼서 "모름"으로 둔다.
 * 키 이름은 서버 HelpSignals.LABELS와 같다.
 */
export function signalsForAI(status: IncidentStatus | undefined | null): Record<string, boolean> {
  const signals: Record<string, boolean> = {}
  if (!status) return signals
  if (status.runtime) {
    signals.runtimeUnreviewed = status.runtime.unreviewedFindings > 0
    signals.sensorsDown = status.runtime.sensors.healthy === 0
  }
  if (status.keys) {
    signals.liveKeys = status.keys.validKeyCases > 0 || status.keys.crossEnvironmentAlerts > 0
    signals.keyExposure = (status.keys.reviewRequiredLocations ?? 0) > 0 || (status.exposure?.stateSecrets ?? 0) > 0
  }
  if (status.exposure) {
    signals.openPaths = status.exposure.tier1OpenPaths > 0
    signals.drifts = status.exposure.drifts > 0
  }
  if (status.vuln) {
    signals.severeReachable = status.vuln.runningReachableSevere > 0
    if (status.vuln.unscannedRunning !== null) signals.unscanned = status.vuln.unscannedRunning > 0
  }
  return signals
}

export const REPORT_MEMO_MAX = 1500

/** 입력칸 아래에 늘 보이는 전송 고지 (설계 문서 18.9). 질문과 보고서 메모 모두 */
export const SEND_NOTICE =
  '입력한 내용은 외부 AI(Anthropic)로 전송됩니다. 이름, 호스트 이름, 계정 ID는 자동으로 가려지지 않으니 직접 지우고 보내 주세요.'

/**
 * 보고서 메모를 보내기 전에 보여 줄 내용 (설계 문서 18.9). 실제로 전송될 글(가린 뒤)과, 보낼 수 없는 이유가 있으면 그 코드.
 * 미리보기를 확인해야만 이 글이 그대로 전송된다.
 */
export function reportPreview(memo: string): { notes: string; changed: boolean; error?: 'MEMO_INVALID' | 'QUESTION_REJECTED' } {
  const typed = memo.trim()
  if (!typed || typed.length > REPORT_MEMO_MAX) return { notes: '', changed: false, error: 'MEMO_INVALID' }
  const notes = maskPrivate(typed)
  if (looksLikeSecret(typed) || looksLikeSecret(notes)) return { notes: '', changed: false, error: 'QUESTION_REJECTED' }
  return { notes, changed: notes !== typed }
}

function reportTime(epochMs: number): string {
  const t = new Date(epochMs)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${two(t.getMonth() + 1)}-${two(t.getDate())} ${two(t.getHours())}:${two(t.getMinutes())}`
}

/**
 * 사고 보고서 초안 글 (설계 문서 18.4). 문장은 AI가 메모로 쓴 것, 시각과 숫자는 코드가 Logssey 조회 값으로 채운다.
 * AI 응답에는 숫자를 넣을 자리가 없고, 서버가 메모에 없던 숫자를 막는다.
 */
export function reportText(
  draft: Pick<HelpReportDraft, 'summary' | 'checked' | 'actions' | 'remaining'>,
  status: IncidentStatus | null | undefined,
  statusAt: number | null,
  now: number,
): string {
  const lines = ['보안 사고 대응 기록 (초안)', `작성 시각: ${reportTime(now)} (자동)`, '']
  if (status) {
    lines.push(`Logssey 현황${statusAt ? ` (${reportTime(statusAt)} 조회, 자동)` : ' (자동)'}:`)
    if (status.runtime) {
      const total = status.runtime.sensors.healthy + status.runtime.sensors.degraded + status.runtime.sensors.offline + status.runtime.sensors.unknown
      lines.push(`- 검토 안 한 런타임 탐지 ${status.runtime.unreviewedFindings}건, 정상 런타임 센서 ${status.runtime.sensors.healthy}/${total}`)
    }
    if (status.keys) {
      lines.push(`- 살아 있는 키 대응 건 ${status.keys.validKeyCases}건, 실키 경고 ${status.keys.crossEnvironmentAlerts}건${status.keys.reviewRequiredLocations !== null ? `, 확인 필요 노출 위치 ${status.keys.reviewRequiredLocations}곳` : ''}`)
    }
    if (status.exposure) {
      lines.push(`- 열린 공격 경로 ${status.exposure.openPaths}개(1순위 ${status.exposure.tier1OpenPaths}개), 드리프트 ${status.exposure.drifts}건`)
    }
    if (status.vuln) {
      lines.push(`- 실행 중+호출 가능 Critical·High ${status.vuln.runningReachableSevere}건${status.vuln.unscannedRunning !== null ? `, 검사 없는 실행 중 워크로드 ${status.vuln.unscannedRunning}개` : ''}`)
    }
    const sourceNames: Record<IncidentSource, string> = { runtime: '런타임', keys: '시크릿', exposure: 'IaC', vuln: '취약점' }
    for (const missing of status.unavailable) lines.push(`- ${sourceNames[missing.source]}: ${missing.denied ? '볼 권한 없음' : '불러오지 못함'}`)
    lines.push('')
  }
  lines.push(`요약: ${draft.summary}`, '')
  for (const [title, items] of [['확인한 것', draft.checked], ['조치한 것', draft.actions], ['남은 일', draft.remaining]] as const) {
    lines.push(`${title}:`, ...(items.length ? items.map((item) => `- ${item}`) : ['- (메모에 없음)']), '')
  }
  lines.push('외부 신고: 필요 여부와 기한, 방법은 담당 부서와 확인합니다.')
  lines.push('※ 문장은 AI가 조치 메모로 쓴 초안이고, 시각과 숫자는 Logssey가 채웠습니다. 보내기 전에 꼭 확인하세요.')
  return lines.join('\n')
}
