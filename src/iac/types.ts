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

export type IacVerdict = 'BLOCK' | 'WARN' | 'INFO' | 'PASS'
export type IacRunStatus = 'QUEUED' | 'GATE_FAILED' | 'PLANNING' | 'ANALYZING' | 'DONE' | 'ERROR' | 'SUPERSEDED'

/** S-01 D. PR 별 최신 판정 */
export interface IacPullRequestSummary {
  number: number
  runId: number
  headSha: string
  status: IacRunStatus
  verdict: IacVerdict | null
  highestSeverity: IacSeverity | null
  checkedAt: string | null
  pathsAdded: number
  pathsRemoved: number
  removedRoutes: number
  stateReaderIncrease: boolean
  reason: string | null
}

export interface IacGateFinding {
  ruleId: string
  enforcement: string
  severity: IacSeverity | null
  address: string | null
}

export interface IacPathChange {
  change: 'ADDED' | 'SHORTENED' | 'REMOVED'
  tier: number
  ruleId: string
  severity: IacSeverity | null
  hops: IacHop[]
  cause: { address: string | null; action: string | null }
  evidence: { simulator?: { before: string; after: string } } | null
}

/** S-02. plan 원문은 오지 않고 수만 온다 */
export interface IacPullRequest {
  number: number
  title: string | null
  runId: number
  headSha: string
  status: IacRunStatus
  verdict: IacVerdict | null
  highestSeverity: IacSeverity | null
  checkedAt: string | null
  gate: { status: 'BLOCK' | 'PASS'; findings: IacGateFinding[] }
  paths: IacPathChange[]
  resources: { add: number; change: number; delete: number } | null
  state: { ruleId: string | null; severity: IacSeverity | null; readersBefore: number; readersAfter: number; secretsAdded: number } | null
}
