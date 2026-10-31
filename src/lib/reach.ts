// 취약점 관리(Reach) 화면 계산. 집계는 백엔드가 하고, 여기서는 표시용 계산만 한다
import type {
  ReachFindingListItem,
  ReachNotAnalyzedReason,
  ReachReviewInput,
  ReachReviewState,
  ReachSeverity,
  ReachStatus,
  ReachSummary,
} from '@/api/reach'
import { reachNotAnalyzedReasonOrder, reachSeverityOrder, reachStatusOrder } from './reachLabels'

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
