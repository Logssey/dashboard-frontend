// IaC 보안 API 응답 (dashboard-backend /api/v1/iac, security-solution-docs iac-security api-contract)

export type IacSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export interface IacSummary {
  metrics: {
    tier1OpenPaths: number
    openPaths: number
    drifts: number | null
    stateSecrets: number | null
    gateViolations: number | null
  }
  severityCounts: Record<IacSeverity, number>
  lastFullCheckAt: string | null
  graphAsOf: string | null
  graphStale: boolean
}

/** 경로의 한 단계. kind 는 Cartography 라벨 (Internet, AWSEC2Instance …) */
export interface IacHop {
  kind: string
  id: string
  name: string
}

export interface IacPath {
  pathId: number
  status: 'OPEN' | 'CLOSED'
  tier: number
  severity: IacSeverity
  length: number
  hops: IacHop[]
  target: { arn: string; kind: string }
  firstSeenAt: string
  lastSeenAt: string
}

export interface IacPathList {
  items: IacPath[]
  nextCursor: number | null
}
