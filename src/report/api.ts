import { apiRequest } from '@/api/client'
import type { CreateReportRequest, ReportAdvice, ReportDetail, ReportListItem, ReportOptions } from './types'

export function fetchReportOptions() {
  return apiRequest<ReportOptions>('/api/v1/reports/options')
}

export function fetchReports() {
  return apiRequest<ReportListItem[]>('/api/v1/reports')
}

export function fetchReport(reportId: number) {
  return apiRequest<ReportDetail>(`/api/v1/reports/${reportId}`)
}

/** 고른 파트마다 리포트가 하나씩 만들어진다 */
export function createReport(request: CreateReportRequest) {
  return apiRequest<{ reportIds: number[] }>('/api/v1/reports', { method: 'POST', body: JSON.stringify(request) })
}

/** 취약점 한 건의 AI 대응 방법. 이미 만든 것이 있으면 그대로 돌려준다 */
export function adviseFinding(reportId: number, findingId: string) {
  return apiRequest<ReportAdvice>(`/api/v1/reports/${reportId}/findings/${encodeURIComponent(findingId)}/advice`, { method: 'POST' })
}

/** 목록에서 숨긴다 (본문은 비우고 삭제 기록은 남김) */
export function deleteReport(reportId: number) {
  return apiRequest<void>(`/api/v1/reports/${reportId}`, { method: 'DELETE' })
}

/** 인쇄용 단독 HTML. 새 탭에서 열어 브라우저 인쇄 메뉴로 PDF 저장 */
export function reportPrintUrl(reportId: number) {
  return `/api/v1/reports/${reportId}/print`
}
