import { apiRequest } from './client'

export type ScanProgressStageKey = 'QUEUE' | 'COLLECTION' | 'DETECTION' | 'VALIDATION' | 'RESULT'
export type ScanProgressStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'SKIPPED' | 'CANCELLED' | 'UNKNOWN'

export interface ScanProgressStage {
  key: ScanProgressStageKey
  status: ScanProgressStatus
  startedAt: string | null
  finishedAt: string | null
  reasonCode: string | null
  processedCount: number | null
  totalCount: number | null
  unit: 'SCOPE' | 'OBJECT' | 'CANDIDATE' | 'ATTEMPT' | null
}

export interface ScanProgressEvent {
  id: number
  attemptNo: number
  stage: ScanProgressStageKey
  operationCode: string
  outcome: 'STARTED' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'SKIPPED' | 'RETRY_SCHEDULED' | 'CANCELLED'
  httpStatus: number | null
  reasonCode: string | null
  processedCount: number | null
  totalCount: number | null
  durationMs: number | null
  observedAt: string
}

export interface SecretScanProgressResponse {
  runId: number
  connectionId: number
  provider: string
  status: string
  attemptNo: number
  maxAttempts: number
  requestedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  availableAt: string | null
  scopeCount: number | null
  finishedScopeCount: number | null
  collectedObjectCount: number | null
  findingCount: number | null
  capabilities?: { canViewFindings: boolean }
  capturedAt: string
  latestActivityAt: string | null
  pollAfterMs: number
  eventsStatus: 'AVAILABLE' | 'NOT_RECORDED' | 'EXPIRED'
  historyComplete: boolean
  truncated: boolean
  suppressedEventCount: number
  recordedFrom?: string | null
  expiredAt?: string | null
  stages: ScanProgressStage[]
  events: ScanProgressEvent[]
  nextAfterEventId: number
  hasMore: boolean
}

export const fetchSecretScanProgress = (runId: number, afterEventId: number, signal?: AbortSignal) =>
  apiRequest<SecretScanProgressResponse>(`/api/v1/secrets/runs/${runId}/progress?afterEventId=${afterEventId}&size=100`, { signal })
