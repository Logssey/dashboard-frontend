import { apiRequest } from './client'

export type ValidationResult = 'VALID' | 'INVALID' | 'UNKNOWN' | 'UNCHECKED'
export interface ValidationAttempt {
  attemptId: number; result: ValidationResult | null; reasonCode: string; method?: string; validatorVersion?: string; state?: 'RESERVED' | 'SENT' | 'COMPLETED' | 'ABANDONED'
  requestedAt: string | null; requestSentAt?: string | null; providerCheckedAt: string | null; completedAt: string | null
  currentEligible?: boolean; purpose?: string; runId?: number | null
}
export interface ValidationRequest {
  requestId: number; jobId: number; runId?: number | null; status: string; reused?: boolean
  requestedAt?: string | null; startedAt?: string | null; finishedAt?: string | null; availableAt?: string | null
  failureCode?: string | null; reasonCode?: string | null; attemptId?: number | null
}
export interface ValidationPolicy {
  scopeId?: number; enabled: boolean; expectedValidationApprovalRevision: number; profileStatus: 'ENABLED' | 'DISABLED' | 'UNCONFIGURED'; profileVersion?: string | null
  approved?: boolean; supportedTypes?: string[]; reasonCodes?: string[]; blockedReasonCodes?: string[]
  canConfigure?: boolean
}
export interface SecretValidation {
  support: { status: 'SUPPORTED' | 'PARTIAL' | 'UNSUPPORTED'; reasonCode?: string | null; reasonCodes?: string[]; methods?: string[] }
  latestAttempt: ValidationAttempt | null; lastAuthenticatedAt: string | null
  lastConclusiveValidation?: { attemptId: number; result: 'VALID' | 'INVALID'; providerCheckedAt: string } | null
  latestRequest: ValidationRequest | null
  freshness: { status: 'CURRENT' | 'STALE' | 'POST_ACTION_REQUIRED' | 'UNAVAILABLE'; reasonCodes?: string[]; checkDueAt?: string | null }
  nextDueAt: string | null; postActionValidationPending: boolean
  capabilities: { canRequestValidation: boolean; blockedReasonCodes: string[]; canConfigureValidation?: boolean }
  contextVersion: string; readAt: string; coverage?: { restrictedCoverage?: boolean; scopeId?: number }; limitations?: string[]; validationPolicy?: ValidationPolicy
}
export interface ValidationHistory { items: ValidationAttempt[]; total: number; page: number; size: number }
const locationQuery = (occurrenceId?: number | null) => occurrenceId ? `?occurrenceId=${occurrenceId}` : ''
export const fetchSecretValidation = (id: number, occurrenceId?: number | null) => apiRequest<SecretValidation>(`/api/v1/secrets/${id}/validation${locationQuery(occurrenceId)}`)
export const requestSecretValidation = (id: number, request: { occurrenceId: number; expectedContextVersion: string; idempotencyKey: string }) => apiRequest<ValidationRequest>(`/api/v1/secrets/${id}/validation-requests`, { method: 'POST', body: JSON.stringify(request) })
export const fetchValidationRequest = (requestId: number) => apiRequest<ValidationRequest>(`/api/v1/secrets/validation-requests/${requestId}`)
export const fetchValidationHistory = (id: number, occurrenceId: number | null, page: number) => {
  const params = new URLSearchParams({ page: String(page), size: '20' }); if (occurrenceId) params.set('occurrenceId', String(occurrenceId))
  return apiRequest<ValidationHistory>(`/api/v1/secrets/${id}/validation-history?${params}`)
}
export const updateValidationPolicy = (scopeId: number, request: { expectedValidationApprovalRevision: number; idempotencyKey: string; enabled: boolean; reasonCode: string }) => apiRequest<ValidationPolicy>(`/api/v1/secrets/scopes/${scopeId}/validation-policy`, { method: 'PATCH', body: JSON.stringify(request) })
export const fetchValidationPolicy = (scopeId: number) => apiRequest<ValidationPolicy>(`/api/v1/secrets/scopes/${scopeId}/validation-policy`)
