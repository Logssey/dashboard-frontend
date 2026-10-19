import { apiRequest } from './client'

export interface SecretCaseGuide {
  version: string
  source: 'DEFAULT' | 'GROQ'
  title: string
  steps: Array<{ code: string; title: string; description: string }>
  notice: string
}

export const requestSecretCaseGuide = (caseId: number) =>
  apiRequest<SecretCaseGuide>(`/api/v1/secrets/cases/${caseId}/guide`, { method: 'POST' })
