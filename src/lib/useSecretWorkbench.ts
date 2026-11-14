import { useQuery } from '@tanstack/react-query'
import { fetchSecretSummary, type WorkbenchFilters } from '@/api/secretSummary'
import { isSecretSnapshotInvalidated } from './secretSnapshotState'

export const secretSummaryKey = (filters: WorkbenchFilters) => ['secret-summary', filters] as const
export function useSecretWorkbench(filters: WorkbenchFilters, enabled: boolean) {
  return useQuery({ queryKey: secretSummaryKey(filters), queryFn: () => fetchSecretSummary(filters), enabled: enabled && !isSecretSnapshotInvalidated(filters.snapshotId), retry: false, staleTime: 5 * 60_000, refetchOnWindowFocus: false, refetchOnReconnect: false })
}
