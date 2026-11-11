import { apiRequest } from './client'
import type { ScopeCoverage } from './secretConnections'
import type { SecretReadOrigin } from '@/lib/secretReadSelection'
import { safeSecretSearch } from '@/lib/secretReadSelection'

export type SecretIssuer = 'AWS' | 'GITHUB' | 'NOTION' | 'KUBERNETES'
export type SecretOrigin = 'PRODUCTION' | 'TEST' | 'UNCLASSIFIED'
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
  taskGuidance?: import('@/lib/secretTaskGuidance').TaskGuidance
  remediationSummary?: RemediationSummary
  id: number
  issuer: SecretIssuer
  credentialType: string
  componentState: SecretComponentState
  maskedLabel: string
  severity: string | null
  assessmentStatus?: 'ASSESSED' | 'UNASSESSED' | 'NOT_APPLICABLE'
  unassessedOccurrenceCount?: number
  heldOccurrenceCount?: number
  validationStatus: string
  validationReasonCode: string | null
  validatedAt: string | null
  occurrenceCount: number
  firstSeenAt: string
  lastSeenAt: string
  origin?: SecretOrigin | null
  origins?: SecretOrigin[]
  readOrigin?: SecretReadOrigin
  contentKind?: string
  workBucket?: string
  inventorySubtype?: 'AUTHORIZED_STORAGE' | 'METADATA_ONLY' | 'RETIRED_HISTORY' | 'MANAGED_LOCATIONS'
  whyHereCode?: string
  nextActionCode?: string
  safeLocationLabel?: string
  visibleLocationCount?: number
  matchedLocationCount?: number
  restrictedCoverage?: boolean
  currentCaseId?: number | null
  casesByOrigin?: { origin: SecretOrigin; caseId: number }[]
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
  q?: string
  page: number
  size: number
  issuer: SecretIssuer | 'ALL'
  componentState: SecretComponentState | 'ALL'
  origin?: SecretReadOrigin
  source?: string
  provider?: string
  environment?: string
  contentKind?: string
  workBucket?: string
  validity?: string
  severity?: string
  snapshotId?: string
  runId?: number | null
}

export interface SecretListResponse {
  items: SecretItem[]
  total: number
  page: number
  size: number
  filters?: Record<string, string>
  scope?: string
  unit?: string
  asOf?: string
  snapshotId?: string
  expiresAt?: string
  restrictedCoverage?: boolean
}

export interface InventoryFilter extends SecretFilter {
  origin: SecretReadOrigin
  source: string
  provider: string
  environment: string
  contentKind: string
  workBucket: string
  validity: string
  severity: string
  snapshotId: string
}
export interface KeyLocation {
  legacyExposureAssessment?: { decision: string; assessmentId: number; scopeRevision: number | null; currentScopeRevision: number; needsReconfirmation: boolean; reasonCodes: string[] }

