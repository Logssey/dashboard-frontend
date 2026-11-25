import { apiRequest } from './client'

export type AssessmentStatus = 'ASSESSED' | 'UNASSESSED' | 'NOT_APPLICABLE'
export type RiskSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export interface OverrideTarget { assessmentStatus: 'ASSESSED' | 'NOT_APPLICABLE'; severity: RiskSeverity | null; basisAssessmentId: number }
export interface RiskAssessment {
  assessmentId: number | null; assessmentStatus: AssessmentStatus; severity: RiskSeverity | null
  ruleId: string | null; policyVersion: string; assessedAt: string | null
  held?: boolean; holdReasonCodes?: string[]; sourceAssessmentId?: number; reviewRequired?: boolean; reasonCodes?: string[]
}
export interface RiskEvidence {
  evidenceId: number; type?: string; evidenceType?: string; kind?: string; verificationLevel: string; observedAt: string | null; status?: string
  validUntil?: string | null; expiresAt?: string | null; reasonCodes?: string[]; canDecide?: boolean; allowedDecisionReasonCodes?: string[]
  currentEligible?: boolean; facts?: Record<string, string | number | boolean>; evidenceRef?: string
  applicableFrom?: string | null; applicableUntil?: string | null
}
export interface RiskEvidenceField { name: string; type: 'ENUM' | 'BOOLEAN' | 'INTEGER'; required: boolean; options?: string[]; minimum?: number; maximum?: number }
export interface RiskEvidenceForm { evidenceType: string; subject: 'OCCURRENCE'; fields: RiskEvidenceField[]; assessmentSupport?: string; reasonCode?: string }
export interface RiskSourceRef { type: 'VALIDATION_ATTEMPT' | 'INVESTIGATION_HISTORY' | 'RISK_EVIDENCE' | 'ASSET'; id: number; version: number; role: 'BINDS_IDENTITY' | 'ASSERTS' | 'LIMITS' | 'CLASSIFIES'; labelCode?: string; observedAt?: string | null }
export interface RiskOverride extends RiskAssessment { canReview?: boolean; allowedDecisionReasonCodes?: string[]; validUntil?: string | null; status?: string; reasonCode?: string; targetAssessmentStatus?: AssessmentStatus; targetSeverity?: RiskSeverity | null; evidenceIds?: number[]; basisAssessmentId?: number | null; createdAt?: string }
export type RiskInput = string | null | { value: string; observedAt?: string | null; verificationLevel?: string; freshness?: string }
export interface RiskAnalysisContext {
  occurrenceId: number; evidenceRevision: number; profileVersion: 'risk-context-v1'; readAt: string
  source: { provider: string; issuer: string; credentialType: string }
  access: { status: 'CONFIRMED' | 'UNKNOWN'; range: string; observedAt: string | null; validUntil: string | null; evidenceIds: number[]; verificationLevel: string | null; repositoryPublicObserved?: boolean; coexistenceStatus?: 'CONFIRMED' | 'UNCONFIRMED' | 'UNKNOWN'; publicObservationAt?: string | null }
  permissions: {
    status: 'CONFIRMED' | 'PARTIAL' | 'UNKNOWN'; capabilities: string[]; targetScopes: string[]
    coverage: { permissionCoverage: string; targetCoverage: string; restrictionCoverage: string; classificationCoverage: string }
    observedAt: string | null; validUntil: string | null; evidenceIds: number[]; reasonCodes: string[]
    verificationLevel?: 'MANUAL_ACCEPTED' | null; mappingVersion?: string | null
  }
  asset: {
    status: 'UNLINKED' | 'LINKED' | 'CLASSIFIED'; assetId: number | null; label: string | null; provider: string | null; assetType: string | null; environment: string
    classification: { sensitive: boolean; important: boolean; testOnly: boolean } | null; evidenceIds: number[]
  }
  explanation: { ruleId: string | null; policyVersion: string; reasonCode: string; inputs: Record<string, RiskInput>; missingReasonCodes: string[]; assessmentCurrent: boolean }
  limitations: string[]
}
export interface SecretRisk {
  legacyExposureAssessment?: { decision: string; assessmentId: number; scopeRevision: number | null; currentScopeRevision: number; needsReconfirmation: boolean; reasonCodes: string[] }
  latestAutomaticAssessment: RiskAssessment | null; effectiveAssessment: RiskAssessment | null
  lastConfirmedSeverity: { severity: RiskSeverity; assessmentId: number; assessedAt: string | null } | null
  evidenceRevision: number; inputs?: Record<string, RiskInput>; evidenceSummary?: RiskEvidence[]; positiveCapabilities?: string[]
  missingReasonCodes?: string[]; conflictReasonCodes?: string[]; freshness?: string | { status?: string; reasonCodes?: string[]; currentEligible?: boolean; profileVersion?: string }
  capabilities: { canSubmitEvidence?: boolean; canRequestAssessment?: boolean; canProposeOverride?: boolean; canReviewOverrides?: boolean; blockedReasonCodes?: string[] }
  nextAction?: string | { code: string; canExecute?: boolean; target?: { kind?: string; id?: number }; label?: string }
  readAt: string; evidenceForms?: RiskEvidenceForm[]; overrideProposals?: RiskOverride[]; allowedOverrideReasonCodes?: string[]
  allowedOverrideTargets?: OverrideTarget[]; overrideMaxDurationDays?: number
  availableSourceRefs?: RiskSourceRef[]
  analysisContext?: RiskAnalysisContext
  riskExperience?: RiskExperience
}
export interface RiskCriterion {
  axis: 'exposure' | 'exposureRange' | 'credential' | 'impact' | 'abuse' | 'validity'
  label: string; value: string; status: 'CONFIRMED' | 'CANDIDATE' | 'UNKNOWN' | 'STALE' | 'CONFLICT'
  evidenceIds: number[]; reasonCodes: string[]; nextAction: string
}
export interface RiskExperience {
  version: 'risk-experience-v1'; readAt: string; severityLabel: string; sourcePresenceObservedAt: string | null
  summary: { status: 'CURRENT' | 'STALE' | 'UNASSESSED' | 'METADATA_ONLY'; reasonCode: string; ruleId: string | null; severity: RiskSeverity | null; automaticSeverity?: RiskSeverity | null; held?: boolean }
  criteria: RiskCriterion[]
  missingFacts: { code: string; evidenceType: string | null; action: string }[]
  workPriority: {
    policyVersion: 'work-priority-v1'; level: 'IMMEDIATE' | 'PRIORITY' | 'GENERAL' | 'PLANNED' | 'INVENTORY'
    reasonCodes: string[]; clockMode: 'BUSINESS_HOURS'; timeZone: string; targetBasis: 'FIRST_OBSERVED' | 'GRADE_ACTIVATED' | 'UNCONFIRMED' | 'NOT_APPLICABLE' | 'PRIORITY_SIGNAL_OBSERVED'; targetBasisAt: string | null
    acknowledgeDueAt: string | null; planDueAt: string | null; operatingHoursNow: boolean; holidayCalendarConfigured: boolean
  }
  riskAcceptance: { enabled: false; reasonCode: string; allowedSeverities: string[]; maximumDays: number }
  support: { permissionAssistance: { status: 'PARTIAL' | 'UNSUPPORTED'; reasonCodes: string[] }; automaticUsage: { status: 'UNSUPPORTED'; reasonCodes: string[] } }
}
export interface AssessmentHistory { items: (Partial<RiskAssessment> & { assessmentId: number; recordKind?: string; decision?: string; reasonCode?: string; createdAt?: string; actorUserId?: number })[]; total: number; page: number; size: number }
export const fetchOccurrenceRisk = (occurrenceId: number) => apiRequest<SecretRisk>(`/api/v1/secrets/occurrences/${occurrenceId}/risk`)
export const fetchAssessmentHistory = (occurrenceId: number, page: number) => apiRequest<AssessmentHistory>(`/api/v1/secrets/occurrences/${occurrenceId}/assessment-history?page=${page}&size=20`)
export interface RiskAsset { assetId: number; label: string; provider: string; assetType: string; environment: string }
export interface RiskAssetsResponse { occurrenceId: number; evidenceRevision: number; items: RiskAsset[]; total: number; page: number; size: number; capabilities: { canLinkAsset: boolean }; limitations: string[] }
export const fetchRiskAssets = (occurrenceId: number, page = 0) => apiRequest<RiskAssetsResponse>(`/api/v1/secrets/occurrences/${occurrenceId}/risk-assets?page=${page}&size=20`)
export interface RiskEvidenceRequest { expectedEvidenceRevision: number; idempotencyKey: string; evidenceType: string; subject: 'OCCURRENCE'; observedAt: string; validUntil: string | null; applicableFrom?: string | null; applicableUntil?: string | null; evidenceRef?: string; facts: Record<string, string | number | boolean>; sourceRefs?: Pick<RiskSourceRef, 'type' | 'id' | 'version' | 'role'>[]; assetId?: number | null }
export interface RiskDecisionRequest { expectedEvidenceRevision: number; idempotencyKey: string; decision: string; reasonCode: string }
export interface AssessmentRequest { requestId: number; jobId: number; status: string; reused?: boolean; runId?: null; assessmentId?: number | null; failureCode?: string | null; reasonCode?: string | null }
export interface SeverityOverrideRequest { expectedEvidenceRevision: number; idempotencyKey: string; targetAssessmentStatus: 'ASSESSED' | 'NOT_APPLICABLE'; targetSeverity: RiskSeverity | null; basisAssessmentId: number | null; reasonCode: string; evidenceIds: number[]; validUntil: string }
export const submitRiskEvidence = (id: number, body: RiskEvidenceRequest) => apiRequest<{ evidenceId: number; status: string; evidenceRevision: number }>(`/api/v1/secrets/occurrences/${id}/risk-evidence`, { method: 'POST', body: JSON.stringify(body) })
export const decideRiskEvidence = (id: number, evidenceId: number, body: RiskDecisionRequest) => apiRequest<{ evidenceId: number; status: string; evidenceRevision: number }>(`/api/v1/secrets/occurrences/${id}/risk-evidence/${evidenceId}/decisions`, { method: 'POST', body: JSON.stringify(body) })
export const requestAssessment = (id: number, body: { expectedEvidenceRevision: number; idempotencyKey: string }) => apiRequest<AssessmentRequest>(`/api/v1/secrets/occurrences/${id}/assessment-requests`, { method: 'POST', body: JSON.stringify(body) })
export const fetchAssessmentRequest = (id: number) => apiRequest<AssessmentRequest>(`/api/v1/secrets/assessment-requests/${id}`)
export const proposeSeverityOverride = (id: number, body: SeverityOverrideRequest) => apiRequest<{ assessmentId: number; status: string; evidenceRevision: number }>(`/api/v1/secrets/occurrences/${id}/severity-overrides`, { method: 'POST', body: JSON.stringify(body) })
export const decideSeverityOverride = (id: number, assessmentId: number, body: RiskDecisionRequest) => apiRequest<{ assessmentId: number; status: string; evidenceRevision: number }>(`/api/v1/secrets/occurrences/${id}/severity-overrides/${assessmentId}/decisions`, { method: 'POST', body: JSON.stringify(body) })
