import { ApiError, apiRequest } from './client'
import {
  sampleReachApps,
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

/**
 * L3 능동 관측이 닿은 곳 (PRD FR-14). 이미지를 실제로 띄워 시나리오를 보냈을 때 취약 코드 쪽으로 어디까지 실행됐나.
 * 취약 함수 호출 가능 여부 옆에 놓는 근거다. 실행이 그 CVE의 조건을 보여 주면 서버가 판정을 raiseLimit까지 올리고 근거에 RUNTIME 한 줄을 남긴다.
 * REGION 취약 구간 실행 / FUNCTION 취약 함수까지 / NONE 모두 확인했고 실행 없음 / NOT_RECORDED 확인하지 못한 것이 있음
 */
export type ReachL3Level = 'REGION' | 'FUNCTION' | 'NONE' | 'NOT_RECORDED'

/**
 * 이 L3 결과가 판정을 올릴 수 있는 한도. 구간이 실행돼도 그 CVE 규칙의 조건(설정·기능 사용)을 보여 주지 않으면
 * UNKNOWN(확인 못 함까지)이나 NONE(올리지 않음)이다. CVE마다 규칙 데이터가 정한다
 */
export type ReachL3RaiseLimit = 'REACHABLE' | 'UNKNOWN' | 'NONE'

/** 목록(API-04)의 L3. regionsChecked는 FUNCTION일 때 구간을 봤는지, startupOnly는 앱이 뜨는 동안에만 실행됐는지 */
export interface ReachL3Summary {
  reached: ReachL3Level
  regionsChecked: boolean
  startupOnly: boolean
  /** 서버가 이 칸을 주기 전 응답이면 없다(그때는 구간 실행 = 호출 가능까지로 본다) */
  raiseLimit?: ReachL3RaiseLimit | null
}

/** 실행 기록을 끊은 구간 id: "startup"(앱이 준비될 때까지) 또는 시나리오 단계("001", "002", …) */
export type ReachL3Segment = string

export interface ReachL3Function {
  /** 클래스#메서드(desc) */
  function: string
  during: ReachL3Segment[]
}

export interface ReachL3Region {
  class: string
  method: string
  /** 줄 범위. 없으면 메서드 전체(wholeMethod) */
  lines?: Array<[number, number]>
  wholeMethod?: boolean
  executedLines?: number[]
  executed: boolean
  during: ReachL3Segment[]
  /** 확인하지 못한 이유: OTHER_VERSION, OUT_OF_SCOPE, NO_CLASS_FILE, NO_METHOD, NO_LINE_NUMBERS */
  unchecked?: string
}

/** L2가 찾은 호출 경로를 진입점부터 끊기지 않고 탄 단계 수. steps는 진입점이 실행됐을 때만 온다 */
export interface ReachL3Path {
  target: string
  reachedStep: number
  of: number
  steps?: Array<{ method: string; executed: boolean | null }>
}

/** 그 관측의 근거 항목 (FR-14). configKeys에는 이름과 켜짐 여부만 있고 값은 없다 */
export interface ReachL3Run {
  scanId: number
  scenario: string
  observationMethod: 'COVERAGE' | 'MAPS' | 'UPROBE' | string
  observedAt: string
  build?: { imageDigest?: string; jarSha256?: string } | null
  configKeys?: Array<{ name: string; enabled: boolean }> | null
  invocations?: Array<{ segment: ReachL3Segment; name: string; request: string; count?: number; ok?: number; failed?: number; skipped?: number }> | null
  /** true면 앱을 다시 띄운 것이 아니라 보관한 실행 기록을 scanId 검사에서 다시 대조한 결과다. observedAt은 처음 관측한 때 */
  rematch?: boolean
}

/** 상세(API-05)의 L3 */
export interface ReachL3Detail extends ReachL3Summary {
  during?: ReachL3Segment[] | null
  functions?: ReachL3Function[] | null
  regions?: ReachL3Region[] | null
  paths?: ReachL3Path[] | null
  note?: string | null
  run: ReachL3Run
}

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
  /** 이 이미지를 띄워 본 결과가 없으면 null */
  l3?: ReachL3Summary | null
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
  /** RUNTIME: L3가 판정을 올렸을 때. executed면 취약 구간 실행, l2Status는 올리기 전 L2 판정 */
  executed?: boolean
  reached?: ReachL3Level
  regionsChecked?: boolean
  startupOnly?: boolean
  l2Status?: ReachStatus
}

