// 화면에 보이는 글자는 템플릿 디자인을 따른다 (02 기능 설계 3.5, API 명세 0.6)
import type { Domain, Environment, Provider, Severity } from '@/api/types'

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
