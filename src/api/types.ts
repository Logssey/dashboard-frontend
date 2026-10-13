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
