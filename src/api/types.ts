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
