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
  runStatus?: string
  connectionId?: number
  scopeId?: number
  source?: string
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
  targetSummary?: string[]
  testBlockedReasonCode?: string | null
  scanBlockedReasonCode?: string | null
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
  aliasVersion?: number | null
  customSafeDisplayAlias?: string | null
  capabilities?: { canEditAlias: boolean }
}
export const updateScopeDisplayAlias = (scopeId: number, request: { safeDisplayAlias: string | null; expectedScopeRevision: number; expectedAliasVersion: number }) => apiRequest<{ scopeId: number; safeDisplayAlias: string | null; scopeRevision: number; aliasVersion: number; requiresSnapshotRefresh: boolean }>(`/api/v1/secrets/scopes/${scopeId}/display-alias`, { method: 'PATCH', body: JSON.stringify(request) })
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

export type EditableSecretProvider = 'GITHUB' | 'AWS'
export type AwsMetadataKind = 'IAM_ACCESS_KEY_METADATA' | 'AWS_S3_BUCKET_METADATA' | 'AWS_SECRETS_MANAGER_METADATA' | 'AWS_SSM_PARAMETER_METADATA'
export interface GitHubScanTarget { repository: string; branch: string; path: string }
export interface AwsScanTarget { kind: AwsMetadataKind; region: string }
export interface GitHubAppCredential { appId: number; installationId: number; privateKey: string }
export interface SecretConnectionSetupOptions {
  enabled: boolean
  canCreate: boolean
  credentialStorageConfigured: boolean
  providers: EditableSecretProvider[]
  aws: { accountId: string; regions: string[]; targetKinds: AwsMetadataKind[] }
}
export interface SecretConnectionSettings {
  capabilities?: { activateTargets?: boolean; retryFailedScopes?: boolean; validationReadiness?: boolean; scanLimits?: boolean }
  scanLimits?: { maxFiles: number; maxFileBytes: number; maxTotalBytes: number; maxTreeEntries?: number; maxDepth?: number }
  validationReadiness?: {
    ready: boolean
    reasonCodes: string[]
    validators: { issuer: string; serverEnabled: boolean; connectionAllowed: boolean; scopeCount: number; allowedScopeCount: number }[]
  }
  connectionId: number
  provider: EditableSecretProvider
  displayName: string
  status: 'ACTIVE' | 'PAUSED' | 'ERROR'
  scopeVersion: number
  settingsVersion?: number
  credentialConfigured: boolean
  credentialVersion: number | null
  credentialDeletionPending: boolean
  credentialRecoveryUntil: string | null
  canRestoreCredential: boolean
  githubApp: { appId: number; installationId: number } | null
  githubTargets: GitHubScanTarget[]
  awsTargets: AwsScanTarget[]
  canManage: boolean
}
export interface CreateSecretConnectionRequest {
  provider: EditableSecretProvider
  displayName: string
  idempotencyKey: string
  githubCredential?: GitHubAppCredential
}
export interface UpdateSecretConnectionRequest {
  expectedScopeVersion: number
  expectedSettingsVersion?: number
  displayName: string
  status: SecretConnectionSettings['status']
  githubCredential?: GitHubAppCredential
}
export interface UpdateSecretTargetsRequest {
  expectedScopeVersion: number
  expectedSettingsVersion?: number
  activate?: boolean
  githubTargets?: GitHubScanTarget[]
  awsTargets?: AwsScanTarget[]
}
export interface GitHubRepositoryOption { fullName: string; defaultBranch: string; private: boolean }
export interface GitHubBranchOption { name: string }

export const fetchConnectionSetupOptions = () => apiRequest<SecretConnectionSetupOptions>('/api/v1/secrets/connections/setup-options')
export const fetchConnectionSettings = (connectionId: number) => apiRequest<SecretConnectionSettings>(`/api/v1/secrets/connections/${connectionId}/settings`)
export const createSecretConnection = (request: CreateSecretConnectionRequest) => apiRequest<SecretConnectionSettings>('/api/v1/secrets/connections', { method: 'POST', body: JSON.stringify(request) })
export const updateSecretConnection = (connectionId: number, request: UpdateSecretConnectionRequest) => apiRequest<SecretConnectionSettings>(`/api/v1/secrets/connections/${connectionId}/settings`, { method: 'PATCH', body: JSON.stringify(request) })
export const updateSecretTargets = (connectionId: number, request: UpdateSecretTargetsRequest) => apiRequest<SecretConnectionSettings>(`/api/v1/secrets/connections/${connectionId}/targets`, { method: 'PUT', body: JSON.stringify(request) })
export const deleteGitHubCredential = (connectionId: number, expectedScopeVersion: number) => apiRequest<SecretConnectionSettings>(`/api/v1/secrets/connections/${connectionId}/credential?${new URLSearchParams({ expectedScopeVersion: String(expectedScopeVersion) })}`, { method: 'DELETE' })
export const restoreGitHubCredential = (connectionId: number, expectedScopeVersion: number) => apiRequest<SecretConnectionSettings>(`/api/v1/secrets/connections/${connectionId}/credential/restore`, { method: 'POST', body: JSON.stringify({ expectedScopeVersion }) })
export const fetchGitHubRepositories = (connectionId: number, page = 1) => apiRequest<{ items: GitHubRepositoryOption[] }>(`/api/v1/secrets/connections/${connectionId}/github/repositories?${new URLSearchParams({ page: String(page) })}`)
export const fetchGitHubBranches = (connectionId: number, repository: string, page = 1) => apiRequest<{ items: GitHubBranchOption[] }>(`/api/v1/secrets/connections/${connectionId}/github/branches?${new URLSearchParams({ repository, page: String(page) })}`)
