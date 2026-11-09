import { ApiError, apiRequest } from './client'
import {
  sampleReachFinding,
  sampleReachFindings,
  sampleReachScan,
  sampleReachScans,
  sampleReachSummary,
  sampleReachWorkloads,
} from './reachSample'

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
    /** include=reviewHistory일 때. 오래된 것부터 */
    history?: ReachReviewHistoryEntry[]
  }
  upgrade?: { suggestedVersion?: string; change?: string; note?: string }
  sameCveFindings?: number[]
  firstSeenAt: string
  lastSeenAt: string
}

/**
 * 검토 이력 한 줄 (SCR-03-14). changeKind는 백엔드가 더한 값이다:
 * HUMAN(사람이 남김) / CARRIED(이전 스캔에서 이어받음) / RESET(판정·근거가 바뀌어 서버가 되돌림)
 */
export interface ReachReviewHistoryEntry {
  reviewState: ReachReviewState
  status?: Exclude<ReachStatus, 'NOT_ANALYZED'> | null
  note?: string | null
  proposal?: ReachProposal | null
  reviewer?: { id: number; name: string } | null
  reviewedAt: string
  version: number
  changeKind?: 'HUMAN' | 'CARRIED' | 'RESET' | string
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
  /** 특정 스캔의 결과만 볼 때 (SCR-05 [결과 보기]). 없으면 기본 범위 */
  scanId?: number | null
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
  if (filter.scanId) params.set('scanId', String(filter.scanId))
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
  orSample(
    () => apiRequest<ReachFindingDetail>(`/api/v1/reach/findings/${findingId}?include=reviewHistory`),
    () => sampleReachFinding(findingId),
  )

// ---- 워크로드 (API-07, SCR-04) ----

export type ReachScanMatchStatus = 'MATCH' | 'MISMATCH' | 'NO_SCAN'
export type ReachApp = 'API' | 'WEB' | 'CHAT'

/** API-07 한 항목. 워크로드 안의 (컨테이너, digest) 하나다. id는 업로드마다 바뀐다 */
export interface ReachWorkload {
  id: number
  cluster: string
  namespace: string
  kind: string
  name: string
  container: string
  app: ReachApp | null
  image: { repository: string; digest: string; revision?: string }
  replicas: { ready: number }
  deployment: ReachDeployment
  scanMatch: { status: ReachScanMatchStatus; scanId?: number; matchedBy?: 'DIGEST' | 'SOURCE_TREE' }
  observedAt: string
  source: 'MANUAL' | 'CLUSTER_READER'
}

/** 네임스페이스별 마지막 조회. fresh는 48시간 안 */
export interface ReachObservation {
  cluster: string
  namespace: string
  observedAt: string
  source: 'MANUAL' | 'CLUSTER_READER'
  fresh: boolean
}

export interface ReachWorkloadPage {
  observations: ReachObservation[]
  items: ReachWorkload[]
  nextCursor: string | null
  hasNext: boolean
  totalCount?: number | null
}

/** 워크로드는 많지 않아(네임스페이스마다 컨테이너 1,000개까지) 화면이 전부 받아 묶고 정렬한다 */
export interface ReachWorkloadList {
  observations: ReachObservation[]
  items: ReachWorkload[]
}

const WORKLOAD_PAGE_SIZE = 100
const WORKLOAD_MAX_PAGES = 20

/** API-07. 다음 페이지가 있으면 이어서 받는다 */
export const fetchReachWorkloads = () =>
  orSample(async (): Promise<ReachWorkloadList> => {
    const items: ReachWorkload[] = []
    let observations: ReachObservation[] = []
    let cursor: string | null = null
    for (let page = 0; page < WORKLOAD_MAX_PAGES; page += 1) {
      const params = new URLSearchParams({ size: String(WORKLOAD_PAGE_SIZE) })
      if (cursor) params.set('cursor', cursor)
      const result: ReachWorkloadPage = await apiRequest<ReachWorkloadPage>(`/api/v1/reach/workloads?${params}`)
      observations = result.observations
      items.push(...result.items)
      if (!result.hasNext || !result.nextCursor) break
      cursor = result.nextCursor
    }
    return { observations, items }
  }, sampleReachWorkloads)

// ---- 스캔 (API-01·02·03, SCR-05) ----

export type ReachScanStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
export type ReachTrigger = 'MANUAL' | 'PR' | 'IMAGE_BUILD' | 'SCHEDULE'
export type ReachStageName = 'SBOM' | 'MATCH' | 'L1' | 'L2' | 'REPORT'

export interface ReachScanStage {
  name: ReachStageName | string
  status: ReachScanStatus | 'SKIPPED' | string
  message?: string
  durationSeconds?: number
}

/** API-03 스캔 (3-1, 3-2). counts는 SUCCEEDED, failure는 FAILED일 때만 */
export interface ReachScan {
  id: number
  scanStatus: ReachScanStatus
  trigger: ReachTrigger
  rescanOf?: number | null
  target: {
    id: number
    type: 'REPO' | 'IMAGE'
    app: ReachApp
    repo?: { name: string; path?: string | null; commit: string } | null
    image?: { repository: string; digest: string; revision?: string | null; createdAt?: string | null } | null
    sourceTree?: string | null
    displayName: string
  }
  stages?: ReachScanStage[] | null
  tools?: Record<string, string | null> | null
  counts?: {
    total: number
    bySeverity: Record<ReachSeverity, number>
    byStatus: Record<ReachStatus, number>
    byReviewState?: Record<ReachReviewState, number>
  } | null
  failure?: { code: string; stage?: string | null; message?: string | null } | null
  createdAt: string
  startedAt?: string | null
  finishedAt?: string | null
}

export interface ReachScanPage {
  items: ReachScan[]
  nextCursor: string | null
  hasNext: boolean
  totalCount?: number | null
}

export interface ReachScanFilter {
  scanStatus: ReachScanStatus[]
  trigger: ReachTrigger[]
}

export const REACH_SCAN_PAGE_SIZE = 20

export function reachScanQuery(filter: ReachScanFilter, cursor: string | null): string {
  const params = new URLSearchParams()
  if (filter.scanStatus.length) params.set('scanStatus', filter.scanStatus.join(','))
  if (filter.trigger.length) params.set('trigger', filter.trigger.join(','))
  params.set('size', String(REACH_SCAN_PAGE_SIZE))
  params.set('include', 'total')
  if (cursor) params.set('cursor', cursor)
  return params.toString()
}

/** API-02 */
export const fetchReachScans = (filter: ReachScanFilter, cursor: string | null) =>
  orSample(
    () => apiRequest<ReachScanPage>(`/api/v1/reach/scans?${reachScanQuery(filter, cursor)}`),
    () => sampleReachScans(filter),
  )

/** API-03 */
export const fetchReachScan = (scanId: number) =>
  orSample(() => apiRequest<ReachScan>(`/api/v1/reach/scans/${scanId}`), () => sampleReachScan(scanId))

/** API-01 본문. app을 안 주면 서버가 저장소 이름으로 정한다(모르면 422) */
export interface ReachScanInput {
  target:
    | { type: 'IMAGE'; app?: ReachApp; image: { repository: string; digest: string } }
    | { type: 'REPO'; app?: ReachApp; repo: { name: string; commit: string; path?: string } }
  options: { l1: boolean; l2: boolean }
}

/** API-01. 응답은 API-03과 같은 스캔(202). 같은 멱등 키로 다시 보내면 처음 응답을 다시 준다. 예시 데이터로 대신하지 않는다 */
export const createReachScan = (input: ReachScanInput, idempotencyKey: string) =>
  apiRequest<ReachScan>('/api/v1/reach/scans', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  })

