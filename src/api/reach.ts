import { ApiError, apiRequest } from './client'
import { sampleReachFinding, sampleReachFindings, sampleReachSummary } from './reachSample'

// 취약점 관리(Reach) API. 이름과 값은 Reach API 명세서 3·4절 그대로 쓴다 (/api/v1/reach)

export type ReachStatus = 'REACHABLE' | 'UNREACHABLE' | 'UNKNOWN' | 'NOT_ANALYZED'
export type ReachMethod = 'CALLGRAPH' | 'RULE' | 'MANUAL'
export type ReachReviewState = 'UNREVIEWED' | 'PROVISIONAL' | 'CONFIRMED'
export type ReachDeployment = 'RUNNING' | 'NOT_RUNNING' | 'UNKNOWN'
export type ReachSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'
/** ANALYSIS_TIMEOUT은 PRD·DB에는 있고 API 명세 3-11에는 아직 없다. 와도 깨지지 않게 받는다 */
export type ReachNotAnalyzedReason =
  | 'NO_VULN_FUNCTION_DATA'
  | 'OS_PACKAGE'
  | 'UNANALYZED_COPY'
  | 'UNSUPPORTED_ECOSYSTEM'
  | 'ANALYSIS_TIMEOUT'
export type ReachResetReason = 'VERDICT_CHANGED' | 'EVIDENCE_CHANGED'

export interface ReachProposal {
  status: Exclude<ReachStatus, 'NOT_ANALYZED'>
  summary: string
  reference?: string
}

/** API-04 목록 항목 (Finding 요약 모양) */
export interface ReachFindingListItem {
  id: number
  scanId: number
  targetId: number
  component: { purl: string; name: string; version: string }
  vulnerability: { id: string; severity: ReachSeverity; fixedVersions: string[] }
  deployment: ReachDeployment
  verdict: { status: ReachStatus; method?: ReachMethod; summary: string; notAnalyzedReason?: ReachNotAnalyzedReason }
  review: { reviewState: ReachReviewState; disagreesWithTool: boolean; proposal?: ReachProposal; resetReason?: ReachResetReason }
  firstSeenAt: string
}

export interface ReachFindingPage {
  items: ReachFindingListItem[]
  nextCursor: string | null
  hasNext: boolean
  totalCount?: number
}

/** API-05 근거 (3-5). 사실(FACT)이 경로(PATH)보다 앞선다 */
export interface ReachEvidence {
  order: number
  kind: 'FACT' | 'PATH' | 'RULE' | 'NOTE' | 'RUNTIME'
  summary: string
  factId?: string
  value?: unknown
  informational?: boolean
  locations?: Array<{ file?: string; line?: number; symbol?: string }>
  ruleId?: string
  matchedCondition?: 'REACHABLE' | 'UNREACHABLE' | 'UNKNOWN' | 'DEFAULT'
  checkedAbsent?: string[]
  checkedCount?: number
  path?: string[]
  pathTarget?: 'VULN_FUNCTION' | 'PACKAGE'
  candidate?: boolean
  entryStage?: 1 | 2
  weak?: boolean
}

/** API-05 Finding 상세 */
export interface ReachFindingDetail {
  id: number
  scanId: number
  targetId: number
  component: { purl: string; name: string; version: string; ecosystem?: string }
  vulnerability: {
    id: string
    severity: ReachSeverity
    severityNote?: string
    title?: string
    affectedFeature?: string
    fixedVersions: string[]
  }
  deployment: ReachDeployment
  sources?: Array<'TRIVY' | 'GRYPE'>
  verdict: {
    status: ReachStatus
    method?: ReachMethod
    summary: string
    notAnalyzedReason?: ReachNotAnalyzedReason
    ruleId?: string
    callgraph?: {
      packageReached?: boolean
      vulnFunctionPresent?: boolean
      vulnFunctionReached?: boolean
      entryStage?: 1 | 2
      weakOnly?: boolean
    }
    evidence: ReachEvidence[]
    analyzedAt: string
    engine?: { reach?: string; rulesVersion?: string; vulnFunctionsVersion?: string }
  }
  review: {
    reviewState: ReachReviewState
    status?: Exclude<ReachStatus, 'NOT_ANALYZED'>
    note?: string
    reviewer?: { id: number; name: string }
    reviewedAt?: string
    version: number
    disagreesWithTool: boolean
    proposal?: ReachProposal
    carriedFrom?: { findingId: number; scanId: number; reviewedAt: string }
    resetReason?: ReachResetReason
  }
  upgrade?: { suggestedVersion?: string; change?: string; note?: string }
  sameCveFindings?: number[]
  firstSeenAt: string
  lastSeenAt: string
}

