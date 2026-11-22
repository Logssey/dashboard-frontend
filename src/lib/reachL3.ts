// L3(실제 실행) 근거를 화면 글자로 바꾸는 순수 함수 (PRD FR-14).
// 취약 구간이 실행됐으면 서버가 판정을 도달 가능으로, 구간을 확인 못 한 함수 실행이면 도달 불가를 확인 못 함으로 올린다
import type { ReachEvidence, ReachL3Detail, ReachL3Path, ReachL3Region, ReachL3Run, ReachL3Segment, ReachL3Summary, ReachStatus } from '@/api/reach'

export const L3_STARTUP = 'startup'

/**
 * 판정이 L3와 맞지 않는 경우: 도달 불가인데 취약 구간이 실행됐거나, 함수가 실행됐는데 구간을 확인하지 못했다.
 * 서버가 올리기 전에 저장된 판정(다음 재대조에서 올라간다)에서만 보인다
 */
export function l3DiffersFromL2(status: ReachStatus, l3: ReachL3Summary | null | undefined): boolean {
  if (status !== 'UNREACHABLE' || !l3) return false
  return l3.reached === 'REGION' || (l3.reached === 'FUNCTION' && !l3.regionsChecked)
}

/** L3가 올린 판정이면 그 근거(RUNTIME). l2Status가 올리기 전 판정이다 */
export function l3Raise(evidence: ReachEvidence[] | null | undefined): ReachEvidence | undefined {
  return (evidence ?? []).find((item) => item.kind === 'RUNTIME' && item.l2Status)
}

/** 한 줄 결론. "실행 없음"은 도달 불가의 근거가 아니라는 점을 함께 적는다 */
export function l3Headline(l3: ReachL3Summary): string {
  const startup = l3.startupOnly ? ' 앱이 뜨는 동안에만 실행됐고, 요청으로 실행된 것은 아니에요.' : ''
  switch (l3.reached) {
    case 'REGION':
      return `취약 구간이 실제로 실행됐어요.${startup}`
    case 'FUNCTION':
      return l3.regionsChecked
        ? `취약 함수까지 실행됐고, 취약 구간은 실행되지 않았어요.${startup}`
        : `취약 함수까지 실행됐어요. 취약 구간은 확인하지 못했어요.${startup}`
    case 'NONE':
      return '시나리오에서 실행되지 않았어요. 시나리오가 이 코드를 지나가지 않았다는 뜻이고, 도달 불가의 근거는 아니에요.'
    default:
      return '확인하지 못했어요. 기록 범위 밖이거나 클래스 파일이 없는 코드예요.'
  }
}

/** tools.jackson.core.io.NumberInput#looksLikeValidNumber(Ljava/lang/String;)Z → NumberInput.looksLikeValidNumber */
export function shortFunction(label: string): string {
  const [owner, rest = ''] = label.split('#')
  const method = rest.split('(')[0]
  const simple = owner.slice(owner.lastIndexOf('.') + 1)
  return method ? `${simple}.${method}` : simple
}

/** L2 경로 단계: com.a.B.name(desc) → B.name */
export function shortPathStep(pretty: string): string {
  const head = pretty.split('(')[0]
  const cut = head.lastIndexOf('.')
  if (cut < 0) return head
  const owner = head.slice(0, cut)
  return `${owner.slice(owner.lastIndexOf('.') + 1)}.${head.slice(cut + 1)}`
}

export interface L3RequestLine {
  segment: ReachL3Segment
  /** 화면에 쓸 이름. 기동 구간은 "앱 기동 중" */
  name: string
  /** "POST /api/v1/listings". 기동 구간이나 근거 항목에 없는 구간은 없다 */
  request?: string
  count?: number
}

/** 구간 id를 그 실행의 요청으로 바꾼다. 근거 항목에 없는 구간은 id를 그대로 보인다 */
export function l3Requests(during: ReachL3Segment[] | null | undefined, run: ReachL3Run | null | undefined): L3RequestLine[] {
  const byId = new Map((run?.invocations ?? []).map((item) => [item.segment, item]))
  return (during ?? []).map((segment) => {
    if (segment === L3_STARTUP) return { segment, name: '앱 기동 중' }
    const found = byId.get(segment)
    return found ? { segment, name: found.name, request: found.request, count: found.count } : { segment, name: `구간 ${segment}` }
  })
}

/** "5개 요청 모두", "5개 중 2개 요청" 같은 요약. 기동 구간은 요청 수에 넣지 않는다 */
export function l3RequestSummary(during: ReachL3Segment[] | null | undefined, run: ReachL3Run | null | undefined): string {
  const steps = (during ?? []).filter((segment) => segment !== L3_STARTUP)
  const startup = (during ?? []).includes(L3_STARTUP)
  const total = run?.invocations?.length ?? 0
  if (steps.length === 0) return startup ? '앱 기동 중에만' : '없음'
  const requests = total > 0 && steps.length === total ? `시나리오 ${total}단계 모두` : total > 0 ? `시나리오 ${total}단계 중 ${steps.length}단계` : `${steps.length}단계`
  return startup ? `${requests} + 앱 기동 중` : requests
}

/** 구간 설명: "626~627줄", "639줄", "메서드 전체" */
export function l3RegionText(region: ReachL3Region): string {
  if (!region.lines?.length) return '메서드 전체'
  return region.lines.map(([from, to]) => (from === to ? `${from}줄` : `${from}~${to}줄`)).join(', ')
}

/** 경로 진행: "5단계 중 2단계까지 실행". 진입점이 실행되지 않았으면 0 */
export function l3PathText(path: ReachL3Path): string {
  return path.reachedStep > 0 ? `${path.of}단계 중 ${path.reachedStep}단계까지 실행` : `진입점이 실행되지 않음 (${path.of}단계 경로)`
}

/** 진입점이 실행된 경로가 먼저, 그 안에서는 많이 간 것 먼저 */
export function l3PathsByProgress(paths: ReachL3Detail['paths']): ReachL3Path[] {
  return [...(paths ?? [])].sort((a, b) => b.reachedStep / (b.of || 1) - a.reachedStep / (a.of || 1))
}
