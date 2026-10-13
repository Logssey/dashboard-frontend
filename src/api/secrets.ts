import { apiRequest } from './client'

export type SecretIssuer = 'AWS' | 'GITHUB' | 'NOTION'
export type SecretComponentState = 'CONFIRMED' | 'CANDIDATE' | 'METADATA_ONLY'
export type SecretRunStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'CANCELLED' | 'UNKNOWN'

export interface SecretConnection {
  connectionId: number
  provider: SecretIssuer
  displayName: string
  status: 'ACTIVE'
  approvedScopeCount: number
}

export interface SecretItem {
  id: number
  issuer: SecretIssuer
  credentialType: string
  componentState: SecretComponentState
  maskedLabel: string
  severity: 'UNASSESSED'
  validationStatus: string
  validationReasonCode: string | null
  validatedAt: string | null
  occurrenceCount: number
  firstSeenAt: string
  lastSeenAt: string
}

export interface SecretOccurrence {
  id: number
  connectionId: number
  sourceObjectRef: string
  locationKey: string
  environment: 'PROD' | 'DEV' | 'UNKNOWN'
  exposureStatus: string
  exposureRange: string | null
  presenceStatus: string
  firstSeenAt: string
  lastSeenAt: string
}

export interface SecretDetail extends SecretItem {
  expiryPolicy: string | null
  expiresAt: string | null
  lifecycleStatus: string | null
  occurrences: SecretOccurrence[]
  iamMetadata: {
    keyStatus: 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'UNKNOWN'
    issuedAt: string | null
    lastUsedAt: string | null
    lastUsedService: string | null
    lastUsedRegion: string | null
    observedAt: string
  } | null
}

export interface SecretFilter {
  page: number
  size: number
  issuer: SecretIssuer | 'ALL'
  componentState: SecretComponentState | 'ALL'
}

export interface SecretListResponse {
  items: SecretItem[]
  total: number
  page: number
  size: number
}

export interface SecretRunAccepted {
  runId: number
  status: SecretRunStatus
}

export interface SecretRunDetail extends SecretRunAccepted {
  connectionId: number
  triggerType: 'MANUAL' | 'SCHEDULED'
  collectionStatus: string
  detectionStatus: string
  validationStatus: string
  scopeCount: number
  completedScopeCount: number
  incompleteScopeCount: number
  collectedObjectCount: number
  attemptNo: number
  maxAttempts: number
  requestedAt: string
  startedAt: string | null
  finishedAt: string | null
  availableAt: string | null
  failureCode: string | null
}

export const fetchSecretConnections = () =>
  apiRequest<{ items: SecretConnection[] }>('/api/v1/secrets/connections')

export const fetchSecrets = (filter: SecretFilter) => {
  const params = new URLSearchParams({
    page: String(filter.page),
    size: String(filter.size),
    issuer: filter.issuer,
    componentState: filter.componentState,
  })
  return apiRequest<SecretListResponse>(`/api/v1/secrets?${params}`)
}

export const fetchSecretDetail = (id: number) => apiRequest<SecretDetail>(`/api/v1/secrets/${id}`)

/** 등록만 수행한다. 수집과 탐지는 별도 워커가 실행한다. */
export const startSecretRun = (connectionId: number) =>
  apiRequest<SecretRunAccepted>('/api/v1/secrets/runs', {
    method: 'POST',
    body: JSON.stringify({ connectionId }),
  })

export const fetchSecretRun = (runId: number) => apiRequest<SecretRunDetail>(`/api/v1/secrets/runs/${runId}`)
