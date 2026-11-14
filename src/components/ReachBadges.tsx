import type { ReachDeployment, ReachMethod, ReachReviewState, ReachScanMatchStatus, ReachScanStatus, ReachSeverity, ReachStatus } from '@/api/reach'
import {
  labelOf,
  reachDeploymentLabel,
  reachMethodLabel,
  reachReviewLabel,
  reachScanMatchLabel,
  reachScanStatusLabel,
  reachStatusLabel,
  reachStatusTone,
} from '@/lib/reachLabels'

// Reach 배지. 종류마다 모양이 다르고 항상 글자를 쓴다 (Reach 화면 명세 2-3)
// 판정 상태 = 채운 알약, 검토 = 테두리 알약, 배포 = 채운 알약, 심각도 = 왼쪽 막대 칩, 방식 = 회색 네모 태그

export function ReachStatusBadge({ status, large = false }: { status: ReachStatus; large?: boolean }) {
  return (
    <span className={`badge reach-pill reach-status ${reachStatusTone[status] ?? ''} ${large ? 'large' : ''}`.trim()}>
      {labelOf(reachStatusLabel, status)}
    </span>
  )
}

export function ReachReviewBadge({ state }: { state: ReachReviewState }) {
  return <span className={`badge reach-pill reach-review ${state.toLowerCase()}`}>{labelOf(reachReviewLabel, state)}</span>
}

export function ReachDeploymentBadge({ deployment }: { deployment: ReachDeployment }) {
  return (
    <span className={`badge reach-pill reach-deploy ${deployment.toLowerCase().replace('_', '-')}`}>
      {labelOf(reachDeploymentLabel, deployment)}
    </span>
  )
}

export function ReachSeverityChip({ severity }: { severity: ReachSeverity }) {
  return <span className={`badge reach-severity ${severity.toLowerCase()}`}>{severity}</span>
}

/** 판정 방식에는 우열이 없어 색을 쓰지 않는다. 분석 대상 아님은 방식이 없다 */
export function ReachMethodTag({ method }: { method?: ReachMethod }) {
  if (!method) return <span className="caption">—</span>
  return (
    <span className="badge reach-method" title={method === 'RULE' ? '설정·타입 규칙' : undefined}>
      {labelOf(reachMethodLabel, method)}
    </span>
  )
}

/** 스캔 연결 (SCR-04). 불일치는 경고, 스캔 없음은 점선, 일치는 파랑 */
export function ReachScanMatchBadge({ status }: { status: ReachScanMatchStatus }) {
  return (
    <span className={`badge reach-pill reach-match ${status.toLowerCase().replace('_', '-')}`}>
      {labelOf(reachScanMatchLabel, status)}
    </span>
  )
}

/** 스캔 상태 (SCR-05). 진행 중은 글자 앞에 점을 붙인다 */
export function ReachScanStatusBadge({ status }: { status: ReachScanStatus }) {
  return (
    <span className={`badge reach-pill reach-scan ${status.toLowerCase()}`}>
      {status === 'RUNNING' && <span className="reach-dot" aria-hidden="true" />}
      {labelOf(reachScanStatusLabel, status)}
    </span>
  )
}
