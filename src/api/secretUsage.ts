import { apiRequest } from './client'

export interface UsageSourceRef { type: 'INVESTIGATION_HISTORY' | 'ACTION_RECORD'; id: number; labelCode?: string; recordedAt?: string | null }
export interface UsageTargetRef { type: 'APPROVED_SCOPE' | 'ASSET'; id: number }
export interface UsageTarget { targetId: number; displayName: string; accountRef: string; region: string }
export interface UsageRequest {
  requestId: number; status: string; observationStatus: string; coverageStatus: string; bindingLevel: string; reasonCodes: string[]
  windowStart: string; windowEnd: string; requestedAt: string; startedAt: string | null; completedAt: string | null
  pageCount: number; eventCount: number; target: { targetId: number; accountRef: string; region: string }; currentApplicable: boolean
  credentialId: number; occurrenceId: number; evidenceRevision: number
  availableFrom?: string | null; triggerType?: string
}
export interface UsageObservation {
  credentialId: number; occurrenceId: number; evidenceRevision: number
  observationId: number; sourceKind: 'PROVIDER' | 'MANUAL'; bindingLevel: string; coverageStatus: string
  actionCode: string; operationCode?: string; actionResult: string; actorAttribution: string; eventAt: string; windowStart: string; windowEnd: string
  sourceRef: UsageSourceRef | null; targetRef: UsageTargetRef | null
  reviewStatus: string; observationRevision: number; allowedDecisions: string[]
  currentApplicable: boolean
  collectionScope?: { accountRef: string; region: string } | null
  decisionHistory: { decision: string; reasonCode: string; decidedAt: string; revision: number }[]
}
export interface SecretUsage {
  credentialId: number; occurrenceId: number; credentialRevision: number; scopeRevision: number
  support: { status: 'PARTIAL' | 'UNSUPPORTED'; reasonCodes: string[] }
  capabilities: { canRequest: boolean; canSubmit: boolean; blockedReasonCodes: string[] }
  targetOptions: UsageTarget[]; availableSourceRefs: UsageSourceRef[]; availableTargetRefs: UsageTargetRef[]
  latestRequest: UsageRequest | null; observationStatus: string
  iamLastUsed: { lastUsedAt: string | null; service: string | null; region: string | null; observedAt: string } | null
  observations: { items: UsageObservation[]; page: number; pageSize: number; totalElements: number }
}
export interface UsageRequestInput {
  occurrenceId: number; serverRegisteredTargetId: number; windowStart: string; windowEnd: string
  expectedCredentialRevision: number; expectedScopeRevision: number; idempotencyKey: string
}
export interface ManualUsageInput {
  occurrenceId: number; expectedCredentialRevision: number; expectedScopeRevision: number; sourceRef: UsageSourceRef; targetRef: UsageTargetRef
  windowStart: string; windowEnd: string; eventAt: string; actionCode: string; actionResult: string; actorAttribution: string; idempotencyKey: string
}
export interface UsageDecisionInput { decision: string; expectedObservationRevision: number; reasonCode: string; idempotencyKey: string }
export const fetchSecretUsage = (credentialId: number, occurrenceId: number, page = 1) => apiRequest<SecretUsage>(`/api/v1/secrets/${credentialId}/usage?occurrenceId=${occurrenceId}&page=${page}&pageSize=20`)
export const requestSecretUsage = (credentialId: number, body: UsageRequestInput) => apiRequest<UsageRequest>(`/api/v1/secrets/${credentialId}/usage-requests`, { method: 'POST', body: JSON.stringify(body) })
export const fetchUsageRequest = (requestId: number) => apiRequest<UsageRequest>(`/api/v1/secrets/usage-requests/${requestId}`)
export const submitUsageObservation = (credentialId: number, body: ManualUsageInput) => apiRequest<UsageObservation>(`/api/v1/secrets/${credentialId}/usage-observations`, { method: 'POST', body: JSON.stringify(body) })
export const decideUsageObservation = (observationId: number, body: UsageDecisionInput) => apiRequest<UsageObservation>(`/api/v1/secrets/usage-observations/${observationId}/decisions`, { method: 'POST', body: JSON.stringify(body) })
