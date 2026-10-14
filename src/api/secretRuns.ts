import { apiRequest } from './client'
import type { SecretIssuer, SecretRunStatus } from './secrets'

export interface SecretRunListItem {
  runId: number
  connectionId: number
  provider: SecretIssuer
  displayName: string
  triggerType: 'MANUAL' | 'SCHEDULED'
  status: SecretRunStatus
  collectionStatus: string
  detectionStatus: string
  validationStatus: string
  scopeCount: number
  completedScopeCount: number
  incompleteScopeCount: number
  collectedObjectCount: number
  requestedAt: string
  startedAt: string | null
  finishedAt: string | null
  failureCode: string | null
}

export interface SecretRunListResponse {
  items: SecretRunListItem[]
  total: number
  page: number
  size: number
}

export function fetchSecretRuns(page: number, size = 20): Promise<SecretRunListResponse> {
  return apiRequest<SecretRunListResponse>(`/api/v1/secrets/runs?page=${page}&size=${size}`)
}
