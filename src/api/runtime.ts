import { apiRequest } from './client'
import type {
  RuntimeFinding,
  RuntimeFindingListResponse,
  RuntimeFindingUpdate,
  RuntimeOverviewResponse,
  RuntimeSensorListResponse,
} from './types'

export interface RuntimeFindingFilter {
  clusterId: string
  namespace: string
  reviewStatus: 'ALL' | 'UNREVIEWED' | 'REVIEWED'
  ruleKey: string
}

export const fetchRuntimeOverview = (clusterId: string) =>
  apiRequest<RuntimeOverviewResponse>(`/api/v1/runtime/overview?clusterId=${encodeURIComponent(clusterId)}`)

export const fetchRuntimeFindings = (filter: RuntimeFindingFilter) => {
  const params = new URLSearchParams({ ...filter, limit: '100' })
  return apiRequest<RuntimeFindingListResponse>(`/api/v1/runtime/findings?${params}`)
}

export const fetchRuntimeFinding = (findingId: number) =>
  apiRequest<RuntimeFinding>(`/api/v1/runtime/findings/${findingId}`)

export const updateRuntimeFinding = (findingId: number, update: RuntimeFindingUpdate) =>
  apiRequest<RuntimeFinding>(`/api/v1/runtime/findings/${findingId}`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  })

export const fetchRuntimeSensors = (clusterId: string) =>
  apiRequest<RuntimeSensorListResponse>(`/api/v1/runtime/sensors?clusterId=${encodeURIComponent(clusterId)}`)
