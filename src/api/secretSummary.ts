import { apiRequest } from './client'
export interface WorkbenchFilters {
  origin: 'PRODUCTION' | 'TEST'
  source: string
  provider: string
  environment: string
  connectionId: number | null
  assignee: string
  snapshotId: string
}
export interface WorkbenchMetric {
  key: string; scope: string; unit: string; value: number | null
  status: string; reasonCode: string | null
  appliedFilters: Record<string, string>
  notApplicableFilters: string[]
  queueFilter: Record<string, string | number | boolean>
}
export interface WorkbenchSummary {
  scope: 'workbench'; unit: 'Mixed'; total: null
  origin: 'PRODUCTION' | 'TEST'
  filters: Record<string, string>
  snapshotId: string; asOf: string; expiresAt: string
  restrictedCoverage: boolean
  accessScope: string
  metrics: WorkbenchMetric[]
  caseSummary: { scope: string; unit: 'ResponseCase'; total: number | null; status: string; actionCounts: Record<string, number> | null; severityCounts: Record<string, number> | null; notApplicableCaseCount: number | null; severityStatus: string; severityReasonCode: string | null }
  normalInventory: { unit: 'CredentialSet'; value: number | null; status?: string }
  crossEnvironmentAlerts: { unit: 'CrossEnvironmentAlert'; value: number | null; status?: string; items: { alertId: number; status: string; nextActionCode: string }[] }
  partialCoverage: boolean | null
  coverageStatus: string
}
export const fetchSecretSummary = (filters: WorkbenchFilters) => {
  const params = new URLSearchParams({ origin: filters.origin, source: filters.source, provider: filters.provider, environment: filters.environment })
  if (filters.connectionId) params.set('connectionId', String(filters.connectionId))
  if (filters.assignee) params.set('assignee', filters.assignee)
  if (filters.snapshotId) params.set('snapshotId', filters.snapshotId)
  return apiRequest<WorkbenchSummary>(`/api/v1/secrets/summary?${params}`)
}