/** API-08 요약 (3-9) */
export interface ReachSummary {
  scope: { targetId: number | null; scanId: number | null }
  totals: { findings: number }
  byStatus: Record<ReachStatus, number>
  /** API 명세는 네 사유를 0까지 준다. ANALYSIS_TIMEOUT은 없을 수 있다 */
  byNotAnalyzedReason: Partial<Record<ReachNotAnalyzedReason, number>>
  bySeverity: Record<ReachSeverity, number>
  byMethod: Record<ReachMethod, number>
  byReviewState: Record<ReachReviewState, number>
  byDeployment: Record<ReachDeployment, number>
  /** include=matrix일 때. 심각도 × 상태이고 0인 칸은 빠진다 */
  severityByStatus?: Partial<Record<ReachSeverity, Partial<Record<ReachStatus, number>>>>
  noiseReduction: { unreachable: number; judged: number; ratio?: number }
  coverage: { judged: number; total: number; ratio?: number }
  generatedAt: string
}

export interface ReachFindingFilter {
  status: ReachStatus[]
  severity: ReachSeverity[]
  reviewState: ReachReviewState[]
  deployment: ReachDeployment[]
  cveContains: string
}

/** sample이 true면 백엔드 대신 Reach API 명세서의 예시 값이다 */
export interface Sampled<T> {
  data: T
  sample: boolean
}

/** 목록은 한 번에 50건을 받는다 (SCR-02-10) */
export const REACH_PAGE_SIZE = 50

/**
 * 주소 자체가 없는 404인지. 백엔드에 아직 없는 API는 본문 없는 404가 오고,
 * 만든 API가 대상을 못 찾으면 { code: "NOT_FOUND" } 본문이 온다 (API 명세 0.4)
 */
export function isMissingEndpoint(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404 && error.code === null
}

/**
 * Reach 백엔드는 API를 하나씩 붙여 가는 중이다. 개발 서버에서 아직 없는 API만 명세 예시 값으로 대신 그리고 화면에 알린다.
 * 배포 빌드에서는 예시 값을 쓰지 않고 오류를 그대로 보인다
 */
async function orSample<T>(request: () => Promise<T>, sample: () => T): Promise<Sampled<T>> {
  try {
    return { data: await request(), sample: false }
  } catch (error) {
    if (isMissingEndpoint(error) && import.meta.env?.DEV) {
      return { data: sample(), sample: true }
    }
    throw error
  }
}

export function reachFindingQuery(filter: ReachFindingFilter, cursor: string | null): string {
  const params = new URLSearchParams()
  if (filter.status.length) params.set('status', filter.status.join(','))
  if (filter.severity.length) params.set('severity', filter.severity.join(','))
  if (filter.reviewState.length) params.set('reviewState', filter.reviewState.join(','))
  if (filter.deployment.length) params.set('deployment', filter.deployment.join(','))
  if (filter.cveContains.trim()) params.set('cveContains', filter.cveContains.trim())
  params.set('size', String(REACH_PAGE_SIZE))
  params.set('include', 'total')
  if (cursor) params.set('cursor', cursor)
  return params.toString()
}

/** API-08 */
export const fetchReachSummary = () =>
  orSample(() => apiRequest<ReachSummary>('/api/v1/reach/summary?include=matrix'), sampleReachSummary)

/** API-04 */
export const fetchReachFindings = (filter: ReachFindingFilter, cursor: string | null) =>
  orSample(
    () => apiRequest<ReachFindingPage>(`/api/v1/reach/findings?${reachFindingQuery(filter, cursor)}`),
    () => sampleReachFindings(filter, cursor, REACH_PAGE_SIZE),
  )

/** API-06 본문. 검토자와 시각은 서버가 채운다 */
export interface ReachReviewInput {
  reviewState: ReachReviewState
  status?: Exclude<ReachStatus, 'NOT_ANALYZED'>
  note?: string
  version: number
}

/** API-06. 응답은 바뀐 Review(상세의 review와 같은 모양). 예시 데이터로 대신하지 않는다 */
export const saveReachReview = (findingId: number, input: ReachReviewInput) =>
  apiRequest<ReachFindingDetail['review']>(`/api/v1/reach/findings/${findingId}/review`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })

/** API-05 */
export const fetchReachFinding = (findingId: number) =>
  orSample(() => apiRequest<ReachFindingDetail>(`/api/v1/reach/findings/${findingId}`), () => sampleReachFinding(findingId))
