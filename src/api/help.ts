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

export interface HelpChatResponse {
  answer: string
  grounded: boolean
  sources: HelpSource[]
  remainingToday: number
  cached: boolean
}

export interface HelpStatus {
  ready: boolean
  reasonCode: string
  documentCount: number
}

export function fetchHelpStatus(): Promise<HelpStatus> {
  return apiRequest<HelpStatus>('/api/v1/help/status')
}

export function askHelp(question: string, page: string, history: HelpTurn[]): Promise<HelpChatResponse> {
  return apiRequest<HelpChatResponse>('/api/v1/help/chat', {
    method: 'POST',
    body: JSON.stringify({ question, page, history }),
  })
}
