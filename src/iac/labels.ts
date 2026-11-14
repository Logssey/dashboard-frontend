import type { IacHop, IacPullRequestSummary, IacRunStatus, IacSeverity, IacVerdict } from './types'

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

/** 판정 배지. 색만으로 구분하지 않게 글자를 함께 쓴다 */
export const verdictBadge: Record<IacVerdict, { label: string; tone: string }> = {
  BLOCK: { label: '차단', tone: 'critical' },
  WARN: { label: '경고', tone: 'high' },
  INFO: { label: '정보', tone: 'primary' },
  PASS: { label: '통과', tone: 'success' },
}

const runStatusLabel: Partial<Record<IacRunStatus, string>> = {
  QUEUED: '대기 중',
  PLANNING: 'plan 중',
  ANALYZING: '분석 중',
  ERROR: '오류',
  SUPERSEDED: '새 커밋으로 대체',
}

/** 판정이 아직 없으면 실행 상태를 보여준다 */
export function pullRequestBadge(pr: { status: IacRunStatus; verdict: IacVerdict | null }) {
  if (pr.status === 'GATE_FAILED') return verdictBadge.BLOCK
  if (pr.verdict) return verdictBadge[pr.verdict]
  return { label: runStatusLabel[pr.status] ?? pr.status, tone: pr.status === 'ERROR' ? 'critical' : '' }
}

/**
 * S-01 D 의 한 줄 요약: 경로 변화와 State 읽기 주체.
 * 경로 수는 S-02 패널("사라진 경로 N개")과 같게 세고, 같은 자격 증명으로 묶이면 갈래 수를 덧붙인다
 */
export function pullRequestChanges(pr: IacPullRequestSummary): string[] {
  const parts: string[] = []
  if (pr.status === 'GATE_FAILED') parts.push('② 차단, 경로 계산 안 함')
  if (pr.pathsAdded > 0) parts.push(`경로 +${pr.pathsAdded}`)
  if (pr.pathsRemoved > 0) {
    const routes = pr.removedRoutes > 0 && pr.removedRoutes < pr.pathsRemoved ? ` (${pr.removedRoutes}갈래)` : ''
    parts.push(`경로 −${pr.pathsRemoved}${routes}`)
  }
  if (pr.stateReaderIncrease) parts.push('State 읽기 주체 증가')
  return parts
}

/** 규칙 제목. ② 는 infrastructure policy/rules.json 의 title 과 같게 둔다 (PR 코멘트와 같은 말) */
export const ruleTitle: Record<string, string> = {
  'gate.exec_data_source': 'plan 중 실행되는 data 소스',
  'gate.provisioner': 'local-exec·remote-exec provisioner',
  'gate.lambda_invocation': 'plan 중 Lambda 호출',
  'gate.provider_not_allowed': '허용 목록 밖 프로바이더',
  'gate.provider_unpinned': '프로바이더 버전 미고정',
  'gate.module_unpinned': '모듈 버전 미고정',
  'gate.backend_changed': 'backend 블록 변경',
  'gate.lock_changed': 'lock 파일 변경 (보안 리뷰 필요)',
  'gate.workflow_changed': '워크플로 변경 (보안 리뷰 필요)',
  'gate.lock_mismatch': '프로바이더가 lock 파일과 다름',
  'gate.module_content_changed': '같은 버전인데 모듈 내용이 다름',
  'gate.unscanned_file': '검사하지 않는 Terraform 파일',
  'gate.plan_failed': 'plan 실패 (fail-closed)',
  'path.tier1.added': '1등급 데이터까지 새 경로',
  'path.tier1.reach_only': '1등급에 네트워크로만 도달',
  'path.tier2.added': '2등급 데이터까지 새 경로',
  'path.shortened': '기존 경로가 짧아짐',
  'path.imds_v1_added': 'IMDSv1 인스턴스 추가',
  'path.removed': '경로가 사라짐',
  'state.reader_increase': 'State 읽기 주체 증가',
}

