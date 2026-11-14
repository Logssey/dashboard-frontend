import { apiRequest } from './client'

export interface SecretCaseGuide {
  version: string
  source: 'DEFAULT' | 'GROQ' | 'CLAUDE'
  title: string
  steps: Array<{ code: string; title: string; description: string }>
  notice: string
  readiness?: {
    status: 'READY' | 'UNAVAILABLE' | 'GENERATED' | 'FALLBACK'
    reasonCode: string
    aiAvailable: boolean
    aiRequested: boolean
    providerCalled: boolean
    cached: boolean
    provider?: 'CLAUDE' | 'GROQ'
    model?: string | null
    generatedAt?: string | null
  }
}

export const fetchSecretCaseGuide = (caseId: number) =>
  apiRequest<SecretCaseGuide>(`/api/v1/secrets/cases/${caseId}/guide`)

export const requestSecretCaseGuide = (caseId: number) =>
  apiRequest<SecretCaseGuide>(`/api/v1/secrets/cases/${caseId}/guide`, { method: 'POST' })
