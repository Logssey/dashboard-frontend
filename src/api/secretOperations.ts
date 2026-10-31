import { apiRequest } from './client'
export interface SecretOperationComponent { component: string; enabled: boolean | null; status: string; liveInstances: number | null; expectedInstances: number | null; lastHeartbeatAt: string | null; lastSuccessAt: string | null; activeJobs: number | null }
export interface SecretOperationsHealth {
  status: 'AVAILABLE' | 'UNAVAILABLE'; asOf: string; components: SecretOperationComponent[]
  queue: { status: string; ready: number | null; delayed: number | null; leased: number | null; expiredLeases: number | null; oldestReadySeconds: number | null; failed24h: number | null; partial24h: number | null }
  alerts: { open: number | null; total: number | null; recovered: number | null }
  maintenance: { ledgerPurgeEnabled: boolean; snapshotCleanupEnabled: boolean | null; lastSnapshotCleanupAt: string | null }
  reasonCode: string | null
}
export interface SecretOperationAlert { id: number; kind: string; status: string; subjectType: 'COMPONENT' | 'CONNECTION' | 'GLOBAL'; subjectId: string; openedAt: string; lastSeenAt: string; recoveredAt: string | null; occurrences: number; reasonCode: string | null }
export interface SecretOperationAlerts { items: SecretOperationAlert[]; total: number; page: number; size: number }
export const fetchSecretOperationsHealth = () => apiRequest<SecretOperationsHealth>('/api/v1/secrets/operations/health')
export const fetchSecretOperationAlerts = (page: number, state = 'OPEN') => apiRequest<SecretOperationAlerts>(`/api/v1/secrets/operations/alerts?page=${page}&size=20&state=${state}`)