/** API-05 취약점 상세 */
export interface ReachFindingDetail {
  id: number
  scanId: number
  targetId: number
  /** path: 이미지 안 위치(예: app.jar 안의 BOOT-INF/lib/…) */
  component: { purl: string; name: string; version: string; ecosystem?: string; path?: string }
  vulnerability: {
    id: string
    severity: ReachSeverity
    severityNote?: string
    title?: string
    /** 스캐너 설명 원문(영어) */
    description?: string
    affectedFeature?: string
    fixedVersions: string[]
    /** 예: ["CWE-400", "CWE-1333"] */
    cwe?: string[]
    /** 스캐너가 준 참고 링크 */
    references?: string[]
  }
  deployment: ReachDeployment
  /** L3 능동 관측. 이 이미지를 띄워 본 결과가 없으면 null */
  l3?: ReachL3Detail | null
  sources?: Array<'TRIVY' | 'GRYPE'>
  verdict: {
    status: ReachStatus
    method?: ReachMethod
    summary: string
    notAnalyzedReason?: ReachNotAnalyzedReason
    ruleId?: string
    /** 판정에 쓴 취약 함수(API-10 id). 같은 데이터 버전 안에서만 같은 함수다 */
    vulnFunctionIds?: number[]
    /** include=vulnFunctions일 때 */
    vulnFunctions?: ReachVulnFunction[]
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
 * HUMAN(사람이 남김) / CARRIED(이전 검사에서 이어받음) / RESET(판정·근거가 바뀌어 서버가 되돌림)
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
/** 기본 범위의 기준 (API-04·08 basis). RUNNING은 앱마다 실행 중 이미지의 검사를 먼저 쓴다 */
export type ReachBasis = 'RUNNING' | 'LATEST'

/** API-08 basis. 기본 범위(target·scanId 없음)일 때만 온다 */
export interface ReachSummaryBasis {
  requested: ReachBasis
  /** RUNNING을 요청해도 L1이 꺼졌거나 신선한 조회가 없으면 LATEST */
  applied: ReachBasis
  scans: Array<{ app: string; targetType: 'REPO' | 'IMAGE'; targetId: number; scanId: number; imageDigest: string | null; running: boolean }>
  /** 실행 중인데 검사가 없는 워크로드. 그 앱은 최신 검사로 대신 집계됐다 */
  unscannedRunning: Array<{
    app: string | null
    namespace: string
    name: string
    container: string
    imageRepository: string
    imageDigest: string
  }>
}

export interface ReachSummary {
  scope: { targetId: number | null; scanId: number | null }
  basis?: ReachSummaryBasis | null
  totals: { findings: number }
  byStatus: Record<ReachStatus, number>
  /** API 명세는 네 사유를 0까지 준다. ANALYSIS_TIMEOUT은 없을 수 있다 */
  byNotAnalyzedReason: Partial<Record<ReachNotAnalyzedReason, number>>
  bySeverity: Record<ReachSeverity, number>
  byMethod: Record<ReachMethod, number>
  byReviewState: Record<ReachReviewState, number>
  byDeployment: Record<ReachDeployment, number>
  /** include=matrix일 때. 위험도 × 상태이고 0인 칸은 빠진다 */
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
  /** L3 도달 수준. 고르면 L3 결과가 없는 Finding은 빠진다 */
  l3?: ReachL3Level[]
  /** 특정 검사의 결과만 볼 때 (SCR-05 [결과 보기]). 없으면 기본 범위 */
  scanId?: number | null
  /** 기본 범위의 기준. 없으면 RUNNING(서버 기본) */
  basis?: ReachBasis
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
 * API-01~14는 모두 develop에 있다. 옛 백엔드를 띄운 개발 서버에서만, 그 서버에 없는 API를 명세 예시 값으로 대신 그리고 화면에 알린다.
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
  if (filter.l3?.length) params.set('l3', filter.l3.join(','))
  if (filter.scanId) params.set('scanId', String(filter.scanId))
  else if (filter.basis === 'LATEST') params.set('basis', 'LATEST')
  params.set('size', String(REACH_PAGE_SIZE))
  params.set('include', 'total')
  if (cursor) params.set('cursor', cursor)
  return params.toString()
}

/** API-14 한 항목. repo·path·image는 설정에 없으면 null */
export interface ReachAppItem {
  code: ReachApp
  repo: string | null
  path: string | null
  image: string | null
}

/** API-14 감시 대상 앱. 설정 순서 그대로 */
export const fetchReachApps = () =>
  orSample(async () => (await apiRequest<{ items: ReachAppItem[] }>('/api/v1/reach/apps')).items, sampleReachApps)

/** API-08 */
export const fetchReachSummary = (basis: ReachBasis = 'RUNNING') =>
  orSample(
    () => apiRequest<ReachSummary>(`/api/v1/reach/summary?include=matrix${basis === 'LATEST' ? '&basis=LATEST' : ''}`),
    sampleReachSummary,
  )

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
    () => apiRequest<ReachFindingDetail>(`/api/v1/reach/findings/${findingId}?include=reviewHistory,vulnFunctions`),
    () => sampleReachFinding(findingId),
  )

// ---- 워크로드 (API-07, SCR-04) ----

export type ReachScanMatchStatus = 'MATCH' | 'MISMATCH' | 'NO_SCAN'
/** 앱 코드. 열거값이 아니라 대시보드 설치 설정(logssey.reach.apps)의 값이다 (API-14, PRD FR-15) */
export type ReachApp = string

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

// ---- 검사 (API-01·02·03, SCR-05) ----

export type ReachScanStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
export type ReachTrigger = 'MANUAL' | 'PR' | 'IMAGE_BUILD' | 'SCHEDULE'
export type ReachStageName = 'SBOM' | 'MATCH' | 'L1' | 'L2' | 'REPORT'

export interface ReachScanStage {
  name: ReachStageName | string
  status: ReachScanStatus | 'SKIPPED' | string
  message?: string
  durationSeconds?: number
}

/** API-03 검사 (3-1, 3-2). counts는 SUCCEEDED, failure는 FAILED일 때만 */
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
  /** 이 검사가 앱을 띄워 봤을 때만 (L3). FAILED여도 검사는 실패가 아니다 */
  l3?: {
    runStatus: 'SUCCEEDED' | 'FAILED'
    error?: string | null
    scenario?: string | null
    observedAt?: string | null
    counts?: Partial<Record<ReachL3Level, number>> | null
  } | null
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

/**
 * API-01 본문. target과 rescanOf 중 하나만 준다.
 * target: app을 안 주면 서버가 저장소 이름으로 정한다(모르면 422).
 * rescanOf: 성공한 검사의 ID. 그 검사의 대상을 보관한 SBOM으로 다시 대조한다(성공한 검사가 아니면 422)
 */
export type ReachScanInput =
  | {
      target:
        | { type: 'IMAGE'; app?: ReachApp; image: { repository: string; digest: string } }
        | { type: 'REPO'; app?: ReachApp; repo: { name: string; commit: string; path?: string } }
      options: { l1: boolean; l2: boolean }
    }
  | { rescanOf: number }

/** API-01. 응답은 API-03과 같은 검사(202). 같은 멱등 키로 다시 보내면 처음 응답을 다시 준다. 예시 데이터로 대신하지 않는다 */
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

/** 규칙·취약 함수 데이터는 작아서(CVE 수십 개) 전부 받아 화면이 찾고 묶는다 (SCR-06-01) */
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

/**
 * API-10만 끝까지 받는다. 취약점 상세의 취약 함수 카드(SCR-03-10)가 API-05 include=vulnFunctions를
 * 아직 채우지 않는 서버에서 vulnFunctionIds로 함수를 찾을 때 쓴다
 */
export async function fetchReachVulnFunctions(): Promise<{ items: ReachVulnFunction[]; version: string | null }> {
  const pages = await fetchAllPages<ReachVulnFunctionPage>('/api/v1/reach/vuln-functions', {})
  return { items: pages.flatMap((page) => page.items), version: pages[pages.length - 1]?.version ?? null }
}

const RULE_FINDING_MAX_PAGES = 20
const emptyFindingFilter: ReachFindingFilter = { status: [], severity: [], reviewState: [], deployment: [], cveContains: '' }

/**
 * 규칙별 주 방식·적용 취약점을 세려고 기본 범위(앱·대상 종류마다 최신 완료 검사, PR 제외)의 취약점을 모두 받는다 (SCR-06-03·09).
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

// ---- CI 검사 (API-12 결과 조회, SCR-05-10) ----

export type ReachCiPolicy = 'REPORT_ONLY' | 'GATE'
export type ReachGateResult = 'PASS' | 'WARN' | 'FAIL'

export interface ReachGateReason {
  condition: string
  count: number
  summary: string
}

export interface ReachCiCheck {
  id: number
  mode: ReachTrigger
  repository: string
  headCommit: string | null
  pullRequest: { number: number; baseRef: string | null; headRef: string | null } | null
  scanId: number
  scanStatus: ReachScanStatus
  policy: ReachCiPolicy
  baselineScanId: number | null
  /** 검사가 SUCCEEDED일 때만 있다 */
  gate: {
    result: ReachGateResult
    exitCode: number
    reasons: ReachGateReason[]
    newFindings: { total: number; byStatus: Partial<Record<ReachStatus, number>> }
  } | null
  findingsUrl: string | null
  /** 목록이 생기며 더한 칸. 옛 서버는 주지 않는다 */
  createdAt?: string | null
  finishedAt: string | null
}

