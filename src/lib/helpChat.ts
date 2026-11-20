import type { HelpSource, HelpTurn } from '@/api/help'

export const HELP_QUESTION_MAX = 500
const HISTORY_MESSAGES = 6
const STORAGE_KEY = 'logssey.help.chat'

export interface HelpMessage {
  role: 'user' | 'assistant'
  text: string
  grounded?: boolean
  sources?: HelpSource[]
  error?: boolean
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
  { match: (p) => ['요약', '취약점 관리', 'Finding 목록', '워크로드', '스캔'].includes(p), questions: ['Log4Shell 같은 취약점이 터지면 무엇부터 봐요?', '취약점 스캔은 어떻게 요청해요?', 'Finding 검토는 어떻게 저장해요?'] },
]

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
    return Array.isArray(parsed) ? (parsed as HelpMessage[]).slice(-40) : []
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
