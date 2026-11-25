import { apiRequest } from './client'

// 통합 현황 보안 점수 (dashboard-design-docs ADR-D012, GET /api/v1/overview/score)
// 운영 환경만 계산한다. 계산은 모두 백엔드가 하고 화면은 받은 값을 보여주기만 한다

export type ScoreAssetStatus = 'EVALUATED' | 'STALE' | 'NOT_EVALUATED'

export interface SecurityScoreIndicators {
  openCritical: number
  overdue: number
  unassessed: number
  unclassified: number
  /** 수용 건수를 넘기는 기능이 없으면 null */
  riskAccepted: number | null
  /** 닫힌 이력을 아직 모으지 않아 null */
  deadlineComplianceRate: number | null
  staleAssets: string[]
  gradeDistribution: Record<string, number>
}

export interface SecurityScoreArea {
  area: string
  label: string
  score: number | null
}

export interface SecurityScoreAsset {
  id: string
  name: string
  tier: number
  weight: number
  area: string
  status: ScoreAssetStatus
  score: number | null
  deduction: number
  lastEvaluatedAt: string | null
  worst: { part: string; title: string; grade: string; deduction: number } | null
  openCount: number
}

export interface SecurityScorePart {
  part: string
  label: string
  status: 'CONNECTED' | 'NO_DATA' | 'NOT_AUTHORIZED' | 'ERROR'
  lastSuccessAt: string | null
  openCount: number
  penalty: number
}

export interface SecurityScoreResponse {
  /** 1~100. 평가된 자산이 없으면 null */
  score: number | null
  scoreRule: string
  configVersion: string
  calculatedAt: string
  /** 평가 범위 % */
  coverage: number
  indicators: SecurityScoreIndicators
  areas: SecurityScoreArea[]
  assets: SecurityScoreAsset[]
  parts: SecurityScorePart[]
}

export const fetchSecurityScore = () => apiRequest<SecurityScoreResponse>('/api/v1/overview/score')
