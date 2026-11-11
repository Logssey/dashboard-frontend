import type { ScanProgressEvent, ScanProgressStage, ScanProgressStageKey } from '../api/secretScanProgress'

export const scanProgressStages: Record<ScanProgressStageKey, { title: string; description: string }> = {
  QUEUE: { title: '요청·작업 대기', description: '워커가 요청을 가져와 검사를 시작해요.' },
  COLLECTION: { title: '원천 수집', description: '허용된 파일·페이지·리소스를 읽어요.' },
  DETECTION: { title: '탐지·정규화', description: '키 후보를 찾고 같은 키와 발견 위치를 정리해요.' },
  VALIDATION: { title: '유효성 확인', description: '지원되는 키의 현재 인증 응답을 확인해요.' },
  RESULT: { title: '결과 정리', description: '검사 범위와 발견 결과를 기록해요.' },
}

export const scanProgressStates: Record<ScanProgressStage['status'], string> = {
  PENDING: '대기', RUNNING: '진행 중', SUCCEEDED: '완료', PARTIAL: '일부 실패',
  FAILED: '실패', SKIPPED: '생략', CANCELLED: '취소', UNKNOWN: '기록 확인 필요',
}

const operations: Record<string, string> = {
  RUN_REGISTERED: '검사 요청 등록', WORKER_CLAIM: '워커 작업 시작',
  RUN_RETRY: '재시도 예약', RUN_FINISHED: '검사 종료', STAGE_SUMMARY: '단계 결과 기록',
  SCOPE_COLLECTION: '승인된 검사 대상 읽기',
  GITHUB_REPOSITORY_GET: 'GitHub API · 저장소 조회', GITHUB_REF_GET: 'GitHub API · 브랜치 조회',
  GITHUB_COMMIT_GET: 'GitHub API · 커밋 조회', GITHUB_TREE_GET: 'GitHub API · 파일 목록 조회',
  GITHUB_BLOB_GET: 'GitHub API · 파일 내용 읽기', GITHUB_TOKEN_EXCHANGE: 'GitHub App · 수집 인증',
  NOTION_PAGE_GET: 'Notion API · 승인 페이지 조회', NOTION_BLOCK_CHILDREN_LIST: 'Notion API · 블록 내용 읽기',
  AWS_GET_CALLER_IDENTITY: 'AWS SDK · STS GetCallerIdentity', AWS_LIST_USERS: 'AWS SDK · IAM ListUsers',
  AWS_LIST_ACCESS_KEYS: 'AWS SDK · IAM ListAccessKeys', AWS_GET_ACCESS_KEY_LAST_USED: 'AWS SDK · IAM GetAccessKeyLastUsed',
  AWS_GET_ACCOUNT_SUMMARY: 'AWS SDK · IAM GetAccountSummary', AWS_LIST_SECRETS: 'AWS SDK · SecretsManager ListSecrets',
  AWS_DESCRIBE_PARAMETERS: 'AWS SDK · SSM DescribeParameters', AWS_LIST_BUCKETS: 'AWS SDK · S3 ListBuckets',
  AWS_GET_SECRET_VALUE: 'AWS SDK · SecretsManager GetSecretValue', AWS_GET_PARAMETER: 'AWS SDK · SSM GetParameter',
  AWS_HEAD_OBJECT: 'AWS SDK · S3 HeadObject', AWS_GET_OBJECT: 'AWS SDK · S3 GetObject',
  GITLEAKS_SCAN: 'Gitleaks · stdin 탐지 실행', CANDIDATE_NORMALIZATION: '키 후보 정규화',
  FINDINGS_COMMIT: '탐지 결과 저장',
  AWS_CREDENTIAL_CHECK: 'AWS STS · 발견한 키 인증 확인', GITHUB_CREDENTIAL_CHECK: 'GitHub API · 발견한 키 인증 확인',
  NOTION_CREDENTIAL_CHECK: 'Notion API · 발견한 키 인증 확인', CREDENTIAL_CHECK: '발견한 키 인증 확인',
}

const outcomes: Record<ScanProgressEvent['outcome'], string> = {
  STARTED: '시작', COMPLETED: '처리 완료', PARTIAL: '일부 처리', FAILED: '실패',
  SKIPPED: '생략', RETRY_SCHEDULED: '재시도 예정', CANCELLED: '취소',
}

export function scanOperationLabel(code: string): string {
  return operations[code] ?? '검사 처리'
}
const requestFormats: Record<string, string> = {
  GITHUB_REPOSITORY_GET: 'GET /repos/{owner}/{repo}',
  GITHUB_REF_GET: 'GET /repos/{owner}/{repo}/git/ref/heads/{branch}',
  GITHUB_COMMIT_GET: 'GET /repos/{owner}/{repo}/git/commits/{sha}',
  GITHUB_TREE_GET: 'GET /repos/{owner}/{repo}/git/trees/{sha}',
  GITHUB_BLOB_GET: 'GET /repos/{owner}/{repo}/git/blobs/{sha}',
  GITHUB_TOKEN_EXCHANGE: 'POST /app/installations/{installation_id}/access_tokens',
  GITHUB_CREDENTIAL_CHECK: 'GET /user',
  NOTION_PAGE_GET: 'GET /v1/pages/{page_id}',
  NOTION_BLOCK_CHILDREN_LIST: 'GET /v1/blocks/{block_id}/children',
}
export const scanRequestFormat = (code: string): string | null => requestFormats[code] ?? null
export const scanEventOutcome = (value: ScanProgressEvent['outcome']) => outcomes[value] ?? '결과 확인'
export const scanProgressTerminal = (status: string) => ['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED', 'SKIPPED'].includes(status)
export const scanProgressCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

export function scanStageCount(stage: ScanProgressStage): string | null {
  if (!scanProgressCount(stage.processedCount)) return null
  const unit = { SCOPE: '대상', OBJECT: '항목', CANDIDATE: '키 후보', ATTEMPT: '시도' }[stage.unit ?? 'OBJECT']
  return scanProgressCount(stage.totalCount)
    ? `${unit} ${stage.processedCount} / ${stage.totalCount}`
    : `${unit} ${stage.processedCount}개 처리`
}

const clock = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })
export function scanEventTime(value: string): string {
  return Number.isFinite(Date.parse(value)) ? clock.format(new Date(value)) : '시각 미기록'
}

export function mergeScanEvents(current: ScanProgressEvent[], received: ScanProgressEvent[]): ScanProgressEvent[] {
  const result = new Map(current.map((item) => [item.id, item]))
  for (const item of received) if (Number.isSafeInteger(item.id) && item.id > 0) result.set(item.id, item)
  return [...result.values()].sort((left, right) => left.id - right.id)
}
