import { apiRequest } from './client'
import type { CaseCommandResult } from './secretCases'

export type SecretRevalidationJobStatus = 'PENDING' | 'LEASED' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
export type SecretRevalidationResult = 'PENDING' | 'MISSING' | 'PRESENT' | 'UNKNOWN'
export interface SecretCaseRevalidation {
  revalidationId: number; occurrenceId: number; runId: number
  jobStatus: SecretRevalidationJobStatus; result: SecretRevalidationResult
  failureCode: string | null; requestedAt: string; finishedAt: string | null
}
export interface LocationVersionRequest {
  occurrenceId: number; expectedCaseVersion: number; expectedOccurrenceVersion: number; idempotencyKey: string
}
export const fetchSecretCaseRevalidations = (id: number) => apiRequest<SecretCaseRevalidation[]>(`/api/v1/secrets/cases/${id}/revalidations`)
export const requestSecretCaseRevalidation = (id: number, request: LocationVersionRequest) => apiRequest<SecretCaseRevalidation>(`/api/v1/secrets/cases/${id}/revalidations`, { method: 'POST', body: JSON.stringify(request) })
export const resumeSecretCase = (id: number, request: LocationVersionRequest & { reasonCode: 'REVALIDATION_PRESENT' }) => apiRequest<CaseCommandResult>(`/api/v1/secrets/cases/${id}/revalidation-resume`, { method: 'POST', body: JSON.stringify(request) })
