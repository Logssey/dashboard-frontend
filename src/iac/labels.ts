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

/** 조치 안내 문구 (백엔드 templateKey 기준). 값·비밀은 넣지 않고 고칠 위치만 적는다 */
export const remediationTemplate: Record<string, { title: string; how: string }> = {
  imdsv2_required: {
    title: 'EC2 메타데이터를 IMDSv2 로만 받기',
    how: 'compute 모듈의 변수 imds_tokens 를 "required" 로 바꾸면 인스턴스에서 역할 자격 증명을 꺼내는 관계가 끊겨요.',
  },
  secrets_read_scope: {
    title: '역할의 시크릿 읽기 범위 좁히기',
    how: 'secretsmanager:GetSecretValue 의 Resource 를 "*" 대신 이 역할이 실제로 쓰는 시크릿 ARN 으로 제한하세요.',
  },
  tfstate_bucket_policy: {
    title: 'State 버킷 읽기 주체 줄이기',
    how: 'tfstate 버킷 정책에서 plan·apply 역할 외의 s3:GetObject 를 거부하세요.',
  },
}

export function remediationText(templateKey: string) {
  return remediationTemplate[templateKey] ?? { title: templateKey, how: '안내 문구가 아직 없어요. 규칙 명세를 확인하세요.' }
}
