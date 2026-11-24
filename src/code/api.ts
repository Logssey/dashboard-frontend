import { apiRequest } from '@/api/client'
import type { CodeOverview } from './types'

export function fetchCodeOverview() {
  return apiRequest<CodeOverview>('/api/v1/code/findings')
}

/** 인쇄용 단독 HTML (브라우저 인쇄 메뉴에서 PDF로 저장) */
export const CODE_REPORT_URL = '/api/v1/code/report'