// ---- 규칙·취약 함수 (API-09·10, SCR-06) ----

/** 규칙 조건의 한 칸. 바깥 배열은 "또는", 안쪽 배열은 "그리고"다. "!이름"은 그 사실이 없다는 뜻 */
export type ReachRuleCondition = string[][]

/** include=definition일 때 받는 조건식 원문. 이름은 rules.json 그대로(F- 없음)다 */
export interface ReachRuleDefinition {
  verdict: {
    method?: string
    reachable_if?: ReachRuleCondition
    unreachable_if?: ReachRuleCondition
    unknown_if?: ReachRuleCondition
    otherwise?: string
    why_ko?: Record<string, string>
  } & Record<string, unknown>
  facts?: Array<{ id: string; type?: string } & Record<string, unknown>>
}

/** API-09 규칙 (명세 3-7) */
export interface ReachRule {
  id: string
  cve: string
  method: 'RULE' | 'CALLGRAPH'
  packages: string[]
  facts: string[]
  infoFacts?: string[]
  evaluationOrder: Array<'REACHABLE' | 'UNREACHABLE' | 'UNKNOWN' | 'DEFAULT'>
  defaultStatus: Exclude<ReachStatus, 'NOT_ANALYZED'>
  reasons?: Partial<Record<'REACHABLE' | 'UNREACHABLE' | 'UNKNOWN', string>>
  vulnFunctionIds?: number[]
  definition?: ReachRuleDefinition
  version?: string
}

