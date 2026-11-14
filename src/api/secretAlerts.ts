import { apiRequest } from './client'
import type { EvidenceMutation } from './secretInvestigations'

export interface SecretKeyAlert {
  alertId: number
  credentialSetId: number
  status: string
  assigneeUserId: number | null
  assigneeDisplayName: string | null
  dueAt: string | null
  version: number
  testCaseId: number | null
  investigationTaskId: number | null
  acknowledgedAt: string | null
  firstObservedAt: string
  lastObservedAt: string
  closedAt: string | null
  locations: { occurrenceId: number; scopeId: number; safeDisplayAlias: string; fixtureStatus: string }[]
  eligibleAssignees: { userId: number; displayName: string }[]
  allowedAssignmentReasonCodes: string[]
  allowedAcknowledgementReasonCodes: string[]
  allowedClosureReasonCodes: string[]
  eligibleClosureEvidence: {
    fixtureAttestations: { attestationId: number; scopeId: number; scopeRevision: number; manifestId: number; manifestVersion: number; confirmedAt: string }[]
    corrections: { correctionId: number; findingId: number; correctedAt: string }[]
    lifecycleEvidence: { evidenceId: number; kind: string; verificationLevel: string; observedAt: string }[]
  }
  capabilities: { canAssign: boolean; canAcknowledge: boolean; canClose: boolean }
  restrictedCoverage: boolean
}
export interface AlertPage { items: SecretKeyAlert[]; total: number; page: number; size: number }
export const fetchKeyAlerts = (status: string, owner: string, page: number) => apiRequest<AlertPage>(`/api/v1/secrets/cross-environment-alerts?status=${status}&owner=${owner}&page=${page}&size=20`)
export const fetchKeyAlert = (alertId: number) => apiRequest<SecretKeyAlert>(`/api/v1/secrets/cross-environment-alerts/${alertId}`)
export const assignKeyAlert = (alertId: number, request: { assigneeUserId: number | null; dueAt: string | null; reasonCode: string; expectedVersion: number; idempotencyKey: string }) => apiRequest<EvidenceMutation>(`/api/v1/secrets/cross-environment-alerts/${alertId}/assignment`, { method: 'PATCH', body: JSON.stringify(request) })
export const acknowledgeKeyAlert = (alertId: number, request: { expectedVersion: number; reasonCode: string; idempotencyKey: string }) => apiRequest<EvidenceMutation>(`/api/v1/secrets/cross-environment-alerts/${alertId}/acknowledge`, { method: 'POST', body: JSON.stringify(request) })
export const closeKeyAlert = (alertId: number, request: { expectedVersion: number; reasonCode: string; fixtureAttestationIds: number[]; correctionIds: number[]; lifecycleEvidenceIds: number[]; caseId: number | null; investigationTaskId: number | null; idempotencyKey: string }) => apiRequest<EvidenceMutation>(`/api/v1/secrets/cross-environment-alerts/${alertId}/close`, { method: 'POST', body: JSON.stringify(request) })
