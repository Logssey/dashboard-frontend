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

export function askHelp(question: string, page: string, history: HelpTurn[], mode?: HelpMode): Promise<HelpChatResponse> {
  return apiRequest<HelpChatResponse>('/api/v1/help/chat', {
    method: 'POST',
    body: JSON.stringify(mode ? { question, page, history, mode } : { question, page, history }),
  })
}