export interface ReachRulePage {
  items: ReachRule[]
  nextCursor: string | null
  hasNext: boolean
  totalCount?: number | null
  version?: string
}

/** API-10 취약 함수 한 줄 (명세 3-8). class는 패키지까지 쓴 이름이다 */
export interface ReachVulnFunction {
  id: number
  cve: string
  package: string
  class: string
  method: string
  descriptor?: string
  fixedVersions?: string[]
  fixCommits?: string[]
  confidence?: string
  note?: string
}

export interface ReachVulnFunctionPage {
  items: ReachVulnFunction[]
  nextCursor: string | null
  hasNext: boolean
  totalCount?: number | null
  version?: string
  generated?: string
}

/** 규칙·취약 함수 데이터는 작아서(규칙 14개, 함수 46개) 전부 받아 화면이 찾고 묶는다 (SCR-06-01) */
export interface ReachRuleData {
  rules: ReachRule[]
  rulesVersion: string | null
  vulnFunctions: ReachVulnFunction[]
  vulnFunctionsVersion: string | null
  vulnFunctionsGenerated: string | null
}

const RULE_PAGE_SIZE = 100
const RULE_MAX_PAGES = 20

async function fetchAllPages<T extends { nextCursor: string | null; hasNext: boolean }>(path: string, query: Record<string, string>) {
  const pages: T[] = []
  let cursor: string | null = null
  for (let page = 0; page < RULE_MAX_PAGES; page += 1) {
    const params = new URLSearchParams({ ...query, size: String(RULE_PAGE_SIZE) })
    if (cursor) params.set('cursor', cursor)
    const result: T = await apiRequest<T>(`${path}?${params}`)
    pages.push(result)
    if (!result.hasNext || !result.nextCursor) break
    cursor = result.nextCursor
  }
  return pages
}

/** API-09(include=definition) + API-10. 둘 다 끝까지 받는다. 예시 데이터로 대신하지 않는다 */
export async function fetchReachRuleData(): Promise<ReachRuleData> {
  const [rulePages, functionPages] = await Promise.all([
    fetchAllPages<ReachRulePage>('/api/v1/reach/rules', { include: 'definition' }),
    fetchAllPages<ReachVulnFunctionPage>('/api/v1/reach/vuln-functions', {}),
  ])
  const lastFunctions = functionPages[functionPages.length - 1]
  return {
    rules: rulePages.flatMap((page) => page.items),
    rulesVersion: rulePages[rulePages.length - 1]?.version ?? null,
    vulnFunctions: functionPages.flatMap((page) => page.items),
    vulnFunctionsVersion: lastFunctions?.version ?? null,
    vulnFunctionsGenerated: lastFunctions?.generated ?? null,
  }
}

const RULE_FINDING_MAX_PAGES = 20
const emptyFindingFilter: ReachFindingFilter = { status: [], severity: [], reviewState: [], deployment: [], cveContains: '' }

/**
 * 규칙별 주 방식·적용 Finding을 세려고 기본 범위(앱·대상 종류마다 최신 완료 스캔, PR 제외)의 Finding을 모두 받는다 (SCR-06-03·09).
 * Finding API가 없는 개발 서버에서는 명세 예시 값으로 대신한다
 */
export const fetchReachRuleFindings = () =>
  orSample(
    async (): Promise<ReachFindingListItem[]> => {
      const items: ReachFindingListItem[] = []
      let cursor: string | null = null
      for (let page = 0; page < RULE_FINDING_MAX_PAGES; page += 1) {
        const params = new URLSearchParams({ size: String(REACH_PAGE_SIZE) })
        if (cursor) params.set('cursor', cursor)
        const result: ReachFindingPage = await apiRequest<ReachFindingPage>(`/api/v1/reach/findings?${params}`)
        items.push(...result.items)
        if (!result.hasNext || !result.nextCursor) break
        cursor = result.nextCursor
      }
      return items
    },
    () => sampleReachFindings(emptyFindingFilter, null, 1000).items,
  )
