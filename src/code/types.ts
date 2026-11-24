export type CodeSeverity = 'HIGH' | 'MEDIUM' | 'LOW'

/** 레포·도구별 마지막 검사. total 은 도구가 낸 전체 건수, high·medium·low 는 저장한 건수(최대 1000) */
export interface CodeScan {
  repository: string
  tool: string
  commit: string
  scannedAt: string
  total: number
  high: number
  medium: number
  low: number
}

export interface CodeFinding {
  repository: string
  tool: string
  commit: string
  ruleId: string
  severity: CodeSeverity
  cwe: string | null
  message: string
  path: string
  line: number | null
  helpUri: string | null
}

export interface CodeOverview {
  scans: CodeScan[]
  findings: CodeFinding[]
}
