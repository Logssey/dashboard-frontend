import { validationReasonLabels } from './secretValidation'
// 화면에 보이는 글자는 템플릿 디자인을 따른다 (02 기능 설계 3.5, API 명세 0.6)
import type {
  Domain,
  Environment,
  Provider,
  Severity,
} from '@/api/types'
import type { SecretComponentState, SecretIssuer } from '@/api/secrets'

export const severityLabel: Record<Severity, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
}

/** 배지 색 (템플릿 클래스 이름). Low는 템플릿에 색이 없어 기본 회색 */
export const severityTone: Record<Severity, string> = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: '',
}

export const environmentLabel: Record<Exclude<Environment, 'ALL'>, string> = {
  PROD: '운영',
  DEV: '개발',
}

export const providerLabel: Record<Provider, { name: string; icon: 'cloud' | 'layers' | 'code' }> = {
  AWS: { name: 'AWS', icon: 'cloud' },
  KUBERNETES: { name: 'Kubernetes', icon: 'layers' },
  GITHUB: { name: 'GitHub', icon: 'code' },
}

export const domainLabel: Record<Domain, string> = {
  SECRETS: '시크릿 보안',
  CONFIGURATION: '보안 설정·컴플라이언스',
  IDENTITIES: '신원·권한',
  RUNTIME: '런타임 보안',
  VULNERABILITIES: '취약점 관리',
}

export const COMING_SOON_MESSAGE = '준비 중인 기능이에요.'

// 시크릿 보안 탭 (02 기능 설계 4)
export const issuerLabel: Record<SecretIssuer, string> = {
  AWS: 'AWS',
  GITHUB: 'GitHub',
  NOTION: 'Notion',
  KUBERNETES: 'Kubernetes',
}

/** Unknown provider codes stay out of primary product labels. */
const credentialTypeNames: Record<string, string> = {
  NOTION_PAT: 'Notion PAT',
  NOTION_INTERNAL_CONNECTION_TOKEN: 'Notion 내부 연결 토큰',
  AWS_ACCESS_KEY: 'AWS Access Key',
  GITHUB_FINE_GRAINED_PAT: 'GitHub Fine-grained PAT',
  NOTION_TOKEN: 'Notion 토큰',
  AWS_ACCESS_KEY_PAIR: 'AWS 액세스 키',
  AWS_TEMPORARY_CREDENTIALS: 'AWS 임시 자격 증명',
  GITHUB_CLASSIC_PAT: 'GitHub PAT',
  NOTION_CONNECTION_TOKEN: 'Notion 연결 토큰',
  AWS_IAM_ACCESS_KEY: 'AWS IAM 접근키',
}

export function credentialTypeLabel(type: string): string {
  return credentialTypeNames[type] ?? '유형 확인 필요'
}

/** 키 구성요소 상태 (Secret 기준 문서의 component_state) */
export const componentStateLabel: Record<SecretComponentState, string> = {
  CONFIRMED: '구성 확인',
  CANDIDATE: '일부 구성',
  METADATA_ONLY: '메타데이터',
}

export function secretValidationLabel(status: string): string {
  switch (status) {
    case 'VALID': return '유효'
    case 'INVALID': return '사용 불가'
    case 'UNKNOWN': return '확인 불가'
    case 'UNCHECKED':
    case 'UNVERIFIED': return '미검증'
    default: return '미확인'
  }
}

const validationReasons: Record<string, string> = {
  AUTHENTICATED: '공급자 인증 확인',
  INVALID_ACCESS_KEY: 'AWS가 키 ID를 인정하지 않음',
  SIGNATURE_AMBIGUOUS: '서명 오류의 원인 확인 필요',
  EXPIRED_SESSION: '임시 세션 만료',
  DISABLED: '검증 기능이 꺼져 있음',
  INCOMPLETE_PAIR: '키 구성 요소가 부족함',
  MISSING_SESSION_TOKEN: '임시 키의 세션 토큰이 없음',
  ACCESS_AMBIGUOUS: '접근 오류의 원인 확인 필요',
  RATE_LIMITED: '공급자 호출 제한',
  PROVIDER_UNAVAILABLE: '공급자 응답 확인 불가',
  CLIENT_FAILURE: '검증 연결 오류',
  SYNTHETIC_FIXTURE: '표본 분류로 검증 생략',
  POST_ACTION_VALIDATION_REQUIRED: '조치 이후 미검증',
  UNSPECIFIED_REASON: '사유 확인 필요',
  NO_VERIFICATION_ATTEMPT: '아직 인증을 확인하지 않음',
}

export function secretValidationReasonLabel(reason: string): string {
  return validationReasons[reason] ?? validationReasonLabels[reason] ?? '인증 확인 조건을 확인해 주세요'
}

/** 환경. 모르면 미확인 (운영으로 가정하지 않음) */
export const secretEnvironmentLabel: Record<'PROD' | 'DEV' | 'UNKNOWN', string> = {
  PROD: '운영',
  DEV: '개발',
  UNKNOWN: '미확인',
}
