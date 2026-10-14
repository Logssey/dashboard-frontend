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
  lastCollectedAt: string
}

export interface RiskTrendResponse {
  days: Array<{
    date: string
    total: number
    critical: number
    high: number
    medium: number
    low: number
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
  eventId: number
  displayId: string | null
  severity: Severity
  title: string
  asset: AssetRef | null
  environment: Exclude<Environment, 'ALL'>
  ownerTeam: string
  reviewStatus: 'UNREVIEWED' | 'REVIEWED'
  actionStatus: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'RISK_ACCEPTED'
  detectedAt: string
  domain: Domain | null
  evidence: string | null
  recommendation: string | null
}

export interface PriorityFindingListResponse {
  items: PriorityFinding[]
  unreviewedCount: number
}

// 키 목록 조회 (API 명세: 키 목록 조회)
export type CredentialIssuer = 'AWS' | 'GITHUB' | 'NOTION'
export type CredentialStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'REVOKED' | 'UNKNOWN'
export type ExpiryPolicy = 'FIXED' | 'NEVER' | 'UNKNOWN'

/** CONFIRMED = 구성요소 완전, CANDIDATE = 불완전한 후보, METADATA_ONLY = 발급처 목록 정보만 */
export type ComponentState = 'CONFIRMED' | 'CANDIDATE' | 'METADATA_ONLY'
export type CredentialSource = 'API' | 'SCAN' | 'MANUAL'
export type MissingReason = 'CREDENTIAL_UNCONFIRMED' | 'EXPOSURE_UNKNOWN'

export interface CredentialItem {
  credentialId: number
  displayName: string | null
  externalId: string | null
  issuer: CredentialIssuer
  credentialType: string
  status: CredentialStatus
  expiryPolicy: ExpiryPolicy
  expiresAt: string | null
  lastUsedAt: string | null
  owner: string | null
  ownerTeam: string | null
  source: CredentialSource
  /** 발견 위치 (문서에서 발견한 키만) */
  location: string | null
  environment: 'PROD' | 'DEV' | 'UNKNOWN'
  componentState: ComponentState
  /** 문서에서 발견한 키는 UNASSESSED(미평가). 목록 정보만 있는 키는 null */
  severity: 'UNASSESSED' | null
  missingReason: MissingReason | null
}

export interface CredentialListResponse {
  summary: {
    totalCount: number
    foundCount: number
    candidateCount: number
    inventoryCount: number
  }
  items: CredentialItem[]
}

// 키 스캔 실행 (API 명세: 키 스캔 실행)
export interface ScanResult {
  /** PARTIAL = 일부 페이지를 읽지 못함 (못 읽은 페이지를 0개로 치지 않는다) */
  status: 'COMPLETED' | 'PARTIAL' | 'NOT_CONFIGURED' | 'FAILED'
  scannedPages: number
  unreadablePages: number
  foundKeys: number
  newKeys: number
  message: string
  scannedAt: string
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
