// 취약점 관리(Reach) 화면 글자. 값은 API 그대로 쓰고 보이는 글자만 바꾼다 (Reach 화면 명세 2-3)
import type {
  ReachDeployment,
  ReachMethod,
  ReachNotAnalyzedReason,
  ReachResetReason,
  ReachReviewState,
  ReachScanMatchStatus,
  ReachScanStatus,
  ReachTrigger,
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

// ---- 워크로드 (SCR-04) ----

/** 화면 기본 순서: 불일치 → 스캔 없음 → 일치 (SCR-04-06). 손볼 것이 위로 온다 */
export const reachScanMatchOrder: ReachScanMatchStatus[] = ['MISMATCH', 'NO_SCAN', 'MATCH']

export const reachScanMatchLabel: Record<ReachScanMatchStatus, string> = {
  MATCH: '일치',
  MISMATCH: '불일치',
  NO_SCAN: '스캔 없음',
}

export const reachSourceLabel: Record<string, string> = {
  MANUAL: '수동',
  CLUSTER_READER: '자동',
}

// ---- 스캔 (SCR-05) ----

export const reachScanStatusOrder: ReachScanStatus[] = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED']
export const reachTriggerOrder: ReachTrigger[] = ['MANUAL', 'PR', 'IMAGE_BUILD', 'SCHEDULE']

export const reachScanStatusLabel: Record<ReachScanStatus, string> = {
  QUEUED: '대기',
  RUNNING: '진행 중',
  SUCCEEDED: '완료',
  FAILED: '실패',
}

export const reachTriggerLabel: Record<ReachTrigger, string> = {
  MANUAL: '수동',
  PR: 'PR',
  IMAGE_BUILD: '이미지 빌드',
  SCHEDULE: '일정',
}

/** API의 다섯 단계 (SCR-05-06). L3는 FR-14 [계획]이라 없다 */
export const reachStageLabel: Record<string, string> = {
  SBOM: 'SBOM 생성',
  MATCH: 'CVE 대조',
  L1: 'L1 배포 확인',
  L2: 'L2 판정',
  REPORT: '보고서',
}

export const reachStageStatusLabel: Record<string, string> = {
  QUEUED: '대기',
  RUNNING: '진행 중',
  SUCCEEDED: '완료',
  FAILED: '실패',
  SKIPPED: '건너뜀',
}

/** 도구·DB 버전 줄 이름 (SCR-05-07). 값이 없는 도구는 줄을 뺀다 */
export const reachToolLabel: Record<string, string> = {
  scanner: '스캐너',
  trivy: 'Trivy',
  trivyDbUpdatedAt: 'Trivy DB 갱신',
  grype: 'Grype',
  cdxgen: 'cdxgen',
  reach: 'Reach',
  rulesVersion: '규칙 데이터',
  vulnFunctionsVersion: '취약 함수 데이터',
}

/** 검토 이력의 바뀐 까닭 (SCR-03-14) */
export const reachHistoryKindLabel: Record<string, string> = {
  HUMAN: '사람',
  CARRIED: '이어받음',
  RESET: '되돌림',
}

// ---- CI 검사 (SCR-05-10) ----

export const reachCiPolicyLabel: Record<string, string> = {
  REPORT_ONLY: '리포트 전용',
  GATE: '게이트',
}

export const reachGateResultLabel: Record<string, string> = {
  PASS: '통과',
  WARN: '경고',
  FAIL: '실패',
}

/** 게이트 조건 (API 명세 6-2) */
export const reachGateConditionLabel: Record<string, string> = {
  REACHABLE_CRITICAL_HIGH: '도달 가능 · CRITICAL·HIGH',
  REACHABLE_OTHER: '도달 가능 · 그 밖의 심각도',
  UNKNOWN_ANY: '미확인',
  NOT_ANALYZED_CRITICAL_HIGH: '분석 대상 아님 · CRITICAL·HIGH',
}
