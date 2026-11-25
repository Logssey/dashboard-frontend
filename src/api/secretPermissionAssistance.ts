import { apiRequest } from './client'
import type { RiskSourceRef } from './secretRisk'

export interface PermissionCoverage { permissionCoverage: string; targetCoverage: string; restrictionCoverage: string; classificationCoverage: string }
export interface PermissionObservation {
  observationId: number; status: 'PARTIAL' | 'COMPLETE' | 'UNSUPPORTED'; capabilities: string[]
  coverage: PermissionCoverage; reasonCodes: string[]; observedAt: string; expiresAt: string
  decision?: 'CONFIRMED' | 'REJECTED' | 'DRAFTED' | null
  sourceBasis?: 'RECENT_VALIDATION_METADATA' | 'APPROVED_IAM_POLICY_METADATA'
}
export interface PermissionSupplementation { investigationTaskId: number | null; occurrenceVersion: number; canRequestInvestigation: boolean }
export interface PermissionRequest {
  requestId: number; jobId: number; status: string; failureCode?: string | null; requestedAt?: string; finishedAt?: string | null
  observation?: PermissionObservation | null; currentContextVersion?: string
}
export interface PermissionAssistance {
  occurrenceId: number; contextVersion: string; evidenceRevision: number
  support: { status: 'SUPPORTED' | 'PARTIAL' | 'UNSUPPORTED'; reasonCodes: string[] }
  identity: { status: 'MATCHED' | 'UNAVAILABLE' | 'STALE'; provider: string; observedAt: string | null; validationAttemptId: number | null; principalType?: string }
  collectorOptions: { connectionId: number; displayName: string }[]
  latestRequest: PermissionRequest | null; latestObservation: PermissionObservation | null
  capabilities: { canRequest: boolean; blockedReasonCodes: string[] }
  supplementation?: PermissionSupplementation
  requestReadiness?: { nextAction: string; checks: { code: string; status: 'READY' | 'BLOCKED' | 'WAITING' | 'UNSUPPORTED'; action: string | null }[] }
}
export interface PermissionPreview extends PermissionObservation {
  latestDraft?: {
    evidenceId: number; evidenceRevision: number; observationId: number; savedAt: string
    observedAt: string; validUntil: string; evidenceRef: string
    facts: PermissionCoverage & { capability: string; targetScope: string }
    sourceRefs: RiskSourceRef[]; applicableFrom: string | null; applicableUntil: string | null
    canRestore: boolean; reasonCode: string | null
  }
  canSavePartial?: boolean
  partialDefaults?: { observedAt: string; validUntil: string; evidenceRef?: string }
  contextVersion: string; evidenceRevision: number; availableSourceRefs: RiskSourceRef[]; canConfirm: boolean; canReject?: boolean; blockedReasonCodes: string[]
  supplementation?: PermissionSupplementation
  sourcePresenceObservedAt?: string | null
}
export interface PermissionConfirmation {
  expectedContextVersion: string; expectedEvidenceRevision: number; idempotencyKey: string; attestation: true
  evidenceRef?: string; observedAt: string; validUntil: string; facts: PermissionCoverage & { capability: string; targetScope: string }
  sourceRefs: Pick<RiskSourceRef, 'type' | 'id' | 'version' | 'role'>[]
  applicableFrom?: string | null; applicableUntil?: string | null
}
export interface PartialPermissionConfirmation {
  savePartial: true
  expectedContextVersion: string
  expectedEvidenceRevision: number
  idempotencyKey: string
  attestation: true
  evidenceRef?: string
  observedAt?: string
  validUntil?: string
  facts: PermissionCoverage & { capability: string; targetScope: string }
  sourceRefs: Pick<RiskSourceRef, 'type' | 'id' | 'version' | 'role'>[]
  applicableFrom?: string | null
  applicableUntil?: string | null
}
const base = (id: number) => `/api/v1/secrets/occurrences/${id}/permission-assistance`
export const fetchPermissionAssistance = (id: number) => apiRequest<PermissionAssistance>(base(id))
export const requestPermissionAssistance = (id: number, body: { expectedContextVersion: string; idempotencyKey: string; collectorConnectionId?: number }) => apiRequest<PermissionRequest>(`${base(id)}/requests`, { method: 'POST', body: JSON.stringify(body) })
export const fetchPermissionRequest = (id: number, requestId: number) => apiRequest<PermissionRequest>(`${base(id)}/requests/${requestId}`)
export const fetchPermissionPreview = (id: number, observationId: number) => apiRequest<PermissionPreview>(`${base(id)}/observations/${observationId}/preview`)
export const confirmPermissionObservation = (id: number, observationId: number, body: PermissionConfirmation | PartialPermissionConfirmation) => apiRequest<{ status: string; evidenceId: number; evidenceRevision?: number }>(`${base(id)}/observations/${observationId}/confirm`, { method: 'POST', body: JSON.stringify(body) })
export const rejectPermissionObservation = (id: number, observationId: number, body: { expectedContextVersion: string; idempotencyKey: string; reasonCode: string }) => apiRequest<{ status: string }>(`${base(id)}/observations/${observationId}/reject`, { method: 'POST', body: JSON.stringify(body) })
