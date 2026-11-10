// 취약점 관리(Reach) 화면 계산. 집계는 백엔드가 하고, 여기서는 표시용 계산만 한다
import type {
  ReachFindingDetail,
  ReachFindingListItem,
  ReachNotAnalyzedReason,
  ReachReviewInput,
  ReachReviewState,
  ReachSeverity,
  ReachStatus,
  ReachSummary,
  ReachScan,
  ReachScanInput,
  ReachVulnFunction,
  ReachWorkload,
} from '@/api/reach'
import { reachNotAnalyzedReasonOrder, reachScanMatchOrder, reachSeverityOrder, reachStatusOrder } from './reachLabels'

const KST = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  timeZone: 'Asia/Seoul', hour12: false,
})

export function formatKst(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : `${KST.format(date)} KST`
}

function versionParts(version: string): string[] {
  return version.split(/[.\-+_]/)
}

/** 숫자 칸은 숫자로, 나머지는 글자로 비교한다 (1.81.1 > 1.81, 1.6.58-r1 > 1.6.58-r0) */
export function compareVersions(a: string, b: string): number {
  const left = versionParts(a)
  const right = versionParts(b)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = left[i]
    const y = right[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = /^\d+$/.test(x) ? Number(x) : NaN
    const ny = /^\d+$/.test(y) ? Number(y) : NaN
    const diff = !Number.isNaN(nx) && !Number.isNaN(ny) ? nx - ny : x.localeCompare(y)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  return 0
}

/** 가장 가까운 수정 버전: 설치 버전보다 큰 값 가운데 가장 작은 값 (SCR-02 열 정의) */
export function nearestFixedVersion(installed: string, fixedVersions: string[]): string | null {
  const newer = fixedVersions.filter((version) => compareVersions(version, installed) > 0)
  return newer.sort(compareVersions)[0] ?? null
}

/** purl의 네임스페이스(그룹). pkg:maven/org.bouncycastle/bcprov-jdk18on@1.81 → org.bouncycastle */
export function packageGroup(purl: string): string {
  const withoutVersion = purl.replace(/^pkg:/, '').split('@')[0]
  const parts = withoutVersion.split('/')
  return parts.length > 2 ? parts.slice(1, -1).join('/') : parts[0]
}

/** purl에서 버전·한정자를 뺀 패키지. API-10 package와 같은 모양이다 (pkg:maven/group/artifact) */
export function purlWithoutVersion(purl: string): string {
  return purl.split(/[@?#]/)[0]
}

/** 스캐너가 준 참고 링크 가운데 열어도 되는 주소. http(s)만 링크로 만들고 나머지는 글자로 둔다 */
export function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

export interface FindingVulnFunctions {
  /** VERDICT: 판정에 쓴 함수(vulnFunctions 또는 vulnFunctionIds). DATA: 판정 결과에 함수가 없어 같은 CVE·패키지의 데이터로 대신 보임 */
  source: 'VERDICT' | 'DATA'
  functions: ReachVulnFunction[]
  /** API-10에서 찾지 못했거나 CVE가 다른 id. 판정 뒤 데이터 버전이 바뀐 경우다 */
  missingIds: number[]
}

/**
 * 취약 함수 카드(SCR-03-10)에 보일 함수. API-05가 vulnFunctions를 주면 그대로 쓰고,
 * 아니면 vulnFunctionIds를 API-10 데이터에서 찾는다. id는 같은 데이터 버전 안에서만 같아서 CVE가 다르면 뺀다.
 * id도 없으면 같은 CVE·패키지의 함수를 데이터에서 보인다. 분석 대상 아님이면 보일 것이 없다
 */
export function findingVulnFunctions(
  detail: Pick<ReachFindingDetail, 'component' | 'vulnerability' | 'verdict'>,
  data: ReachVulnFunction[] | undefined,
): FindingVulnFunctions | null {
  const { verdict, vulnerability, component } = detail
  if (verdict.status === 'NOT_ANALYZED') return null
  if (verdict.vulnFunctions?.length) return { source: 'VERDICT', functions: verdict.vulnFunctions, missingIds: [] }
  if (!data) return null
  const ids = verdict.vulnFunctionIds ?? []
  if (ids.length) {
    const byId = new Map(data.map((item) => [item.id, item]))
    const functions: ReachVulnFunction[] = []
    const missingIds: number[] = []
    for (const id of ids) {
      const found = byId.get(id)
      if (found && found.cve === vulnerability.id) functions.push(found)
      else missingIds.push(id)
    }
    return { source: 'VERDICT', functions, missingIds }
  }
  const pkg = purlWithoutVersion(component.purl)
  const functions = data.filter((item) => item.cve === vulnerability.id && item.package === pkg)
  return functions.length ? { source: 'DATA', functions, missingIds: [] } : null
}

/** CVE-2026-8763 → [2026, 8763]. CVE가 아닌 ID는 글자 비교로 뒤에 둔다 */
function cveKey(id: string): [number, number] | null {
  const match = /^CVE-(\d{4})-(\d+)$/i.exec(id)
  return match ? [Number(match[1]), Number(match[2])] : null
}

export function compareCve(a: string, b: string): number {
  const x = cveKey(a)
  const y = cveKey(b)
  if (x && y) return x[0] - y[0] || x[1] - y[1]
  if (x) return -1
  if (y) return 1
  return a.localeCompare(b)
}

/** 기본 정렬: 상태(도달 가능 → 미확인 → 도달 불가 → 분석 대상 아님) → 심각도 → CVE (API-04 sort 기본값) */
export function compareFindings(a: ReachFindingListItem, b: ReachFindingListItem): number {
  return (
    reachStatusOrder.indexOf(a.verdict.status) - reachStatusOrder.indexOf(b.verdict.status) ||
    reachSeverityOrder.indexOf(a.vulnerability.severity) - reachSeverityOrder.indexOf(b.vulnerability.severity) ||
    compareCve(a.vulnerability.id, b.vulnerability.id) ||
    a.component.purl.localeCompare(b.component.purl)
  )
}

/** 판정 완료 = 도달 가능 + 미확인 + 도달 불가 (분석 대상 아님은 판정하지 않은 것) */
export function judgedCount(byStatus: Record<ReachStatus, number>): number {
  return byStatus.REACHABLE + byStatus.UNKNOWN + byStatus.UNREACHABLE
}

/** 0이 아닌 사유만 "판정하지 않은 사본 7 · OS 패키지 2"처럼 쓴다 */
export function notAnalyzedReasonParts(
  byReason: Partial<Record<ReachNotAnalyzedReason, number>>,
  label: Record<ReachNotAnalyzedReason, string>,
): string[] {
  return reachNotAnalyzedReasonOrder
    .filter((reason) => (byReason[reason] ?? 0) > 0)
    .map((reason) => `${label[reason]} ${byReason[reason]}`)
}

/** 상태 × 심각도 칸. API는 0인 칸을 빼고 주므로 화면이 0으로 채운다 (SCR-01-06) */
export function matrixCell(summary: ReachSummary, status: ReachStatus, severity: ReachSeverity): number {
  return summary.severityByStatus?.[severity]?.[status] ?? 0
}

/** 지표는 분수로만 쓰고 백분율은 쓰지 않는다 (SCR-01-08) */
export function fraction(numerator: number, denominator: number): string {
  return `${numerator}/${denominator}`
}

function zeroRecord<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>
}

function ratio(numerator: number, denominator: number): number | undefined {
  return denominator === 0 ? undefined : Math.round((numerator / denominator) * 1000) / 1000
}

/**
 * Finding 목록으로 API-08 요약 모양을 만든다. 백엔드가 없을 때 예시 데이터에만 쓴다.
 * 실제 화면은 백엔드가 계산한 요약을 그대로 보여준다 (집계는 백엔드에서만)
 */
export function summarizeFindings(items: ReachFindingListItem[], scope: ReachSummary['scope'], generatedAt: string): ReachSummary {
  const summary: ReachSummary = {
    scope,
    totals: { findings: items.length },
    byStatus: zeroRecord(reachStatusOrder),
    // API 명세 3-9처럼 네 사유를 0까지 준다 (ANALYSIS_TIMEOUT은 명세에 아직 없다)
    byNotAnalyzedReason: zeroRecord(reachNotAnalyzedReasonOrder.filter((reason) => reason !== 'ANALYSIS_TIMEOUT')),
    bySeverity: zeroRecord(reachSeverityOrder),
    byMethod: { CALLGRAPH: 0, RULE: 0, MANUAL: 0 },
    byReviewState: { UNREVIEWED: 0, PROVISIONAL: 0, CONFIRMED: 0 },
    byDeployment: { RUNNING: 0, NOT_RUNNING: 0, UNKNOWN: 0 },
    severityByStatus: {},
    noiseReduction: { unreachable: 0, judged: 0 },
    coverage: { judged: 0, total: items.length },
    generatedAt,
  }
  for (const item of items) {
    const { status, method, notAnalyzedReason } = item.verdict
    const severity = item.vulnerability.severity
    summary.byStatus[status]++
    summary.bySeverity[severity]++
    summary.byReviewState[item.review.reviewState]++
    summary.byDeployment[item.deployment]++
    if (status === 'NOT_ANALYZED' && notAnalyzedReason) {
      summary.byNotAnalyzedReason[notAnalyzedReason] = (summary.byNotAnalyzedReason[notAnalyzedReason] ?? 0) + 1
    }
    if (status !== 'NOT_ANALYZED' && method) summary.byMethod[method]++
    const row = (summary.severityByStatus![severity] ??= {})
    row[status] = (row[status] ?? 0) + 1
  }
  const judged = judgedCount(summary.byStatus)
  summary.noiseReduction = { unreachable: summary.byStatus.UNREACHABLE, judged, ratio: ratio(summary.byStatus.UNREACHABLE, judged) }
  summary.coverage = { judged, total: items.length, ratio: ratio(judged, items.length) }
  return summary
}

/** 검토 메모 길이 (API-06, DB VARCHAR(2000)) */
export const REVIEW_NOTE_MAX = 2000

/** 글자 수. DB와 같이 code point로 센다(이모지도 한 글자). string.length는 이모지를 2로 센다 */
export function noteLength(note: string): number {
  return [...note].length
}

/**
 * API-06 본문을 만든다. 확정·잠정에는 사람이 본 판정과 근거 메모가 있어야 하고(NFR-02),
 * 검토 전으로 되돌릴 때는 둘 다 보내지 않는다. 보낼 수 없는 입력이면 null
 */
export function reviewInput(
  reviewState: ReachReviewState,
  status: ReachReviewInput['status'] | '',
  note: string,
  version: number,
): ReachReviewInput | null {
  if (reviewState === 'UNREVIEWED') return { reviewState, version }
  const trimmed = note.trim()
  if (!status || !trimmed || noteLength(trimmed) > REVIEW_NOTE_MAX) return null
  return { reviewState, status, note: trimmed, version }
}

// ---- 워크로드 (SCR-04) ----

/** sha256: 뒤 앞 12자리. 전체 값은 title·복사로 준다 */
export function shortDigest(digest: string): string {
  const hex = digest.startsWith('sha256:') ? digest.slice('sha256:'.length) : digest
  return hex.length > 12 ? `${hex.slice(0, 12)}…` : hex
}

/** 태그가 40자 커밋 SHA면 앞 7자리, 아니면 그대로 */
export function shortRevision(revision: string | undefined | null): string | null {
  if (!revision) return null
  return /^[0-9a-f]{40}$/.test(revision) ? revision.slice(0, 7) : revision
}

/** 불일치 → 스캔 없음 → 일치, 같은 묶음 안에서는 네임스페이스·이름·컨테이너·digest 순 (SCR-04-06) */
export function compareWorkloads(a: ReachWorkload, b: ReachWorkload): number {
  return (
    reachScanMatchOrder.indexOf(a.scanMatch.status) - reachScanMatchOrder.indexOf(b.scanMatch.status) ||
    a.namespace.localeCompare(b.namespace) ||
    a.name.localeCompare(b.name) ||
    a.container.localeCompare(b.container) ||
    a.image.digest.localeCompare(b.image.digest)
  )
}

/** 요약 카드 3개 (SCR-04-03~05). 워크로드는 (네임스페이스, 종류, 이름)으로 센다. 롤아웃 중이면 항목은 둘이어도 워크로드는 하나다 */
export function summarizeWorkloads(items: ReachWorkload[]) {
  const workloads = new Set(items.map((item) => `${item.cluster}/${item.namespace}/${item.kind}/${item.name}`))
  return {
    workloads: workloads.size,
    readyPods: items.reduce((sum, item) => sum + item.replicas.ready, 0),
    match: items.filter((item) => item.scanMatch.status === 'MATCH').length,
    noScan: items.filter((item) => item.scanMatch.status === 'NO_SCAN').length,
    mismatch: items.filter((item) => item.scanMatch.status === 'MISMATCH').length,
  }
}

// ---- 스캔 (SCR-05) ----

/** 진행 중인 스캔이 있으면 목록을 10초마다 다시 받는다 (SCR-05-04) */
export function hasActiveScan(scans: ReachScan[]): boolean {
  return scans.some((scan) => scan.scanStatus === 'QUEUED' || scan.scanStatus === 'RUNNING')
}

/** 대상 칸의 둘째 줄: 이미지면 digest 앞 8자리, 레포면 커밋 앞 7자리 (SCR-05 열 정의) */
export function scanTargetRef(scan: ReachScan): string {
  const { target } = scan
  if (target.type === 'IMAGE' && target.image) {
    return `${target.image.repository} @ ${target.image.digest.replace('sha256:', '').slice(0, 8)}`
  }
  if (target.repo) {
    return `${target.repo.name}${target.repo.path ? `/${target.repo.path}` : ''} @ ${target.repo.commit.slice(0, 7)}`
  }
  return '—'
}

/** 결과 칸: "23행 · CRITICAL 5 · HIGH 11 · MEDIUM 7 · 도달 가능 0". 0인 심각도는 뺀다 */
export function scanCountsText(scan: ReachScan): string {
  const counts = scan.counts
  if (!counts) return scan.scanStatus === 'FAILED' ? '결과 없음' : '—'
  const severities = reachSeverityOrder
    .filter((severity) => (counts.bySeverity[severity] ?? 0) > 0)
    .map((severity) => `${severity} ${counts.bySeverity[severity]}`)
  return [`${counts.total}행`, ...severities, `도달 가능 ${counts.byStatus.REACHABLE ?? 0}`].join(' · ')
}

export type NewScanForm = {
  type: 'IMAGE' | 'REPO'
  app: '' | 'API' | 'WEB' | 'CHAT'
  repository: string
  digest: string
  repoName: string
  commit: string
  path: string
  l1: boolean
  l2: boolean
}

export const emptyNewScanForm: NewScanForm = {
  type: 'IMAGE',
  app: '',
  repository: '',
  digest: '',
  repoName: '',
  commit: '',
  path: '',
  l1: true,
  l2: true,
}

/**
 * 새 스캔 입력 검사 (SCR-05-09, API-01). 서버와 같은 규칙만 미리 본다.
 * 오류가 있으면 칸 이름 → 안내 글, 없으면 API-01 본문
 */
export function newScanRequest(form: NewScanForm): { errors: Partial<Record<keyof NewScanForm, string>>; input?: ReachScanInput } {
  const errors: Partial<Record<keyof NewScanForm, string>> = {}
  const app = form.app || undefined
  if (form.type === 'IMAGE') {
    const repository = form.repository.trim()
    const digest = form.digest.trim()
    if (!repository) errors.repository = '이미지 저장소를 입력하세요.'
    else if (/[:@]/.test(repository)) errors.repository = '태그나 digest 없이 저장소 이름만 입력하세요. 예: logssey/reused-api'
    if (!/^sha256:[0-9a-f]{64}$/.test(digest)) errors.digest = 'sha256: 뒤에 소문자 16진수 64자를 입력하세요.'
    if (Object.keys(errors).length) return { errors }
    return {
      errors,
      input: { target: { type: 'IMAGE', app, image: { repository, digest } }, options: { l1: form.l1, l2: form.l2 } },
    }
  }
  const name = form.repoName.trim()
  const commit = form.commit.trim()
  const path = form.path.trim()
  if (!name) errors.repoName = '레포 이름을 입력하세요. 예: service-backend'
  if (!/^[0-9a-f]{40}$/.test(commit)) errors.commit = '커밋 SHA 40자(소문자 16진수)를 입력하세요.'
  if (Object.keys(errors).length) return { errors }
  return {
    errors,
    input: {
      target: { type: 'REPO', app, repo: path ? { name, commit, path } : { name, commit } },
      options: { l1: form.l1, l2: form.l2 },
    },
  }
}

/** API-01 오류를 사람이 읽을 글로 (API 명세 2-6) */
export function scanRequestErrorText(status: number, code: string | null, message: string): string {
  if (status === 400) return `입력 값을 확인하세요. (${message})`
  if (status === 403) return '스캔을 요청할 권한이 없어요.'
  if (status === 409) return '같은 요청이 처리 중이거나, 같은 요청 키로 다른 내용을 보냈어요. 잠시 뒤 다시 시도하세요.'
  if (status === 422) return '어느 서비스(앱)의 대상인지 정하지 못했어요. 앱을 직접 골라 주세요.'
  if (status === 503) return '스캔 실행기(GitHub 워크플로)를 지금 부를 수 없어요. 잠시 뒤 다시 시도하세요.'
  return code ? `${message} (${code})` : message
}
