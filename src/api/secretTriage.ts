import { apiRequest } from './client'
import type { SecretCaseDetail, SecretCaseOrigin } from './secretCases'
import type { SecretComponentState, SecretIssuer } from './secrets'

export type SecretResponseOrigin = SecretCaseOrigin | 'UNCLASSIFIED'
export type SecretExposureDecision = 'ABNORMAL' | 'NORMAL'
export type SecretAssessmentReason = 'UNAPPROVED_SOURCE_LOCATION' | 'SIMULATED_EXPOSURE' | 'AUTHORIZED_LOCATION'
export type SecretScopeReason = 'APPROVED_TEST_FIXTURE' | 'APPROVED_PRODUCTION_SOURCE'

export interface SecretTriageCandidate {
  secretId: number
  maskedLabel: string
  issuer: SecretIssuer
  credentialType: string
  componentState: SecretComponentState
  occurrenceCount: number
}

export interface SecretTriageCandidateDetail extends Omit<SecretTriageCandidate, 'occurrenceCount'> {
  occurrences: Array<{
    id: number
    connectionId: number
    scopeId: number
    sourceObjectRef: string
    locationKey: string
    environment: 'PROD' | 'DEV' | 'UNKNOWN'
    exposureStatus: 'UNKNOWN' | 'ABNORMAL' | 'NORMAL'
    presenceStatus: string
    assessmentVersion: number
    scopeOrigin: SecretResponseOrigin
    scopeOriginVersion: number
  }>
}

export interface SecretTriageCandidatePage {
  items: SecretTriageCandidate[]
  total: number
  page: number
  size: number
}

export const fetchSecretTriageCandidates = (page: number, size: number) =>
  apiRequest<SecretTriageCandidatePage>(`/api/v1/secrets/triage-candidates?page=${page}&size=${size}`)

export const fetchSecretTriageCandidateDetail = (secretId: number) =>
  apiRequest<SecretTriageCandidateDetail>(`/api/v1/secrets/triage-candidates/${secretId}`)

export interface SecretScopeOrigin {
  scopeId: number
  connectionId: number
  scopeKey: string
  responseOrigin: SecretResponseOrigin
  responseOriginVersion: number
  classifiedByUserId: number | null
  classifiedAt: string | null
  allowedOrigins: SecretCaseOrigin[]
  history: Array<{
    fromOrigin: SecretResponseOrigin
    toOrigin: SecretCaseOrigin
    reasonCode: SecretScopeReason
    actorUserId: number
    decidedAt: string
    version: number
  }>
}

export interface SecretOccurrenceTriage {
  occurrenceId: number
  secretId: number
  connectionId: number
  scopeId: number
  componentState: SecretComponentState
  exposureStatus: 'UNKNOWN' | 'ABNORMAL' | 'NORMAL'
  presenceStatus: string
  assessmentVersion: number
  scopeOrigin: SecretResponseOrigin
  scopeOriginVersion: number
  openCaseId: number | null
  findings: Array<{
    findingId: number
    ruleId: string
    detectedAt: string
  }>
  history: Array<{
    assessmentId: number
    fromStatus: string
    decision: SecretExposureDecision
    reasonCode: SecretAssessmentReason
    findingId: number
    findingRuleId: string
    actorUserId: number
    assessedAt: string
    version: number
  }>
}

export interface AssessSecretOccurrenceRequest {
  decision: SecretExposureDecision
  reasonCode: SecretAssessmentReason
  findingId: number
  expectedVersion: number
}

export const fetchSecretOccurrenceTriage = (occurrenceId: number) =>
  apiRequest<SecretOccurrenceTriage>(`/api/v1/secrets/occurrences/${occurrenceId}/triage`)

export const assessSecretOccurrence = (occurrenceId: number, request: AssessSecretOccurrenceRequest) =>
  apiRequest<SecretOccurrenceTriage>(`/api/v1/secrets/occurrences/${occurrenceId}/assessments`, {
    method: 'POST', body: JSON.stringify(request),
  })

export const fetchSecretScopeOrigin = (scopeId: number) =>
  apiRequest<SecretScopeOrigin>(`/api/v1/secrets/scopes/${scopeId}/response-origin`)

export const classifySecretScope = (scopeId: number, origin: SecretCaseOrigin, expectedVersion: number) =>
  apiRequest<SecretScopeOrigin>(`/api/v1/secrets/scopes/${scopeId}/response-origin`, {
    method: 'PATCH',
    body: JSON.stringify({
      origin,
      reasonCode: origin === 'TEST' ? 'APPROVED_TEST_FIXTURE' : 'APPROVED_PRODUCTION_SOURCE',
      expectedVersion,
    }),
  })

export const openSecretResponseCase = (
  secretId: number,
  occurrenceId: number,
  expectedAssessmentVersion: number,
  expectedScopeOriginVersion: number,
) => apiRequest<SecretCaseDetail>(`/api/v1/secrets/${secretId}/cases`, {
  method: 'POST',
  body: JSON.stringify({ occurrenceId, reason: 'ASSESSED_EXPOSURE', expectedAssessmentVersion, expectedScopeOriginVersion }),
})
