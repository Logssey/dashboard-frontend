import { apiRequest } from './client'

export interface LifecycleEvidence {
  evidenceId: number
  kind: string
  verificationMethod: string
  verificationLevel: 'PENDING' | 'APPROVED_MANUAL' | 'PROVIDER_VERIFIED' | 'SELF_ATTESTED' | 'REJECTED'
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PROVIDER_VERIFIED'
  performedAt: string
  observedAt: string | null
  evidenceRef: string
  submittedByUserId: number
  version: number
  limitations: string[]
  isCurrentlyApplicable: boolean
  coverageLimit: 'FULL' | 'LIMITED' | 'SIMULATION'
  reviewVerificationLevel?: 'APPROVED_MANUAL' | 'SELF_ATTESTED'
  reviewLimitations?: string[]
  capabilities: { canReview: boolean; canSelfAttest?: boolean }
}
export interface LifecycleEvidencePage {
  caseId: number
  caseVersion: number
  items: LifecycleEvidence[]
  allowedKinds: string[]
  allowedReviewReasonCodes: Record<string, string[]>
  capabilities: { canSubmit: boolean }
  providerVerificationStatus: string
  sourceActions?: { actionId: number; occurrenceId: number; actionType: string; lifecycleKind?: string; performedAt: string; evidenceRef: string; reusable?: boolean; unavailableReasonCode?: string | null; existingEvidenceId?: number | null }[]
}
export interface LifecycleMutation { evidenceId: number; version: number; status: 'PENDING' | 'APPROVED' | 'REJECTED'; requiresSnapshotRefresh: boolean }
const path = (id: number) => `/api/v1/secrets/cases/${id}/lifecycle-evidence`
export const fetchLifecycleEvidence = (id: number) => apiRequest<LifecycleEvidencePage>(path(id))
export const submitLifecycleEvidence = (id: number, request: { kind?: string; performedAt?: string; evidenceRef?: string; sourceActionId?: number; expectedCaseVersion: number; idempotencyKey: string }) => apiRequest<LifecycleMutation>(path(id), { method: 'POST', body: JSON.stringify(request) })
export const reviewLifecycleEvidence = (id: number, evidenceId: number, request: { decision: 'APPROVE' | 'REJECT'; reasonCode: string; expectedEvidenceVersion: number; expectedCaseVersion: number; idempotencyKey: string }) => apiRequest<LifecycleMutation>(`${path(id)}/${evidenceId}/reviews`, { method: 'POST', body: JSON.stringify(request) })