  severity?: string | null
  assessmentStatus?: 'ASSESSED' | 'UNASSESSED' | 'NOT_APPLICABLE'
  held?: boolean
  sourceDetails?: { status: string; label: string; repository?: string; branch?: string; path?: string; line?: string | null; sourceUrl?: string | null; region?: string; resource?: string }
  detectionEvidence?: { ruleId: string; detectedAt: string; runId: number }[]
  requiresReassessment?: boolean
  taskGuidance?: import('@/lib/secretTaskGuidance').TaskGuidance
  requiredRemediation?: boolean
  remediationPresence?: 'PRESENT' | 'MISSING' | 'UNKNOWN'
  postActionRedetected?: boolean
  occurrenceId: number
  connectionId: number
  scopeId: number
  scopeRevision: number | null
  source: SecretIssuer
  environment: 'PROD' | 'DEV' | 'UNKNOWN'
  origin: SecretOrigin
  safeLocationLabel: string
  presence: 'PRESENT' | 'MISSING' | 'UNKNOWN'
  exposure: 'ABNORMAL' | 'NORMAL' | 'UNKNOWN'
  validity: { result: string; reasonCode: string | null; observedAt: string | null; providerCheckedAt?: string | null; postActionAfterAt?: string | null; lastObservation?: { result: string; reasonCode: string | null; observedAt: string | null; providerCheckedAt: string | null } | null }
  storagePolicy: { result: string; reasonCode: string | null }
  coverage: ScopeCoverage
  fixtureStatus: string | null
  fixtureReasonCode: string | null
  caseId: number | null
  actionStatus: string | null
  assignedUserId: number | null
  occurrenceVersion: number
  caseVersion: number | null
  caseLinkStatus: string
  whyHereCode: string
  nextActionCode: string
  locationAbsenceCheck: { status: string; reasonCode: string | null }
  credentialLifecycleCheck: { status: string; reasonCode: string | null; verificationLevel?: string; evidenceId?: number; observedAt?: string | null; coverageLimit?: string }
  lastMaterialActionAt?: string | null
  actionCycle?: number | null
  actionsCompletedAt?: string | null
  recentRevalidation?: { revalidationId: number; runId: number; canViewRun?: boolean; result: string; finishedAt: string | null } | null
  revalidationBlockReasonCode?: string | null
  coverageCheck: { status: string; reasonCode: string | null }
  firstSeenAt: string | null
  lastSeenAt: string | null
  capabilities: { canReview: boolean; canViewCase: boolean; canRecordAction: boolean; canRequestRevalidation: boolean; canViewCoverage: boolean; canOpenSafeSource: boolean }
}
export interface RemediationSummary {
  requiredLocationCount: number; presentLocationCount: number; postActionMissingLocationCount: number; unknownLocationCount: number
  postActionRedetectedCount: number; approvedStorageLocationCount: number; metadataLocationCount: number; visibleLocationCount: number
  resolvedLocationCount?: number; restrictedCoverage: boolean; evidenceObservedAt?: string | null; comparisonScope: string
}
export interface LocationFilter {
  origin: SecretReadOrigin
  page: number
  size: number
  source: string
  environment: string
  presence: string
  exposure: string
  actionStatus: string
  expectedDetailVersion?: string
}
export interface KeyLocationsResponse {
  sourceGroups?: { source: string; locationCount: number; scopeCount: number; presenceCounts: Record<string, number> }[]
  credentialSetId: number
  credential: SecretItem
  detailVersion: string
  items: KeyLocation[]
  total: number
  visibleLocationCount: number
  page: number
  size: number
  origin: SecretReadOrigin
  locationStateCounts: { presence: Record<string, number>; exposure: Record<string, number> }
  restrictedCoverage: boolean
  readAt: string
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
  scopeResults: {
    runScopeId: number
    contentType: string
    region: string | null
    collectionStatus: string
    objectCount: number | null
    gapCode: string | null
  }[]
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
  for (const key of ['origin', 'source', 'provider', 'environment', 'contentKind', 'workBucket', 'validity', 'severity', 'snapshotId', 'runId', 'q'] as const) {
    if (filter[key]) params.set(key, key === 'q' ? safeSecretSearch(String(filter[key])) : String(filter[key]))
  }
  return apiRequest<SecretListResponse>(`/api/v1/secrets?${params}`)
}

export const fetchSecretDetail = (id: number, origin: SecretReadOrigin = 'ALL') => apiRequest<SecretDetail>(`/api/v1/secrets/${id}?origin=${origin}`)
export const fetchKeyLocations = (id: number, filters: LocationFilter) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) if (value !== '' && value != null) params.set(key, String(value))
  return apiRequest<KeyLocationsResponse>(`/api/v1/secrets/${id}/locations?${params}`)
}

/** 등록만 수행한다. 수집과 탐지는 별도 워커가 실행한다. */
export const startSecretRun = (connectionId: number) =>
  apiRequest<SecretRunAccepted>('/api/v1/secrets/runs', {
    method: 'POST',
    body: JSON.stringify({ connectionId }),
  })

export const fetchSecretRun = (runId: number) => apiRequest<SecretRunDetail>(`/api/v1/secrets/runs/${runId}`)
