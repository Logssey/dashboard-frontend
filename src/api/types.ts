// 백엔드 API 응답 모양 그대로 (API 명세). 화면도 이 이름을 그대로 쓴다 (변환 없음)

export type Environment = 'ALL' | 'PROD' | 'DEV'
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type Domain = 'SECRETS' | 'CONFIGURATION' | 'IDENTITIES' | 'RUNTIME' | 'VULNERABILITIES'
export type Provider = 'AWS' | 'KUBERNETES' | 'GITHUB'

export interface LoginResponse {
  userId: number
  displayName: string
  role: string
}

export interface OverviewSummaryResponse {
  unreviewedCriticalCount: number
  totalCount: number
  unreviewedCount: number
  connectedAssetCount: number
  securityScore: number
  scoreRule: string
  lastCollectedAt: string | null
  secretIntegration?: { status: 'AVAILABLE' | 'NOT_AUTHORIZED'; unit: 'ResponseCase'; origin: 'PRODUCTION' | 'ALL'; total: number | null; unassessedCount: number | null; notApplicableCount: number | null; restrictedCoverage: boolean }
}

export interface RiskTrendResponse {
  days: Array<{
    date: string
    total: number
    critical: number
    high: number
    medium: number
    low: number
    unassessed?: number
    notApplicable?: number
  }>
}

export interface AssetSummaryResponse {
  totalCount: number
  providers: Array<{
    provider: Provider
    description: string
    count: number
  }>
}

export interface AssetRef {
  assetId: number
  name: string
  provider: Provider
  assetType: string
}

export interface PriorityFinding {
  eventId: number | null
  sourceType?: 'DETECTION_EVENT' | 'SECRET_CASE'
  sourceId?: number
  detailPath?: string | null
  displayId: string | null
  severity: Severity | 'UNASSESSED' | null
  assessmentStatus?: string | null
  title: string
  asset: AssetRef | null
  environment: Exclude<Environment, 'ALL'> | 'UNKNOWN' | 'MIXED'
  ownerTeam: string
  reviewStatus: 'UNREVIEWED' | 'REVIEWED' | null
  actionStatus: 'OPEN' | 'IN_PROGRESS' | 'REVALIDATION_PENDING' | 'RESOLVED' | 'RISK_ACCEPTED'
  detectedAt: string
  domain: Domain | null
  evidence: string | null
  recommendation: string | null
}

export interface PriorityFindingListResponse {
  items: PriorityFinding[]
  unreviewedCount: number
}

// 런타임 보안
export type RuntimeReviewStatus = 'UNREVIEWED' | 'REVIEWED'
export type RuntimeActionStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'RISK_ACCEPTED'
export type RuntimeDisposition = 'UNDECIDED' | 'EXPECTED' | 'ACTION_REQUIRED'
export type RuntimeEvaluationStatus = 'PENDING_CONTEXT' | 'EVALUATED' | 'INSUFFICIENT_CONTEXT' | 'EVALUATION_FAILED'
export type RuntimeSourcePriority = 'CRITICAL' | 'WARNING' | 'NOTICE' | 'INFORMATIONAL'
export type RuntimeCollectionState = 'NOT_INSTALLED' | 'HEALTHY' | 'DEGRADED' | 'OFFLINE'

export interface RuntimeFinding {
  findingId: number
  displayId: string
  rule: { key: string; title: string; version: string }
  reviewStatus: RuntimeReviewStatus
  actionStatus: RuntimeActionStatus
  disposition: RuntimeDisposition
  sourcePriority: RuntimeSourcePriority
  evaluationStatus: RuntimeEvaluationStatus
  finalSeverity: Severity | null
  firstSeenAt: string
  lastSeenAt: string
  occurrenceCount: number
  sensors: Array<'FALCO' | 'TETRAGON'>
  asset: {
    clusterId: string
    namespace: string
    workloadKind: string | null
    workloadName: string | null
    podUid: string | null
    podName: string
    containerName: string | null
    image: string | null
    imageDigest: string | null
    nodeName: string | null
    serviceAccountName: string | null
    deleted: boolean
  } | null
  process: {
    executable: string | null
    parentExecutable: string | null
    userId: string | null
  }
  assigneeUserId: number | null
  assigneeDisplayName: string | null
  note: string | null
  version: number
}

export interface RuntimeFindingListResponse {
  items: RuntimeFinding[]
  totalCount: number
}

export interface RuntimeFindingUpdate {
  version: number
  reviewStatus: RuntimeReviewStatus
  actionStatus: RuntimeActionStatus
  disposition: RuntimeDisposition
  assigneeUserId: number | null
  note: string
}

export interface RuntimeOverviewResponse {
  period: { from: string; to: string }
  summary: {
    runtimeEventCount: number
    unreviewedFindingCount: number
    affectedWorkloadCount: number
    unresolvedAssetEventCount: number
  }
  findingsByRule: Array<{ ruleKey: string; title: string; count: number }>
  sensorSummary: { healthy: number; degraded: number; offline: number; unknown: number }
  collectionState: RuntimeCollectionState
  generatedAt: string
}

export interface RuntimeSensorListResponse {
  items: Array<{
    sensorId: number
    clusterId: string
    nodeName: string
    type: 'FALCO' | 'TETRAGON'
    version: string | null
    driver: string | null
    status: 'HEALTHY' | 'DEGRADED' | 'OFFLINE' | 'UNKNOWN'
    lastHeartbeatAt: string | null
    lastEventAt: string | null
    ruleSetVersion: string | null
    queueDepth: number | null
    error: string | null
  }>
  collectionState: RuntimeCollectionState
}
