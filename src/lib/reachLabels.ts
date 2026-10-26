// 취약점 관리(Reach) 화면 글자. 값은 API 그대로 쓰고 보이는 글자만 바꾼다 (Reach 화면 명세 2-3)
import type {
  ReachDeployment,
  ReachMethod,
  ReachNotAnalyzedReason,
  ReachResetReason,
  ReachReviewState,
  ReachSeverity,
  ReachStatus,
} from '@/api/reach'

export const reachStatusOrder: ReachStatus[] = ['REACHABLE', 'UNKNOWN', 'UNREACHABLE', 'NOT_ANALYZED']
export const reachSeverityOrder: ReachSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']
export const reachReviewOrder: ReachReviewState[] = ['CONFIRMED', 'PROVISIONAL', 'UNREVIEWED']
export const reachDeploymentOrder: ReachDeployment[] = ['RUNNING', 'NOT_RUNNING', 'UNKNOWN']
export const reachNotAnalyzedReasonOrder: ReachNotAnalyzedReason[] = [
  'UNANALYZED_COPY',
  'OS_PACKAGE',
  'NO_VULN_FUNCTION_DATA',
  'UNSUPPORTED_ECOSYSTEM',
  'ANALYSIS_TIMEOUT',
]

/** 모르는 값이 오면 값을 그대로 보인다. 값 추가는 API v2로 내는 게 원칙이지만 화면이 "undefined"를 쓰지 않게 한다 */
export function labelOf(labels: Record<string, string>, value: string): string {
  return labels[value] ?? value
}

/** 도달 불가의 초록은 "안전"이 아니라 "호출 경로가 없다"는 뜻이다. "안전", "해결됨"이라고 쓰지 않는다 */
export const reachStatusLabel: Record<ReachStatus, string> = {
  REACHABLE: '도달 가능',
  UNKNOWN: '미확인',
  UNREACHABLE: '도달 불가',
  NOT_ANALYZED: '분석 대상 아님',
}

export const reachMethodLabel: Record<ReachMethod, string> = {
  CALLGRAPH: '호출 그래프',
  RULE: '규칙',
  MANUAL: '사람',
}

export const reachReviewLabel: Record<ReachReviewState, string> = {
  UNREVIEWED: '검토 전',
  PROVISIONAL: '잠정',
  CONFIRMED: '확정',
}

/** 판정 상태의 "미확인"과 헷갈리지 않게 배포 상태 UNKNOWN은 "확인 못 함"으로 쓴다 */
export const reachDeploymentLabel: Record<ReachDeployment, string> = {
  RUNNING: '실행 중',
  NOT_RUNNING: '실행 안 함',
  UNKNOWN: '확인 못 함',
}

export const reachNotAnalyzedReasonLabel: Record<ReachNotAnalyzedReason, string> = {
  UNANALYZED_COPY: '판정하지 않은 사본',
  OS_PACKAGE: 'OS 패키지',
  NO_VULN_FUNCTION_DATA: '취약 함수 데이터 없음',
  UNSUPPORTED_ECOSYSTEM: '지원하지 않는 생태계',
  ANALYSIS_TIMEOUT: '분석 시간 초과',
}

export const reachResetReasonLabel: Record<ReachResetReason, string> = {
  VERDICT_CHANGED: '재검토 필요: 판정 바뀜',
  EVIDENCE_CHANGED: '재검토 필요: 근거 바뀜',
}

export const reachMatchedConditionLabel: Record<string, string> = {
  REACHABLE: '도달 가능 조건',
  UNREACHABLE: '도달 불가 조건',
  UNKNOWN: '미확인 조건',
  DEFAULT: '기본값',
}

/** reach.css 클래스 이름 */
export const reachStatusTone: Record<ReachStatus, string> = {
  REACHABLE: 'reachable',
  UNKNOWN: 'unknown',
  UNREACHABLE: 'unreachable',
  NOT_ANALYZED: 'not-analyzed',
}
