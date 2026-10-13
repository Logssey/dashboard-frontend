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
}

/** 키 종류 표시 이름. 목록에 없는 종류는 받은 값 그대로 보여준다 */
const credentialTypeNames: Record<string, string> = {
  NOTION_PAT: 'Notion PAT',
  NOTION_INTERNAL_CONNECTION_TOKEN: 'Notion 내부 연결 토큰',
  AWS_ACCESS_KEY: 'AWS Access Key',
  GITHUB_FINE_GRAINED_PAT: 'GitHub Fine-grained PAT',
  NOTION_TOKEN: 'Notion 토큰',
}

export function credentialTypeLabel(type: string): string {
  return credentialTypeNames[type] ?? type
}

/** 키 구성요소 상태 (Secret 기준 문서의 component_state) */
export const componentStateLabel: Record<SecretComponentState, string> = {
  CONFIRMED: '키 전체 노출',
  CANDIDATE: '일부만 노출 (후보)',
}

export function secretValidationLabel(status: string): string {
  switch (status) {
    case 'VALID': return '유효'
    case 'INVALID': return '무효'
    case 'UNKNOWN': return '확인 불가'
    case 'UNCHECKED':
    case 'UNVERIFIED': return '미검증'
    default: return '미확인'
  }
}

/** 환경. 모르면 미확인 (운영으로 가정하지 않음) */
export const secretEnvironmentLabel: Record<'PROD' | 'DEV' | 'UNKNOWN', string> = {
  PROD: '운영',
  DEV: '개발',
  UNKNOWN: '미확인',
}
