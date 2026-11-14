import { useQueryClient } from '@tanstack/react-query'
import { invalidateSecretSnapshot } from './secretSnapshotState'

export function useSecretReadRefresh() {
  const client = useQueryClient()
  return () => {
    for (const query of client.getQueryCache().findAll()) {
      if (!['secret-inventory', 'secret-summary', 'secret-review-queue'].includes(String(query.queryKey[0]))) continue
      const data = query.state.data as { snapshotId?: string } | undefined
      invalidateSecretSnapshot(data?.snapshotId)
    }
    for (const key of ['secret-inventory', 'secret-key-locations', 'secret-detail', 'secret-review-queue', 'secret-review-context', 'secret-investigations', 'secret-investigation', 'secret-fixture-attestations', 'secret-cross-environment-alerts', 'secret-key-alert', 'secret-summary', 'secret-cases', 'secret-case', 'secret-case-activities', 'secret-case-assignees', 'secret-case-revalidations', 'secret-case-lifecycle', 'secret-case-closure', 'secret-case-exceptions', 'secret-case-transfers', 'secret-classification', 'secret-classification-queue', 'secret-policies', 'secret-connections-manage', 'secret-connection-scopes', 'secret-navigation-count']) void client.invalidateQueries({ queryKey: [key] })
  }
}
