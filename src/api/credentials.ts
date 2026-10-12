import { apiRequest } from './client'
import type { CredentialIssuer, CredentialListResponse, CredentialStatus } from './types'

export interface CredentialFilter {
  issuer: CredentialIssuer | 'ALL'
  status: CredentialStatus | 'ALL'
  riskOnly: boolean
}

export const fetchCredentials = ({ issuer, status, riskOnly }: CredentialFilter) =>
  apiRequest<CredentialListResponse>(`/api/v1/credentials?issuer=${issuer}&status=${status}&riskOnly=${riskOnly}`)