/** S-02 다음 할 일. 규칙별 고정 문구 */
const ruleNext: Record<string, string> = {
  'gate.exec_data_source': 'data "external"·"http"·"dns" 를 지우고 값은 변수나 다른 리소스로 받으세요.',
  'gate.provisioner': 'provisioner 를 지우고 user_data 나 별도 배포 단계로 옮기세요.',
  'gate.lambda_invocation': 'data "aws_lambda_invocation" 을 지우세요. plan 중에는 코드를 실행하지 않아요.',
  'gate.provider_not_allowed': 'hashicorp/aws 프로바이더만 쓸 수 있어요. 꼭 필요하면 허용 목록 변경 PR 을 따로 올리세요.',
  'gate.provider_unpinned': 'required_providers 에 version 을 적으세요.',
  'gate.module_unpinned': 'git 모듈은 ?ref= 로, 레지스트리 모듈은 version 으로 고정하세요.',
  'gate.backend_changed': 'backend 변경은 PR 에서 plan 하지 않아요. 보안 담당자와 따로 진행하세요.',
  'gate.lock_changed': '보안 리뷰어가 프로바이더 버전·해시 변경을 확인해야 해요.',
  'gate.workflow_changed': '보안 리뷰어가 워크플로 변경을 확인해야 해요.',
  'gate.lock_mismatch': 'terraform init -upgrade 로 lock 파일을 다시 만들고 함께 커밋하세요.',
  'gate.module_content_changed': '모듈 출처를 확인하고, 의도한 변경이면 policy/module-hashes.txt 를 갱신하세요.',
  'gate.unscanned_file': '.tf.json 을 .tf 로 바꾸고, 커밋된 .terraform/ 은 지우세요.',
  'gate.plan_failed': 'Actions 로그에서 plan 오류를 확인하고 고친 뒤 다시 push 하세요.',
  'path.tier1.added': '원인 리소스 변경을 되돌리거나, 아래 끊을 지점 중 하나를 같은 PR 에 넣으세요.',
  'path.tier1.reach_only': '네트워크 노출(보안 그룹·로드밸런서)이 의도한 것인지 확인하세요.',
  'path.tier2.added': '원인 리소스의 권한 범위를 좁힐 수 있는지 확인하세요.',
  'path.shortened': '중간 단계를 건너뛰게 된 권한·관계가 의도한 것인지 확인하세요.',
  'path.imds_v1_added': '새 인스턴스에 IMDSv2 를 쓰세요 (변수 imds_tokens = "required").',
  'state.reader_increase': 'tfstate 버킷을 읽을 수 있게 된 역할의 권한을 확인하고, 필요 없으면 거부를 유지하세요.',
}

export function ruleNextStep(ruleId: string): string | null {
  return ruleNext[ruleId] ?? null
}

/** 경로 변화 종류 */
export const pathChangeLabel: Record<string, string> = { ADDED: '새 경로', SHORTENED: '짧아짐', REMOVED: '사라짐' }

/** 원인 리소스 변경 종류 (plan action) */
export const causeActionLabel: Record<string, string> = { CREATE: '추가', UPDATE: '변경', DELETE: '삭제', REPLACE: '교체' }

/** 분석 대상 레포 (MVP 는 하나, iac_repos). 링크는 번호만 받아 만든다 */
export const IAC_REPO = 'Logssey/infrastructure'

export function pullRequestUrl(number: number): string | null {
  if (!Number.isSafeInteger(number) || number <= 0) return null
  return `https://github.com/${IAC_REPO}/pull/${number}`
}

export const shortSha = (sha: string) => sha.slice(0, 7)

/** 드리프트 정도 (rule-spec ③). 노이즈로 분류된 것은 API 가 내려주지 않는다 */
export const driftLevel: Record<string, { label: string; tone: string }> = {
  'drift.high': { label: '드리프트 높음', tone: 'critical' },
  'drift.medium': { label: '드리프트 중간', tone: 'medium' },
  'drift.low': { label: '드리프트 낮음', tone: '' },
}

export const jobLabel: Record<string, string> = {
  COLLECT_GRAPH: '자산 수집',
  ENRICH_GRAPH: '그래프 보강·경로 계산',
  CHECK_STATE: 'State 점검',
  CHECK_DRIFT: '드리프트 점검',
  ANALYZE_RUN: 'PR 분석',
}

export function jobStatusBadge(job: { lastStatus: string | null; pending: number }) {
  if (job.pending > 0) return { label: '실행 대기·중', tone: 'primary' }
  if (job.lastStatus === 'SUCCEEDED') return { label: '성공', tone: 'success' }
  if (job.lastStatus === 'FAILED') return { label: '실패', tone: 'critical' }
  if (job.lastStatus === 'CANCELLED') return { label: '취소', tone: '' }
  return { label: '기록 없음', tone: '' }
}

/** 규칙 원본 (변경은 PR 로만) */
export const IAC_POLICY_URL = `https://github.com/${IAC_REPO}/tree/main/policy`
