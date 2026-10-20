import { apiRequest } from './client'
import type { ScanPlatform } from './secretRuns'

export interface SecretConnectionTestResult {
  connectionId: number
  provider: ScanPlatform
  checkKind: 'IDENTITY_OR_INSTALLATION'
  status: 'CONNECTED' | 'FAILED' | 'UNAVAILABLE'
  reasonCode: string | null
  checkedAt: string
}

export interface ScanAttempt {
  runId: number
  status: string
  requestedAt: string | null
  finishedAt: string | null
  scopeOutcome?: string
}
export interface ScopeCoverage {
  scopeRevision: number | null
  lastAttempt: ScanAttempt | null
  lastSuccessfulScan: ScanAttempt | null
  nextDueAt: string | null
  isPaused: boolean
  isRunning: boolean
  freshness: 'CURRENT' | 'OVERDUE' | 'NEVER_SCANNED' | 'NOT_SCHEDULED' | 'UNKNOWN'
  gapReasonCodes: string[]
}
export interface ManagedSecretConnection {
  connectionId: number
  provider: ScanPlatform
  safeDisplayAlias: string | null
  connectionStatus: string
  approvedScopeCount: number
  scopeRevision: number | null
  latestProbe: SecretConnectionTestResult | null
  lastFullScanAttempt: ScanAttempt | null
  lastSuccessfulFullScan: ScanAttempt | null
  nextDueAt: string | null
  activeJob: { runId: number; status: string; availableAt: string | null } | null
  scopeStatusCounts: Record<string, number> | null
  capabilities: { canTest: boolean; canRun: boolean }
}
export interface ManagedScope {
  scopeId: number
  scopeRevision: number | null
  origin: string
  safeDisplayAlias: string | null
  contentType: string
  region?: string | null
  classificationStatus?: string
  coverage: ScopeCoverage
}
export interface ConnectionPage {
  items: ManagedSecretConnection[]
  total: number
  page: number
  size: number
  asOf?: string | null
}
export interface ScopePage {
  items: ManagedScope[]
  total: number
  page: number
  size: number
  asOf?: string | null
}
export function fetchManagedConnections(page: number, status = '', origin = '') {
  const params = new URLSearchParams({ page: String(page), size: '12' })
  if (status) params.set('status', status)
  if (origin) params.set('origin', origin)
  return apiRequest<ConnectionPage>(`/api/v1/secrets/connections/manage?${params}`)
}
export function fetchManagedScopes(connectionId: number, page: number, origin = '', gapOnly = false) {
  const params = new URLSearchParams({ page: String(page), size: '20' })
  if (origin) params.set('origin', origin)
  if (gapOnly) params.set('gapOnly', 'true')
  return apiRequest<ScopePage>(`/api/v1/secrets/connections/${connectionId}/scopes?${params}`)
}

/** 인증·접근 가능 여부만 확인한다. 검사 작업은 등록하지 않는다. */
export const testSecretConnection = (connectionId: number) =>
  apiRequest<SecretConnectionTestResult>(`/api/v1/secrets/connections/${connectionId}/test`, {
    method: 'POST',
  })
