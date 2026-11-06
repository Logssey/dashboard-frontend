import { apiRequest } from './client'
import type { SecretRunStatus } from './secrets'

export type ScanPlatform = 'GITHUB' | 'AWS' | 'NOTION' | 'KUBERNETES'
export type ScanType = 'SCHEDULED' | 'MANUAL' | 'REVALIDATION'
export interface RunFilters {
  page: number
  size: number
  type: ScanType | 'ALL'
  status: string
  provider: string
  connectionId: number | null
  from: string
  to: string
  snapshotId?: string
}
export interface ScanStage {
  status: string
  reasonCode: string | null
  required: boolean | null
  applicability?: string
  observedAt: string | null
}

export interface SecretRunListItem {
  runId: number
  connectionId: number
  provider: ScanPlatform
  displayName: string
  safeDisplayAlias?: string | null
  triggerType: ScanType
  status: SecretRunStatus
  scopeCount: number
  scopeRevision?: number | null
  finishedScopeCount: number | null
  successfulScopeCount: number | null
  gapScopeCount: number | null
  unverifiedScopeCount: number | null
  scopeStatusCounts: Record<string, number> | null
  aggregationStatus: string
  collectedObjectCount: number | null
  requestedAt: string
  startedAt: string | null
  finishedAt: string | null
  failureCode: string | null
  coverageComplete?: boolean
}

export interface SecretRunScope {
  runScopeId: number
  scopeId: number
  scopeRevision: number | null
  safeDisplayAlias: string | null
  contentType: string
  region: string | null
  scopeOutcome: string
  collection: ScanStage
  detection: ScanStage
  validation: ScanStage
  objectCount: number | null
  excludedObjectCount?: number | null
  gapCode: string | null
  startedAt?: string | null
  finishedAt?: string | null
  retryable?: boolean
}
export interface SecretScanRun extends SecretRunListItem {
  collectionStatus: string
  detectionStatus: string
  validationStatus: string
  collection?: ScanStage
  detection?: ScanStage
  validation?: ScanStage
  availableAt: string | null
  attemptNo: number
  maxAttempts: number
  findingCount: number | null
  distinctCredentialCount: number | null
  newCredentialCount: number | null
  resultAggregationStatus?: string
  scopeResults: SecretRunScope[]
  retryOfRunId?: number | null
  caseId?: number | null
  occurrenceId?: number | null
  revalidation?: { caseId: number; occurrenceId: number } | null
  newCredentialCountReason?: string | null
  capabilities?: { canViewFindings: boolean }
}

export interface SecretRunListResponse {
  items: SecretRunListItem[]
  total: number
  page: number
  size: number
  filters: Record<string, unknown>
  asOf: string | null
  snapshotId?: string
  expiresAt?: string
}

export function fetchSecretRuns(filter: RunFilters): Promise<SecretRunListResponse> {
  const params = new URLSearchParams({ page: String(filter.page), size: String(filter.size), type: filter.type })
  for (const key of ['status', 'provider', 'from', 'to', 'snapshotId'] as const) if (filter[key]) params.set(key, filter[key]!)
  if (filter.connectionId) params.set('connectionId', String(filter.connectionId))
  return apiRequest(`/api/v1/secrets/runs?${params}`)
}
export const fetchSecretScanRun = (runId: number) => apiRequest<SecretScanRun>(`/api/v1/secrets/runs/${runId}`)
export interface RunFinding { findingId: number; occurrenceId: number; credentialSetId: number; secretId: number; maskedLabel: string; componentState: string; ruleId: string; ruleVersion: string | null; origin: string }
export interface RunFindings { items: RunFinding[]; total: number; unit: 'Finding'; page: number; size: number; runId: number; asOf: string }
export const fetchRunFindings = (runId: number, page: number) => apiRequest<RunFindings>(`/api/v1/secrets/runs/${runId}/findings?page=${page}&size=20`)
export const requestSecretScan = (request: { connectionId: number; idempotencyKey: string }) =>
  apiRequest<{ runId: number; status: SecretRunStatus }>('/api/v1/secrets/runs', {
    method: 'POST', body: JSON.stringify(request),
  })
