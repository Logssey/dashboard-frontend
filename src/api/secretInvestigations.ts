import { apiRequest } from './client'

export interface InvestigationTask {
  taskId: number
  targetType: string
  occurrenceId: number | null
  credentialSetId?: number | null
  connectionId?: number | null
  scopeId: number
  missingReasonCode: string
  creationSource: string
  assigneeUserId: number | null
  assigneeDisplayName: string | null
  dueAt: string | null
  status: string
  version: number
  evidenceRef: string | null
  createdAt: string
  closedAt: string | null
  capabilities: { canAssign: boolean; canAddEvidence: boolean; canClose: boolean }
}
export interface InvestigationDetail extends InvestigationTask {
  eligibleAssignees: { userId: number; displayName: string }[]
  allowedAssignmentReasonCodes: string[]
  allowedEvidenceKinds: string[]
  eligibleClosureEvidence: { decisions: { decisionId: number; decision: string; decidedAt: string }[]; runScopes: { runScopeId: number; runId: number; finishedAt: string }[] }
  activities: { historyId: number; eventType: string; actorDisplayName: string | null; evidenceRef: string | null; version: number; createdAt: string; safeChanges: Record<string, unknown> }[]
}
export interface InvestigationPage { items: InvestigationTask[]; total: number; page: number; size: number }
export interface EvidenceMutation { taskId?: number; alertId?: number; attestationId?: number; version: number; status: string; requiresSnapshotRefresh: boolean }
export interface FixtureAttestations {
  items: { attestationId: number; scopeId: number; scopeRevision: number; manifestId: number; manifestVersion: number; matchEvidenceId: number; confirmationSource: string; status: string; confirmedAt: string; isCurrentlyValid: boolean }[]
  eligibleMatches: { matchEvidenceId: number; scopeId: number; scopeRevision: number; expectedScopeVersion: number; manifestId: number; manifestVersion: number; observedAt: string }[]
  fixtureStatus: string | null
  capabilities: { canAttest: boolean }
}
export const fetchInvestigations = (status: string, owner: string, page: number) => apiRequest<InvestigationPage>(`/api/v1/secrets/investigations?status=${status}&owner=${owner}&page=${page}&size=20`)
export const fetchInvestigation = (taskId: number) => apiRequest<InvestigationDetail>(`/api/v1/secrets/investigations/${taskId}`)
export const assignInvestigation = (taskId: number, request: { assigneeUserId: number | null; dueAt: string | null; reasonCode: string; expectedVersion: number; idempotencyKey: string }) => apiRequest<EvidenceMutation>(`/api/v1/secrets/investigations/${taskId}/assignment`, { method: 'PATCH', body: JSON.stringify(request) })
export const addInvestigationEvidence = (taskId: number, request: { evidenceRef: string; evidenceKind: string; observedAt: string; expectedVersion: number; idempotencyKey: string }) => apiRequest<EvidenceMutation>(`/api/v1/secrets/investigations/${taskId}/evidence`, { method: 'POST', body: JSON.stringify(request) })
export const closeInvestigation = (taskId: number, request: { expectedVersion: number; resolvingDecisionId: number | null; restoredRunScopeId: number | null; idempotencyKey: string }) => apiRequest<EvidenceMutation>(`/api/v1/secrets/investigations/${taskId}/close`, { method: 'POST', body: JSON.stringify(request) })
export const fetchFixtureAttestations = (credentialSetId: number) => apiRequest<FixtureAttestations>(`/api/v1/secrets/${credentialSetId}/fixture-attestations`)
export const attestFixture = (credentialSetId: number, request: { scopeId: number; expectedScopeVersion: number; manifestId: number; manifestVersion: number; matchEvidenceId: number; idempotencyKey: string }) => apiRequest<EvidenceMutation>(`/api/v1/secrets/${credentialSetId}/fixture-attestations`, { method: 'POST', body: JSON.stringify(request) })