/**
 * API-12 결과 조회. 검사 하나를 검사 ID로 본다.
 * 예시 값으로 대신하지 않는다: 실제 CI가 만든 검사라 실제 결과가 아니면 의미가 없다
 */
export const fetchReachCiCheck = (checkId: number) => apiRequest<ReachCiCheck>(`/api/v1/reach/ci/checks/${checkId}`)

export interface ReachCiCheckPage {
  items: ReachCiCheck[]
  nextCursor: string | null
  hasNext: boolean
  totalCount?: number | null
}

export interface ReachCiCheckFilter {
  mode: ReachTrigger[]
  scanStatus: ReachScanStatus[]
}

export const REACH_CI_CHECK_PAGE_SIZE = 20

export function reachCiCheckQuery(filter: ReachCiCheckFilter, cursor: string | null): string {
  const params = new URLSearchParams()
  if (filter.mode.length) params.set('mode', filter.mode.join(','))
  if (filter.scanStatus.length) params.set('scanStatus', filter.scanStatus.join(','))
  params.set('size', String(REACH_CI_CHECK_PAGE_SIZE))
  params.set('include', 'total')
  if (cursor) params.set('cursor', cursor)
  return params.toString()
}

/** API-12 목록. 최신 검사부터. 예시 값으로 대신하지 않는다(결과 조회와 같은 이유) */
export const fetchReachCiChecks = (filter: ReachCiCheckFilter, cursor: string | null) =>
  apiRequest<ReachCiCheckPage>(`/api/v1/reach/ci/checks?${reachCiCheckQuery(filter, cursor)}`)
