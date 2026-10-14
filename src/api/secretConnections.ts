import { apiRequest } from './client'

export interface SecretConnectionTestResult {
  connectionId: number
  provider: 'GITHUB' | 'AWS'
  status: 'CONNECTED' | 'FAILED' | 'UNAVAILABLE'
  reasonCode: string | null
  checkedAt: string
}

/** 인증·접근 가능 여부만 확인한다. 검사 작업은 등록하지 않는다. */
export const testSecretConnection = (connectionId: number) =>
  apiRequest<SecretConnectionTestResult>(`/api/v1/secrets/connections/${connectionId}/test`, {
    method: 'POST',
  })
