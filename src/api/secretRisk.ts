import { apiRequest } from './client'

export type AssessmentStatus = 'ASSESSED' | 'UNASSESSED' | 'NOT_APPLICABLE'
export type RiskSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export interface RiskAssessment {
  assessmentId: number | null; assessmentStatus: AssessmentStatus; severity: RiskSeverity | null
  ruleId: string | null; policyVersion: string; assessedAt: string | null
  held?: boolean; holdReasonCodes?: string[]; sourceAssessmentId?: number; reviewRequired?: boolean; reasonCodes?: string[]
}
export interface RiskEvidence {
  evidenceId: number; type?: string; evidenceType?: string; kind?: string; verificationLevel: string; observedAt: string | null; status?: string
  validUntil?: string | null; expiresAt?: string | null; reasonCodes?: string[]; canDecide?: boolean; allowedDecisionReasonCodes?: string[]
  currentEligible?: boolean; facts?: Record<string, string | number | boolean>; evidenceRef?: string
}
export interface RiskEvidenceField { name: string; type: 'ENUM' | 'BOOLEAN' | 'INTEGER'; required: boolean; options?: string[]; minimum?: number; maximum?: number }
export interface RiskEvidenceForm { evidenceType: string; subject: 'OCCURRENCE'; fields: RiskEvidenceField[] }
export interface RiskOverride extends RiskAssessment { canReview?: boolean; allowedDecisionReasonCodes?: string[]; validUntil?: string | null; status?: string; reasonCode?: string; targetAssessmentStatus?: AssessmentStatus; targetSeverity?: RiskSeverity | null }
export type RiskInput = string | null | { value: string; observedAt?: string | null; verificationLevel?: string; freshness?: string }
export interface SecretRisk {
  latestAutomaticAssessment: RiskAssessment | null; effectiveAssessment: RiskAssessment | null
  lastConfirmedSeverity: { severity: RiskSeverity; assessmentId: number; assessedAt: string | null } | null
  evidenceRevision: number; inputs?: Record<string, RiskInput>; evidenceSummary?: RiskEvidence[]; positiveCapabilities?: string[]
  missingReasonCodes?: string[]; conflictReasonCodes?: string[]; freshness?: string | { status: string; reasonCodes?: string[] }
  capabilities: { canSubmitEvidence?: boolean; canRequestAssessment?: boolean; canProposeOverride?: boolean; canReviewOverrides?: boolean; blockedReasonCodes?: string[] }
  nextAction?: string | { code: string; canExecute?: boolean; target?: { kind?: string; id?: number }; label?: string }
  readAt: string; evidenceForms?: RiskEvidenceForm[]; overrideProposals?: RiskOverride[]; allowedOverrideReasonCodes?: string[]
}
export interface AssessmentHistory { items: (Partial<RiskAssessment> & { assessmentId: number; recordKind?: string; decision?: string; reasonCode?: string; createdAt?: string; actorUserId?: number })[]; total: number; page: number; size: number }
export const fetchOccurrenceRisk = (occurrenceId: number) => apiRequest<SecretRisk>(`/api/v1/secrets/occurrences/${occurrenceId}/risk`)
export const fetchAssessmentHistory = (occurrenceId: number, page: number) => apiRequest<AssessmentHistory>(`/api/v1/secrets/occurrences/${occurrenceId}/assessment-history?page=${page}&size=20`)
