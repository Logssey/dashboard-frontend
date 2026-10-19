import { apiRequest } from './client'
import type { SecretIssuer } from './secrets'

export type SecretCaseStage = 'OPEN' | 'IN_PROGRESS' | 'REVALIDATION_PENDING' | 'RESOLVED'
export type SecretCaseOrigin = 'PRODUCTION' | 'TEST'
export type SecretAssignmentReason = 'INITIAL_ASSIGNMENT' | 'OWNERSHIP_CHANGE' | 'TEAM_TRANSFER' | 'UNASSIGNED' | 'OTHER'
export type SecretReviewDecision = 'CONFIRMED' | 'NEEDS_MORE_INFO'
export type SecretReviewReason = 'EVIDENCE_CONFIRMED' | 'INSUFFICIENT_EVIDENCE'
export type SecretChecklistCode = 'IDENTIFY_OWNER' | 'ROTATE_OR_REVOKE' | 'REMOVE_EXPOSURE' | 'CHECK_ACCESS_LOGS'
export type SecretActionType = 'ROTATED' | 'REVOKED' | 'REMOVED_FROM_SOURCE' | 'PERMISSION_REDUCED'

export interface SecretCaseItem {
  caseId: number
  caseOrigin: SecretCaseOrigin
  secretId: number
  maskedLabel: string
  issuer: SecretIssuer
  credentialType: string
  stage: SecretCaseStage
  assigneeTeam: string | null
  assigneeUserId: number | null
  assigneeDisplayName: string | null
  version: number
  createdAt: string
  updatedAt: string
}

export interface SecretAssignmentHistoryItem {
  changedAt: string
  changedByUserId: number
  changedByDisplayName: string
  previousTeam: string | null
  previousUserId: number | null
  previousAssigneeDisplayName: string | null
  newTeam: string | null
  newUserId: number | null
  newAssigneeDisplayName: string | null
  reason: SecretAssignmentReason
}

export interface SecretCaseDetail extends SecretCaseItem {
  openingOccurrenceId: number
  openingReason: string
  assignmentHistory: SecretAssignmentHistoryItem[]
  occurrences: SecretCaseOccurrence[]
  reviewStatus: 'UNREVIEWED' | 'REVIEWED'
  reviews: SecretCaseReview[]
  checklist: SecretCaseChecklistItem[]
  checklistHistory: SecretChecklistChange[]
  actions: SecretCaseAction[]
  stageHistory: SecretCaseStageChange[]
  capabilities: {
    canReview: boolean
    canStart: boolean
    canUpdateChecklist: boolean
    canRecordAction: boolean
  }
}

export interface SecretCaseOccurrence {
  occurrenceId: number
  responseStatus: 'OPEN' | 'IN_PROGRESS' | 'REVALIDATION_PENDING' | 'RESOLVED'
}

export interface SecretCaseReview {
  reviewId: number
  decision: SecretReviewDecision
  reasonCode: SecretReviewReason
  reviewedByUserId: number
  reviewedByName: string
  reviewedAt: string
  caseVersion: number
}

export interface SecretCaseChecklistItem {
  itemId: number
  guideVersion: 'S2_V1'
  itemCode: SecretChecklistCode
  status: 'TODO' | 'DONE'
  evidenceRef: string | null
  completedAt: string | null
  completedByUserId: number | null
  updatedAt: string
}

export interface SecretCaseAction {
  actionId: number
  occurrenceId: number
  actionType: SecretActionType
  performedAt: string
  recordedAt: string
  recordedByUserId: number
  recordedByName: string
  evidenceRef: string
  caseVersion: number
}

export interface SecretChecklistChange {
  itemId: number
  fromStatus: 'TODO' | 'DONE'
  toStatus: 'TODO' | 'DONE'
  evidenceRef: string | null
  changedByUserId: number
  changedAt: string
  caseVersion: number
}

export interface SecretCaseStageChange {
  fromStatus: SecretCaseStage
  toStatus: SecretCaseStage
  reasonCode: string
  actorUserId: number
  changedAt: string
  caseVersion: number
}

export interface SecretAssignee {
  userId: number
  displayName: string
  team: string | null
}

export interface SecretCaseListResponse {
  items: SecretCaseItem[]
  total: number
  page: number
  size: number
}

export interface AssignSecretCaseRequest {
  team: string | null
  assigneeUserId: number | null
  reason: SecretAssignmentReason
  expectedVersion: number
}

export const fetchSecretCases = (page: number, size = 20, origin: SecretCaseOrigin = 'PRODUCTION') =>
  apiRequest<SecretCaseListResponse>(`/api/v1/secrets/cases?page=${page}&size=${size}&origin=${origin}`)

export const fetchSecretCase = (caseId: number) =>
  apiRequest<SecretCaseDetail>(`/api/v1/secrets/cases/${caseId}`)

export const fetchSecretAssignees = (caseId: number) =>
  apiRequest<{ items: SecretAssignee[] }>(`/api/v1/secrets/assignees?caseId=${caseId}`)

export const assignSecretCase = (caseId: number, request: AssignSecretCaseRequest) =>
  apiRequest<SecretCaseDetail>(`/api/v1/secrets/cases/${caseId}/assignment`, {
    method: 'PATCH',
    body: JSON.stringify(request),
  })

export const reviewSecretCase = (caseId: number, request: {
  decision: SecretReviewDecision
  reasonCode: SecretReviewReason
  expectedVersion: number
}) => apiRequest<SecretCaseDetail>(`/api/v1/secrets/cases/${caseId}/review`, {
  method: 'POST', body: JSON.stringify(request),
})

export const startSecretCase = (caseId: number, expectedVersion: number) =>
  apiRequest<SecretCaseDetail>(`/api/v1/secrets/cases/${caseId}/start`, {
    method: 'POST', body: JSON.stringify({ reasonCode: 'RESPONSE_STARTED', expectedVersion }),
  })

export const updateSecretCaseChecklist = (caseId: number, itemId: number, request: {
  completed: boolean
  guideVersion: 'S2_V1'
  evidenceRef: string | null
  expectedVersion: number
}) => apiRequest<SecretCaseDetail>(`/api/v1/secrets/cases/${caseId}/checklist/${itemId}`, {
  method: 'PATCH', body: JSON.stringify(request),
})

export const recordSecretCaseAction = (caseId: number, request: {
  actionType: SecretActionType
  occurrenceId: number
  performedAt: string
  evidenceRef: string
  expectedVersion: number
}) => apiRequest<SecretCaseDetail>(`/api/v1/secrets/cases/${caseId}/actions`, {
  method: 'POST', body: JSON.stringify(request),
})
