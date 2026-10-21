import { apiRequest } from '@/api/client'
import type { IacPathDetail, IacPathList, IacSummary } from './types'

const base = '/api/v1/iac'

export const fetchIacSummary = () => apiRequest<IacSummary>(`${base}/summary`)

export const fetchIacPaths = (params: { status?: 'OPEN' | 'CLOSED'; tier?: number; cursor?: number | null; limit?: number }) => {
  const query = new URLSearchParams({ status: params.status ?? 'OPEN', limit: String(params.limit ?? 20) })
  if (params.tier) query.set('tier', String(params.tier))
  if (params.cursor) query.set('cursor', String(params.cursor))
  return apiRequest<IacPathList>(`${base}/paths?${query}`)
}

export const fetchIacPath = (pathId: number) => apiRequest<IacPathDetail>(`${base}/paths/${pathId}`)
