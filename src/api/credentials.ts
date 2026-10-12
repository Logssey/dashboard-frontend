import { apiRequest } from './client'
import type { CredentialIssuer, CredentialListResponse, CredentialStatus, ScanResult } from './types'

export interface CredentialFilter {
  issuer: CredentialIssuer | 'ALL'
  status: CredentialStatus | 'ALL'
  riskOnly: boolean
}

export const fetchCredentials = ({ issuer, status, riskOnly }: CredentialFilter) =>
  apiRequest<CredentialListResponse>(`/api/v1/credentials?issuer=${issuer}&status=${status}&riskOnly=${riskOnly}`)

/** Notion 페이지 유출 탐지를 지금 실행한다 (POST라 CSRF 헤더가 자동으로 붙는다) */
export const scanCredentials = () => apiRequest<ScanResult>('/api/v1/credentials/scan', { method: 'POST' })
