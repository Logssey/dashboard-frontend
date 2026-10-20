import type { IacHop, IacSeverity } from './types'

/** 공용 배지 색 (Badge tone) */
export const severityTone: Record<IacSeverity, string> = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: '',
}

export const severityLabel: Record<IacSeverity, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
}

const kindLabel: Record<string, string> = {
  Internet: '인터넷',
  AWSCloudFrontDistribution: 'CloudFront',
  AWSLoadBalancerV2: '로드밸런서',
  AWSEC2Instance: 'EC2',
  KubernetesNode: '노드',
  KubernetesPod: '파드',
  AWSRole: '역할',
  AWSUser: '사용자',
  AWSSecretsManagerSecret: '시크릿',
  AWSS3Bucket: 'S3 버킷',
  AWSRDSInstance: 'RDS',
}

/** 경로 단계 표시: 종류 + 이름 (인터넷·CloudFront 는 종류만) */
export function hopLabel(hop: IacHop): { kind: string; name: string | null } {
  const kind = kindLabel[hop.kind] ?? hop.kind
  if (hop.kind === 'Internet' || hop.kind === 'AWSCloudFrontDistribution') return { kind, name: null }
  return { kind, name: hop.name }
}

export const tierLabel = (tier: number) => `${tier}등급`

export function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
