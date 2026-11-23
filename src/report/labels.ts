import type { ReportAdvice, ReportFinding, ReportPart, ReportSeverity } from './types'

export const PARTS: ReportPart[] = ['IAC', 'SECRET', 'VULNERABILITY', 'RUNTIME']

export const partLabel: Record<ReportPart, string> = {
  IAC: 'IaC 보안',
  SECRET: '시크릿',
  VULNERABILITY: '취약점(이미지·공급망)',
  RUNTIME: '런타임 보안',
}

/** 리포트 4개 절. 급한 것부터 보도록 우선순위가 맨 앞이다. 보기 화면의 목차와 인쇄본의 절 번호가 같다 */
export const SECTIONS = [
  { id: 'priorities', title: '처리 우선순위' },
  { id: 'vulnerabilities', title: '발견된 취약점' },
  { id: 'remediation', title: '공통 조치 방안' },
  { id: 'appendix', title: '부록' },
] as const

export const SEVERITIES: ReportSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNASSESSED']

export const severityLabel: Record<ReportSeverity, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  UNASSESSED: '미평가',
}

export const severityTone: Record<ReportSeverity, string> = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: '',
  UNASSESSED: '',
}

const KST = 'Asia/Seoul'

/** 2026-11-23 14:05 KST */
export function formatTime(value: string | null): string {
  if (!value) return '— (기록 없음)'
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} KST`
}

/** 2026-11-23 */
export function formatDay(value: string | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-CA', { timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(value))
}

/** 오늘(KST)과 30일 전. 새 리포트의 기본 기간 */
export function defaultPeriod(now = new Date()): { from: string; to: string } {
  const to = formatDay(now.toISOString())
  const from = formatDay(new Date(now.getTime() - 30 * 86_400_000).toISOString())
  return { from, to }
}

export function dueText(finding: ReportFinding): string {
  if (!finding.dueAt) return '—'
  return `${formatDay(finding.dueAt)}${finding.dueDefault ? ' (기본값)' : ''}`
}

/** 이름을 비웠을 때 만들어질 이름 (백엔드 규칙과 같다). 파트가 여럿이면 [파트명] 자리로 보인다 */
export function defaultName(parts: ReportPart[], from: string, to: string): string {
  const label = parts.length === 1 ? partLabel[parts[0]] : '파트명'
  return `[${label}] 보안 리포트 ${from} ~ ${to}`
}

/** ?part=IAC 처럼 넘어온 파트를 고른다. 없으면 데이터가 연결된 첫 파트 */
export function partsFromQuery(value: string | null, connected: ReportPart[]): ReportPart[] {
  const picked = (value ?? '').split(',').filter((p): p is ReportPart => (PARTS as string[]).includes(p))
  return picked.length ? picked : connected.slice(0, 1)
}

const adviceReasons: Record<string, string> = {
  DISABLED: 'AI 추천이 꺼져 있어요',
  PART_NOT_CONNECTED: '이 파트는 아직 데이터가 연결되지 않아 AI 추천을 받지 않았어요',
  KEY_MISSING: 'Claude 키가 설정되지 않았어요',
  KEY_STORE_UNAVAILABLE: 'Claude 키를 비밀 저장소에서 읽지 못했어요',
  PROVIDER_TIMEOUT: 'Claude 응답이 늦어 기다리지 못했어요',
  PROVIDER_REFUSED: 'Claude가 이 요청에 답하지 않았어요',
  PROVIDER_RATE_LIMITED: 'Claude 호출 한도에 걸렸어요',
  CALL_BUDGET_EXHAUSTED: '1분 호출 한도를 넘었어요',
}

/** AI 추천을 못 받았을 때 보여줄 한 줄 */
export function adviceReason(advice: ReportAdvice): string {
  return adviceReasons[advice.reason ?? ''] ?? `AI 추천을 받지 못했어요 (${advice.reason ?? '알 수 없음'})`
}
