import { apiRequest } from '@/api/client'
import type { IacDrift, IacFindingUpdate, IacGates, IacJobStatus, IacPathDetail, IacPathList, IacPullRequest, IacPullRequestSummary, IacRemediation, IacStateSummary, IacSummary } from './types'

const base = '/api/v1/iac'

export const fetchIacSummary = () => apiRequest<IacSummary>(`${base}/summary`)

export const fetchIacPaths = (params: { status?: 'OPEN' | 'CLOSED'; tier?: number; cursor?: number | null; limit?: number }) => {
  const query = new URLSearchParams({ status: params.status ?? 'OPEN', limit: String(params.limit ?? 20) })
  if (params.tier) query.set('tier', String(params.tier))
  if (params.cursor) query.set('cursor', String(params.cursor))
  return apiRequest<IacPathList>(`${base}/paths?${query}`)
}

export const fetchIacPath = (pathId: number) => apiRequest<IacPathDetail>(`${base}/paths/${pathId}`)

export const fetchIacPullRequests = () => apiRequest<IacPullRequestSummary[]>(`${base}/prs`)

export const fetchIacPullRequest = (number: number) => apiRequest<IacPullRequest>(`${base}/prs/${number}`)

export const fetchIacGates = () => apiRequest<IacGates>(`${base}/gates`)

export const fetchIacStateSummary = () => apiRequest<IacStateSummary>(`${base}/state/summary`)

export const fetchIacDrifts = () => apiRequest<IacDrift[]>(`${base}/drifts?status=OPEN`)

export const updateIacFinding = (findingId: number, body: IacFindingUpdate) =>
  apiRequest<{ findingId: number; status: string; assigneeUserId: number | null; version: number }>(
    `${base}/findings/${findingId}`, { method: 'PATCH', body: JSON.stringify(body) })

export const fetchIacRemediations = () => apiRequest<IacRemediation[]>(`${base}/remediations/suggested`)

export const fetchIacJobs = () => apiRequest<IacJobStatus[]>(`${base}/jobs`)

/** 같은 작업이 이미 기다리고 있으면 그 작업을 돌려준다 (백엔드에서 중복 등록 안 함) */
export const triggerIacJob = (job: 'enrich-graph' | 'check-state') =>
  apiRequest<{ jobId: number; kind: string }>(`${base}/jobs/${job}/trigger`, { method: 'POST' })
