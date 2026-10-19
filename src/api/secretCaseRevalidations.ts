import { apiRequest } from './client'
import type { SecretCaseDetail } from './secretCases'

export type SecretRevalidationJobStatus = 'PENDING' | 'LEASED' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
export type SecretRevalidationResult = 'PENDING' | 'MISSING' | 'PRESENT' | 'UNKNOWN'

export interface SecretCaseRevalidation {
  revalidationId: number
  occurrenceId: number
  runId: number
  jobStatus: SecretRevalidationJobStatus
  result: SecretRevalidationResult
  failureCode: string | null
  requestedAt: string
  finishedAt: string | null
}

export const fetchSecretCaseRevalidations = (caseId: number) =>
  apiRequest<SecretCaseRevalidation[]>(`/api/v1/secrets/cases/${caseId}/revalidations`)

export const requestSecretCaseRevalidation = (caseId: number, request: {
  occurrenceId: number
  expectedVersion: number
  idempotencyKey: string
}) => apiRequest<SecretCaseRevalidation>(`/api/v1/secrets/cases/${caseId}/revalidations`, {
  method: 'POST', body: JSON.stringify(request),
})

export const resolveSecretCase = (caseId: number, expectedVersion: number) =>
  apiRequest<SecretCaseDetail>(`/api/v1/secrets/cases/${caseId}/resolve`, {
    method: 'POST', body: JSON.stringify({ expectedVersion, reasonCode: 'POST_ACTION_REVALIDATION' }),
  })

export const resumeSecretCase = (caseId: number, occurrenceId: number, expectedVersion: number) =>
  apiRequest<SecretCaseDetail>(`/api/v1/secrets/cases/${caseId}/revalidation-resume`, {
    method: 'POST', body: JSON.stringify({ occurrenceId, expectedVersion, reasonCode: 'REVALIDATION_PRESENT' }),
  })
