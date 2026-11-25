import { apiRequest } from './client'
import type { SecretCaseGuide } from './secretCaseGuide'

export type SecretExplanationTopic = 'SCAN' | 'CASE'
export interface SecretExplanationResponse {
  version: string
  topic: SecretExplanationTopic
  source: 'DEFAULT' | 'CLAUDE'
  summary: string
  facts: { code: string; label: string }[]
  actions: { code: string; label: string; href: string }[]
  documents: { id: string; title: string; url: string; reviewedAt: string }[]
  readiness: NonNullable<SecretCaseGuide['readiness']>
}

function explanationPath(topic: SecretExplanationTopic, id: number) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('INVALID_EXPLANATION_TARGET')
  return `/api/v1/secrets/${topic === 'SCAN' ? 'runs' : 'cases'}/${id}/explanation`
}

export const fetchSecretExplanation = (topic: SecretExplanationTopic, id: number) =>
  apiRequest<SecretExplanationResponse>(explanationPath(topic, id))

export const requestSecretExplanation = (topic: SecretExplanationTopic, id: number) =>
  apiRequest<SecretExplanationResponse>(explanationPath(topic, id), { method: 'POST' })
