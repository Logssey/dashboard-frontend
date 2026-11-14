import { apiRequest } from './client'
import type { KeyLocation, SecretIssuer } from './secrets'
import type { SecretReadOrigin } from '@/lib/secretReadSelection'
import { safeSecretSearch } from '@/lib/secretReadSelection'

export type SecretCaseStage = 'OPEN' | 'IN_PROGRESS' | 'REVALIDATION_PENDING' | 'RESOLVED'
export type SecretCaseOrigin = 'PRODUCTION' | 'TEST' | 'UNCLASSIFIED'
export type SecretAssignmentReason = 'INITIAL_ASSIGNMENT' | 'OWNERSHIP_CHANGE' | 'TEAM_TRANSFER' | 'UNASSIGNED' | 'OTHER'
export type SecretChecklistCode = 'IDENTIFY_OWNER' | 'ROTATE_OR_REVOKE' | 'REMOVE_EXPOSURE' | 'CHECK_ACCESS_LOGS'
export type SecretActionType = 'ROTATED' | 'REVOKED' | 'REMOVED_FROM_SOURCE' | 'PERMISSION_REDUCED'
export interface CaseFilters {
  origin: SecretReadOrigin
  q?: string
  scope: 'currentCases' | 'history'
  stages: string
  assignmentStatus: string
  assignee: string
  page: number
  size: number
  source?: string
  provider?: string
  environment?: string
  severity?: string
  validity?: string
  connectionId?: number | null
  snapshotId?: string
}
export interface SecretCaseItem {
  taskGuidance?: import('@/lib/secretTaskGuidance').TaskGuidance
  remediationSummary?: import('./secrets').RemediationSummary
  caseId: number
  caseOrigin: SecretCaseOrigin
  secretId: number
  maskedLabel: string
  issuer: SecretIssuer
  credentialType: string
  stage: SecretCaseStage
  assigneeTeam: string | null
  assigneeUserId: number | null
  assigneeDisplayName?: string | null
  version: number
  createdAt: string
  updatedAt: string | null
  visibleOccurrenceCount: number
  restrictedCoverage: boolean
}
export interface SecretCaseDetail extends SecretCaseItem {
  disposition: string
  isCurrent: boolean
  openingDecisionId: number | string | null
  occurrences: SecretCaseOccurrence[]
  checklist: SecretCaseChecklistItem[]
  readAt: string
  changedSinceSnapshot: boolean
  capabilities: {
    canAssign: boolean
    canUpdateChecklist: boolean
    canRecordAction: boolean
    canRequestRevalidation: boolean
    canResolve: boolean
  }
}
export interface SecretCaseOccurrence {
  sourceDetails?: KeyLocation['sourceDetails']
  requiredRemediation?: boolean
  remediationPresence?: 'PRESENT' | 'MISSING' | 'UNKNOWN'
  postActionRedetected?: boolean
  occurrenceId: number
  safeLocationLabel: string
  source: SecretIssuer
  environment: string
  exposure: string
  presence: string
  responseStatus: SecretCaseStage
  version: number
  assignedTeam: string | null
  assignedUserId: number | null
  assigneeDisplayName: string | null
  actionCycle: number
  lastMaterialActionAt: string | null
  actionsCompletedAt: string | null
  canAssign: boolean
  canRecordAction: boolean
  canCompleteActions: boolean
  canRequestRevalidation: boolean
  canResume: boolean
  locationAbsenceCheck?: { status: string; reasonCode: string | null }
  recentRevalidation?: { revalidationId: number; occurrenceId: number; runId: number; canViewRun?: boolean; jobStatus: string; result: string; failureCode: string | null; requestedAt: string; finishedAt: string | null } | null
  revalidationBlockReasonCode?: string | null
}
export interface SecretCaseChecklistItem {
  itemId: number
  occurrenceId: number
  guideVersion: 'S2_V1'
  code: SecretChecklistCode
  status: 'TODO' | 'DONE'
  evidenceRef: string | null
}
export interface SecretAssignee { userId: number; displayName: string; team: string | null }
export interface SecretCaseListResponse {
  snapshotId?: string
  items: SecretCaseItem[]; total: number; page: number; size: number
  scope: 'currentCases' | 'history'; unit: 'ResponseCase'; asOf: string
}
export interface SecretCaseActivity {
  activityId: number
  occurrenceId: number | null
  type: string
  actorUserId: number
  referenceId: number | null
  reasonCode: string | null
  happenedAt: string
  actionType?: SecretActionType | null
  performedAt?: string | null
  evidenceRef?: string | null
}
export interface SecretCaseActivities {
  items: SecretCaseActivity[]; total: number; page: number; size: number
  historyComplete: boolean; reasonCode: string | null
}
export interface CaseCommandResult { targetId: number; version: number; status: string; requiresSnapshotRefresh?: boolean }
export interface AssignSecretCaseRequest {
  team: string | null; assigneeUserId: number | null; reasonCode: SecretAssignmentReason; expectedVersion: number
}
const base = '/api/v1/secrets'
export const fetchSecretCases = (filters: CaseFilters) => {
  const params = new URLSearchParams({ origin: filters.origin, scope: filters.scope, page: String(filters.page), size: String(filters.size) })
  for (const key of ['stages', 'assignmentStatus', 'assignee', 'q'] as const) if (filters[key]) params.set(key, key === 'q' ? safeSecretSearch(filters[key]) : filters[key]!)
  if (filters.scope === 'currentCases' && !filters.assignmentStatus) {
    for (const key of ['source', 'provider', 'environment', 'severity', 'validity', 'connectionId', 'snapshotId'] as const) {
      if (filters[key]) params.set(key, String(filters[key]))
    }
  }
  return apiRequest<SecretCaseListResponse>(`${base}/cases?${params}`)
}
export const fetchSecretCase = (id: number) => apiRequest<SecretCaseDetail>(`${base}/cases/${id}`)
export const fetchSecretCaseActivities = (id: number, page: number) => apiRequest<SecretCaseActivities>(`${base}/cases/${id}/activities?page=${page}&size=20`)
export const fetchSecretAssignees = (id: number, occurrenceId?: number) => apiRequest<{ items: SecretAssignee[] }>(`${base}/assignees?caseId=${id}${occurrenceId ? `&occurrenceId=${occurrenceId}` : ''}`)
export const assignSecretCase = (id: number, request: AssignSecretCaseRequest) => apiRequest<SecretCaseDetail>(`${base}/cases/${id}/assignment`, { method: 'PATCH', body: JSON.stringify(request) })
export const assignSecretLocation = (id: number, occurrenceId: number, request: Omit<AssignSecretCaseRequest, 'expectedVersion'> & { expectedCaseVersion: number; expectedOccurrenceVersion: number }) => apiRequest<SecretCaseDetail>(`${base}/cases/${id}/occurrences/${occurrenceId}/assignment`, { method: 'PATCH', body: JSON.stringify(request) })
export const updateSecretCaseChecklist = (id: number, itemId: number, request: { completed: boolean; guideVersion: 'S2_V1'; evidenceRef: string | null; expectedCaseVersion: number }) => apiRequest<SecretCaseDetail>(`${base}/cases/${id}/checklist/${itemId}`, { method: 'PATCH', body: JSON.stringify(request) })
export const recordSecretCaseAction = (id: number, request: { actionType: SecretActionType; occurrenceId: number; performedAt: string; evidenceRef: string; expectedCaseVersion: number; expectedOccurrenceVersion: number; idempotencyKey: string }) => apiRequest<CaseCommandResult>(`${base}/cases/${id}/actions`, { method: 'POST', body: JSON.stringify(request) })
export const completeSecretLocationActions = (id: number, occurrenceId: number, request: { expectedCaseVersion: number; expectedOccurrenceVersion: number; idempotencyKey: string }) => apiRequest<CaseCommandResult>(`${base}/cases/${id}/occurrences/${occurrenceId}/complete-actions`, { method: 'POST', body: JSON.stringify(request) })
