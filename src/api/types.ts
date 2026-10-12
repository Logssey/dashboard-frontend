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

export interface CredentialRisk {
  eventId: number
  displayId: string | null
  severity: Severity
  title: string
  reviewStatus: 'UNREVIEWED' | 'REVIEWED'
}

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
  risks: CredentialRisk[]
}

export interface CredentialListResponse {
  summary: {
    totalCount: number
    atRiskCount: number
    expiringSoonCount: number
  }
  items: CredentialItem[]
}

// 키 스캔 실행 (API 명세: 키 스캔 실행)
export interface ScanResult {
  status: 'COMPLETED' | 'NOT_CONFIGURED' | 'FAILED'
  scannedPages: number
  foundKeys: number
  newKeys: number
  newEvents: number
  message: string
  scannedAt: string
}
