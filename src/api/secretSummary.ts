import { apiRequest } from './client'
import type { WorkbenchQueueItem } from './secretWorkbenchQueue'
import type { ScanAttempt } from './secretConnections'
import type { SecretReadOrigin } from '@/lib/secretReadSelection'
export interface WorkPreview { status: string; items: WorkbenchQueueItem[]; total: number | null; unit: string; snapshotId: string }
export interface OverviewScope extends WorkbenchQueueItem { origin?: string; connectionStatus?: string; setupState?: string; enabled?: boolean; blockedReasonCode?: string; capabilities?: { canClassifySource?: boolean; canConfigureStoragePolicy?: boolean } }
export interface CollectionCounts {
  success: number; partial: number; failed: number; notRun: number
  paused: number; running: number; incomplete: number
}
export interface CollectionProviderHealth {
  source: string
  configuredConnectionCount?: number | null
  approvedScopeCount: number | null
  gapScopeCount?: number | null
  counts: CollectionCounts | null
  lastAttempt: ScanAttempt | null
  lastScopeSuccess: ScanAttempt | null
  lastCompleteSuccess?: ScanAttempt | null
  items: OverviewScope[]
}
export interface CollectionHealth {
  status: string; origin: string; approvedScopeCount: number | null
  configuredConnectionCount?: number | null; gapScopeCount?: number | null
  lastAttempt: ScanAttempt | null; lastScopeSuccess: ScanAttempt | null
  lastCompleteSuccess: ScanAttempt | null; counts: CollectionCounts | null
  providers?: CollectionProviderHealth[]
  items: OverviewScope[]; notApplicableFilters?: string[]
}
export interface SetupSummary { status: string; selectedOrigin: string; selectedOriginScopeCount: number | null; unclassifiedScopeCount: number | null; pausedScopeCount: number | null; reasonCounts: Record<string, number>; selectedReasonCounts?: Record<string, number>; unclassifiedReasonCounts?: Record<string, number>; pausedReasonCounts?: Record<string, number>; items: OverviewScope[]; unclassifiedItems: OverviewScope[]; pausedItems: OverviewScope[]; notApplicableFilters: string[]; globalGroupsIgnoreOrigin: boolean }
export interface WorkbenchFilters {
  origin: SecretReadOrigin
  q?: string
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
export type CaseRiskSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNASSESSED' | 'NOT_APPLICABLE'
export type CaseRiskValidity = 'VALID' | 'INVALID' | 'UNKNOWN' | 'UNCHECKED'
export interface SeverityValidityMatrix {
  status: string; reasonCode: string | null; scope: 'currentCases'; unit: 'ResponseCase'; total: number | null
  rows: CaseRiskSeverity[]; columns: CaseRiskValidity[]
  cells: { severity: CaseRiskSeverity; validity: CaseRiskValidity; value: number; queueFilter: Record<string, string | number | boolean> }[]
  staleValidationCaseCount: number | null
}
export interface WorkbenchSummary {
  commonCauseGroups?: {
    code: string
    connectionId: number
    connectionLabel?: string
    count: number
    unit: string
    nextAction: string
    canExecute: boolean
    target: { type: string; id: number; connectionId?: number }
  }[]
  scope: 'workbench'; unit: 'Mixed'; total: null
  origin: SecretReadOrigin
  filters: Record<string, string>
  snapshotId: string; asOf: string; expiresAt: string
  restrictedCoverage: boolean
  accessScope: string
  metrics: WorkbenchMetric[]
  workPreviews?: { response: WorkPreview; revalidation: WorkPreview; decision: WorkPreview; review?: WorkPreview }
  collectionHealth?: CollectionHealth
  setupSummary?: SetupSummary
  caseSummary: { scope: string; unit: 'ResponseCase'; total: number | null; status: string; actionCounts: Record<string, number> | null; severityCounts: Record<string, number> | null; notApplicableCaseCount: number | null; severityStatus: string; severityReasonCode: string | null; severityValidityMatrix?: SeverityValidityMatrix }
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
