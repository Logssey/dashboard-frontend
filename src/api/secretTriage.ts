import { apiRequest } from './client'
import type { SecretComponentState, SecretIssuer, SecretOrigin } from './secrets'

export type ReviewDecision = 'ABNORMAL' | 'NORMAL' | 'FALSE_POSITIVE' | 'NEEDS_MORE_INFO'
export interface ReviewContext {
  credentialSetId: number
  occurrenceId: number
  connectionId: number
  scopeId: number
  scopeRevision: number
  origin: SecretOrigin
  componentState: SecretComponentState
  presence: string
  exposureStatus: string
  maskedLabel: string
  issuer: SecretIssuer
  credentialType: string
  safeLocationLabel: string
  findings: { findingId: number; ruleId: string; ruleVersion: string | null; detectedAt: string; valid: boolean }[]
  storagePolicy: { result: string; policyId: number | null; version: number | null; bindingId: number | null; reasonCode: string; requiresReassessment: boolean }
  validity: { result: string; reasonCode: string | null; observedAt: string | null }
  versions: { occurrence: number; scope: number; policy: number | null }
  allowedDecisions: ReviewDecision[]
  allowedReasonCodes: Record<string, string[]>
  allowedMissingReasonCodes: string[]
  eligibleInvestigationAssignees: { userId: number; displayName: string }[]
  caseLinkData: { caseId: number | null; caseVersion: number | null; caseOrigin: SecretOrigin | null; caseLinkStatus: string; canRepair: boolean; decisionId: number | null; decisionVersion: number | null }
}
export interface ReviewQueueItem {
  credentialSetId: number
  occurrenceId: number | null
  caseId: number | null
  origin: SecretOrigin
  maskedLabel: string
  componentState: SecretComponentState
  presence: string
  exposureStatus: string
  whyHere: string
  nextAction: string
  assigneeDisplayName?: string | null
  dueAt?: string | null
  inventorySubtype?: string | null
  safeLocationLabel?: string | null
}
export interface ReviewQueuePage { items: ReviewQueueItem[]; total: number; page: number; size: number; unit: string; asOf: string; partialCoverage: boolean | null; snapshotId?: string; expiresAt?: string }
export interface ReviewRequest {
  decision: ReviewDecision
  reasonCode: string
  findingId: number | null
  evidenceRefs: string[]
  expectedOccurrenceVersion: number
  expectedScopeVersion: number
  expectedPolicyVersion: number | null
  idempotencyKey: string
  missingReasonCode?: string
  followUpOwnerUserId?: number
  dueAt?: string
  evidenceRef?: string
}
export interface ReviewResult {
  decisionId: number
  occurrenceId: number
  exposureStatus: string
  caseId: number | null
  caseOperation: 'CREATED' | 'ATTACHED' | 'NONE'
  caseVersion: number | null
  investigationTaskId: number | null
  correctionId: number | null
  queueBucket: string
  requiresSnapshotRefresh: boolean
}
export const fetchReviewQueue = (bucket: string, origin: string, page: number, snapshotId = '', stages = '') => {
  const params = new URLSearchParams({ bucket, origin, page: String(page), size: '20' })
  if (snapshotId) params.set('snapshotId', snapshotId)
  if (stages) params.set('stages', stages)
  return apiRequest<ReviewQueuePage>(`/api/v1/secrets/review-queue?${params}`)
}
export const fetchReviewContext = (occurrenceId: number) => apiRequest<ReviewContext>(`/api/v1/secrets/occurrences/${occurrenceId}/review-context`)
export const decideSecretOccurrence = (occurrenceId: number, request: ReviewRequest) => apiRequest<ReviewResult>(`/api/v1/secrets/occurrences/${occurrenceId}/decisions`, { method: 'POST', body: JSON.stringify(request) })
export const repairSecretCaseLink = (occurrenceId: number, request: { decisionId: number; expectedDecisionVersion: number; expectedOccurrenceVersion: number; expectedScopeVersion: number; idempotencyKey: string }) => apiRequest<ReviewResult>(`/api/v1/secrets/occurrences/${occurrenceId}/case-links`, { method: 'POST', body: JSON.stringify(request) })
