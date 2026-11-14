import { apiRequest } from './client'
import { safeSecretSearch } from '@/lib/secretReadSelection'
import type { WorkbenchFilters } from './secretSummary'
import type { ScopeCoverage } from './secretConnections'

export interface WorkbenchQueueItem {
  taskGuidance?: import('@/lib/secretTaskGuidance').TaskGuidance
  setupReasonCodes?: string[]
  credentialSetId?: number; secretId?: number; occurrenceId?: number | null; caseId?: number | null
  scopeId?: number; connectionId?: number
  maskedLabel?: string; safeLocationLabel?: string; safeDisplayAlias?: string
  componentState?: string; presence?: string; exposure?: string; exposureStatus?: string
  source?: string; provider?: string; origin?: string; environment?: string
  whyHereCode?: string; whyHere?: string; nextActionCode?: string
  inventorySubtype?: string; stage?: string
  severity?: string | null; assessmentStatus?: string; validationStatus?: string
  validationFreshness?: 'CURRENT' | 'STALE' | 'POST_ACTION_REQUIRED' | 'UNAVAILABLE'
  lastValidationStatus?: string | null; validationCheckedAt?: string | null; validationDueAt?: string | null
  assigneeDisplayName?: string | null; assigneeTeam?: string | null; assigneeUserId?: number | null
  visibleOccurrenceCount?: number
  contentType?: string; coverage?: ScopeCoverage
  classificationStatus?: string; approvalStatus?: string; policyStatus?: string
  lastSeenAt?: string | null; evidenceObservedAt?: string | null; updatedAt?: string | null
}
export interface WorkbenchQueuePage {
  items: WorkbenchQueueItem[]; total: number; page: number; size: number
  unit: 'Occurrence' | 'ResponseCase' | 'CredentialSet' | 'Scope'
  scope: string; asOf: string; snapshotId: string; expiresAt: string
  restrictedCoverage: boolean; partialCoverage: boolean | null
  filters: Record<string, string>
}
export const fetchWorkbenchQueue = (filters: WorkbenchFilters, bucket: string, stages: string, page: number, risk?: { severity: string; validity: string }) => {
  const params = new URLSearchParams({ origin: filters.origin, source: filters.source, provider: filters.provider, environment: filters.environment, bucket, page: String(page), size: '20' })
  if (filters.connectionId) params.set('connectionId', String(filters.connectionId))
  if (filters.assignee) params.set('assignee', filters.assignee)
  if (filters.snapshotId) params.set('snapshotId', filters.snapshotId)
  if (filters.q) params.set('q', safeSecretSearch(filters.q))
  if (stages) params.set('stages', stages)
  if (risk?.severity) params.set('severity', risk.severity)
  if (risk?.validity) params.set('validity', risk.validity)
  return apiRequest<WorkbenchQueuePage>(`/api/v1/secrets/review-queue?${params}`)
}
