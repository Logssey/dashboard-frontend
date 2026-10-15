import { apiRequest } from './client'
import type { SecretIssuer } from './secrets'

export type SecretCaseStage = 'OPEN' | 'IN_PROGRESS' | 'REVALIDATION_PENDING' | 'RESOLVED'
export type SecretCaseOrigin = 'PRODUCTION' | 'TEST'
export type SecretAssignmentReason = 'INITIAL_ASSIGNMENT' | 'OWNERSHIP_CHANGE' | 'TEAM_TRANSFER' | 'UNASSIGNED' | 'OTHER'

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
