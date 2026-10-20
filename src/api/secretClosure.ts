import { apiRequest } from './client'
export interface ClosureCheck { code: string; status: 'PASSED' | 'BLOCKED' | 'UNKNOWN'; reasonCode: string; occurrenceId: number | null; evidenceIds: number[] }
export interface ClosureLocation { occurrenceId: number; safeLocationLabel: string; status: string; reasonCode: string | null }
export interface ClosureLocationGroup { unit: 'Occurrence'; items: ClosureLocation[]; visibleCount: number }
export interface ClosureChecks {
  caseId: number; caseVersion: number | null; targetOrigin: string; closureCheckVersion: string | null
  checkedAt: string; restrictedCoverage: boolean; canResolve: boolean
  allowedCoverageLevels: string[]; coverageOptions: { level: string; limitations: string[]; evidenceIds: number[] }[]
  closureChecks: ClosureCheck[]
  requiredResponseLocations: ClosureLocationGroup; unlinkedAbnormalLocations: ClosureLocationGroup
  unassessedCurrentLocations: ClosureLocationGroup; authorizedStorageLocations: ClosureLocationGroup
  historicalMissingLocations: ClosureLocationGroup; otherOriginNotice: string | null
  capabilities: { canResolve: boolean; canApproveException: boolean; canDismiss: boolean }
  allowedDismissalReasonCodes: string[]; eligibleDismissalEvidenceIds: number[]
  eligibleDismissalEvidenceByReason: Record<string, { evidenceId: number; reasonCode: string; label: string; observedAt: string | null }[]>
  lastResolution?: { resolutionId: number; coverageLevel: string; decidedAt: string; evidenceIds: number[]; limitations: string[] } | null
  lastDismissal?: { dismissalId: number; reasonCode: string; decidedAt: string; evidenceIds: number[] } | null
}
export interface ClosureMutation { caseId: number; version: number; status: string; resolutionId: number | null; coverageLevel: string | null; dismissalId: number | null; exceptionId: number | null; evidenceId: number | null; requiresSnapshotRefresh: boolean }
export interface RiskException {
  exceptionId: number; reasonCode: string; evidenceRef: string | null; approvedByUserId: number
  approvedAt: string; expiresAt: string; revokedAt: string | null; status: string; occurrenceIds: number[]
  currentlyApplicable: boolean; canRevoke: boolean
}
export interface RiskExceptions {
  caseId: number; caseVersion: number | null; items: RiskException[]; canApprove: boolean
  allowedReasonCodes: string[]; allowedRevokeReasonCodes: string[]; eligibleOccurrences: ClosureLocation[]
  maxDurationDays: number; fullyRiskAccepted: boolean; restrictedCoverage: boolean
}
export interface TransferEvidence {
  evidenceId: number; version: number; reasonCode: string; evidenceRef: string | null; acceptedTransferRef: string | null
  occurrenceIds: number[]; submittedByUserId: number; submittedAt: string; status: string
  reviewedByUserId: number | null; canReview: boolean
}
export interface Transfers {
  caseId: number; caseVersion: number | null; items: TransferEvidence[]; canSubmit: boolean
  allowedReasonCodes: string[]; allowedReviewReasonCodes: Record<string, string[]>
}
const path = (id: number) => `/api/v1/secrets/cases/${id}`
export const fetchClosureChecks = (id: number) => apiRequest<ClosureChecks>(`${path(id)}/closure-checks`)
export const resolveSecretResponse = (id: number, request: { decision: 'RESOLVE'; expectedCaseVersion: number; closureCheckVersion: string; evidenceIds: number[]; coverageLevel: string; idempotencyKey: string }) => apiRequest<ClosureMutation>(`${path(id)}/resolution-decisions`, { method: 'POST', body: JSON.stringify(request) })
export const dismissSecretResponse = (id: number, request: { reasonCode: string; evidenceIds: number[]; expectedCaseVersion: number; idempotencyKey: string }) => apiRequest<ClosureMutation>(`${path(id)}/dismissal-decisions`, { method: 'POST', body: JSON.stringify(request) })
export const fetchRiskExceptions = (id: number) => apiRequest<RiskExceptions>(`${path(id)}/exceptions`)
export const approveRiskException = (id: number, request: { occurrenceIds: number[]; reasonCode: string; evidenceRef: string; expiresAt: string; expectedCaseVersion: number; idempotencyKey: string }) => apiRequest<ClosureMutation>(`${path(id)}/exceptions`, { method: 'POST', body: JSON.stringify(request) })
export const revokeRiskException = (id: number, request: { exceptionId: number; reasonCode: string; expectedCaseVersion: number; idempotencyKey: string }) => apiRequest<ClosureMutation>(`${path(id)}/exceptions/revoke`, { method: 'POST', body: JSON.stringify(request) })
export const fetchTransferEvidence = (id: number) => apiRequest<Transfers>(`${path(id)}/transfer-evidence`)
export const submitTransferEvidence = (id: number, request: { occurrenceIds: number[]; reasonCode: string; evidenceRef: string; acceptedTransferRef: string; expectedCaseVersion: number; idempotencyKey: string }) => apiRequest<ClosureMutation>(`${path(id)}/transfer-evidence`, { method: 'POST', body: JSON.stringify(request) })
export const reviewTransferEvidence = (id: number, evidenceId: number, request: { decision: 'APPROVE' | 'REJECT'; reasonCode: string; expectedEvidenceVersion: number; expectedCaseVersion: number; idempotencyKey: string }) => apiRequest<ClosureMutation>(`${path(id)}/transfer-evidence/${evidenceId}/reviews`, { method: 'POST', body: JSON.stringify(request) })
