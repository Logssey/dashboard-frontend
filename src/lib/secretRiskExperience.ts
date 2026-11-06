import type { RiskExperience } from '../api/secretRisk'
import { riskReason, riskRuleLabels } from './secretRisk'

const actionLabels: Record<string, string> = {
  REVIEW_STORAGE_POLICY: '보관·공유 기준 확인', REVIEW_ACCESS: '접근 범위 근거 보완', COMPLETE_CREDENTIAL: '키 구성 확인',
  REVIEW_PERMISSIONS: '권한·자산 근거 확인', REVIEW_INCIDENT_EVIDENCE: '사고 근거 검토', REQUEST_VALIDATION: '현재 인증 확인',
  REFRESH_EVIDENCE: '현재 근거 다시 확인', INVESTIGATE_CONFLICT: '충돌 자료 검토', REQUEST_ASSESSMENT: '현재 근거로 평가',
}
export const riskActionLabel = (code: string) => Object.hasOwn(actionLabels, code) ? actionLabels[code] : null
const criterionStatuses: Record<string, string> = { CONFIRMED: '근거 확인', CANDIDATE: '후보 · 확인 필요', UNKNOWN: '미확인', STALE: '이전 근거 · 재확인', CONFLICT: '근거 충돌' }
const priorities: Record<string, string> = { IMMEDIATE: '즉시 대응', PRIORITY: '우선 확인', GENERAL: '일반 처리', PLANNED: '계획 처리', INVENTORY: '관리 기록' }
export const criterionStatusLabel = (status: string) => Object.hasOwn(criterionStatuses, status) ? criterionStatuses[status] : '상태 확인 필요'
export const priorityLabel = (level: string) => Object.hasOwn(priorities, level) ? priorities[level] : '우선순위 확인 필요'
const priorityReasons: Record<string, string> = {
  CONFIRMED_INCIDENT: '확인된 사고 근거', UNRESOLVED_CRITICAL: '미해결 치명적 노출', UNRESOLVED_HIGH: '미해결 높은 심각도',
  PUBLIC_VALID_CREDENTIAL: '공개 원문과 인증 성공 확인', PUBLIC_PRIVILEGED_CANDIDATE: '공개 위치의 높은 권한 후보',
  MEDIUM_SEVERITY: '보통 심각도', LOW_SEVERITY: '낮은 심각도', EVIDENCE_REQUIRED: '평가 근거 보완 필요',
  AUTHORIZED_STORAGE: '보관 허용', METADATA_ONLY: '키 존재 정보',
  PUBLIC_CREDENTIAL_REQUIRES_INVESTIGATION: '원천 공개 관측과 인증·권한 자료를 함께 확인해야 해요.',
  NO_OPEN_EXPOSURE_ACTION: '현재 미해결 노출 조치 없음', LOW_EXPOSURE: '낮은 노출 심각도',
  EVIDENCE_REQUIRES_REVIEW: '평가 근거 보완 필요', MEDIUM_EXPOSURE: '보통 노출 심각도',
}
export const priorityReason = (code: string) => Object.hasOwn(priorityReasons, code) ? priorityReasons[code] : null
export function experienceReason(experience: RiskExperience): string {
  if (experience.summary.status === 'STALE') return '이전 평가의 근거가 현재 기준과 달라요. 현재 확인 가능한 사실부터 다시 검토하세요.'
  const rule = experience.summary.reasonCode.replace(/^RULE_/, '')
  return Object.hasOwn(riskRuleLabels, rule) ? riskRuleLabels[rule] : riskReason(experience.summary.reasonCode)
}
const supportReasons: Record<string, string> = {
  GITHUB_CROSS_SOURCE_UNSUPPORTED: 'GitHub 외 원천에서 발견한 PAT의 자동 권한 보조는 지원하지 않아요. 현재 인증 확인과 수동 자료 보완을 이용하세요.',
  CROSS_SOURCE_PERMISSION_UNSUPPORTED: '다른 플랫폼에서 발견한 GitHub PAT의 자동 권한 보조는 지원하지 않아요.',
  NOTION_PERMISSION_UNSUPPORTED: 'Notion 토큰의 전체 권한·공유 페이지 자동 조회는 지원하지 않아요. 확인한 관리 자료를 보완하세요.',
}
export function permissionSupportReason(experience: RiskExperience): string | null {
  const support = experience.support.permissionAssistance
  if (support.status !== 'UNSUPPORTED') return null
  return support.reasonCodes.map((code) => Object.hasOwn(supportReasons, code) ? supportReasons[code] : null).find(Boolean)
    ?? '이 키·발견 원천 조합의 자동 권한 보조는 지원하지 않아요. 현재 인증 확인과 수동 근거 보완은 구분해 이용하세요.'
}
