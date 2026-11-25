// 파트 리포트 API 모양 (dashboard-backend com.logssey.report)

export type ReportPart = 'IAC' | 'SECRET' | 'VULNERABILITY' | 'RUNTIME'
export type ReportSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNASSESSED'

export interface ReportItem {
  label: string
  value: string
}

export interface ReportLink {
  label: string
  url: string
}

export interface ReportFinding {
  id: string
  title: string
  severity: ReportSeverity
  response: string | null
  asset: string | null
  location: string | null
  evidence: string | null
  foundAt: string | null
  dueAt: string | null
  dueDefault: boolean
  assignee: string | null
  action: string | null
  link: string | null
}

/** 공통 조치 하나. findingIds 는 이 조치로 해결되는 취약점. rank 는 해결하는 취약점이 많은 순 */
export interface ReportRemediationAction {
  rank: number
  title: string
  how: string
  impact: string | null
  link: string | null
  findingIds: string[]
}

export interface ReportAdvice {
  status: 'GENERATED' | 'DISABLED' | 'FAILED'
  reason: string | null
  model: string | null
  request: string | null
  /** 핵심 요약 불릿 */
  points: string[]
  items: Array<{ title: string; why: string; steps: string[] }>
  generatedAt: string | null
}

export interface ReportContent {
  name: string
  part: ReportPart
  periodFrom: string
  periodTo: string
  createdAt: string
  createdBy: string
  overview: {
    /** false 면 파트 데이터가 아직 연결되지 않은 리포트 (빈칸은 0건이 아님) */
    connected: boolean
    dataAsOf: string | null
    stale: boolean
    headline: string
    keyMetric: { label: string; value: number } | null
    newInPeriod: number | null
    resolvedInPeriod: number | null
    note: string | null
  }
  vulnerabilities: {
    unit: string
    severityCounts: Partial<Record<ReportSeverity, number>>
    overdue: number
    dueSoon: number
    byDefault: number
    findings: ReportFinding[]
  }
  remediation: { actions: ReportRemediationAction[]; advice: ReportAdvice }
  priorities: Array<{ rank: number; finding: ReportFinding; overdue: boolean }>
  appendix: { scope: ReportItem[]; criteria: string[]; links: ReportLink[] }
}

export interface ReportDetail {
  reportId: number
  content: ReportContent
  /** 취약점별로 이미 만든 AI 대응 방법 (finding ID → 대응 방법) */
  findingAdvice: Record<string, ReportAdvice>
}

export interface ReportListItem {
  reportId: number
  part: ReportPart
  name: string
  periodFrom: string
  periodTo: string
  critical: number
  overdue: number
  connected: boolean
  createdAt: string
  createdBy: string
}

export interface ReportOptions {
  connectedParts: ReportPart[]
  aiEnabled: boolean
}

export interface CreateReportRequest {
  name: string | null
  periodFrom: string
  periodTo: string
  parts: ReportPart[]
  aiRequest: string | null
}
