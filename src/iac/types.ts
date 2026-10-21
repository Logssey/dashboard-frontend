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

/** 경로에서 끊을 수 있는 관계. fromHop·toHop 은 hops 의 순번 (0 = 인터넷) */
export interface IacCutPoint {
  fromHop: number
  toHop: number
  action: string
  templateKey: string
}

export interface IacPathDetail {
  path: IacPath
  cutPoints: IacCutPoint[]
}
