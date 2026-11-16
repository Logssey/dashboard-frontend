import { ApiError } from '@/api/client'
import type {
  AwsMetadataKind,
  AwsScanTarget,
  CreateSecretConnectionRequest,
  GitHubAppCredential,
  GitHubScanTarget
} from '@/api/secretConnections'

interface CreateRequestIdentity {
  digest: string
  key: string
}

export async function connectionCreateRequestKey(
  reference: { current: CreateRequestIdentity },
  request: Omit<CreateSecretConnectionRequest, 'idempotencyKey'>
): Promise<string> {
  const credential = request.githubCredential
  const canonical = JSON.stringify({
    provider: request.provider,
    displayName: request.displayName.trim(),
    githubCredential: credential
      ? {
          appId: credential.appId,
          installationId: credential.installationId,
          privateKey: credential.privateKey.trim()
        }
      : null
  })
  const bytes = new TextEncoder().encode(canonical)
  let digest: string
  try {
    const hashed = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    digest = Array.from(hashed, (value) =>
      value.toString(16).padStart(2, '0')
    ).join('')
  } finally {
    bytes.fill(0)
  }
  if (reference.current.digest !== digest || !reference.current.key) {
    reference.current = { digest, key: crypto.randomUUID() }
  }
  return reference.current.key
}

export const awsMetadataLabels: Record<AwsMetadataKind, string> = {
  IAM_ACCESS_KEY_METADATA: 'IAM 액세스 키',
  AWS_S3_BUCKET_METADATA: 'S3 버킷',
  AWS_SECRETS_MANAGER_METADATA: 'Secrets Manager',
  AWS_SSM_PARAMETER_METADATA: 'SSM Parameter Store'
}

export function parseGitHubAppId(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export function githubCredentialError(
  appId: string,
  installationId: string,
  privateKey: string
): string | null {
  if (parseGitHubAppId(appId) == null) return 'App ID를 양의 정수로 입력하세요.'
  if (parseGitHubAppId(installationId) == null)
    return 'Installation ID를 양의 정수로 입력하세요.'
  const pem = privateKey.trim()
  if (
    !/^-----BEGIN (RSA )?PRIVATE KEY-----\r?\n[\s\S]+\r?\n-----END \1PRIVATE KEY-----$/.test(
      pem
    )
  )
    return 'PEM 개인 키 전체를 입력하세요.'
  if (new TextEncoder().encode(pem).length > 32_768)
    return '개인 키 파일 크기를 확인하세요.'
  return null
}

export function githubCredential(
  appId: string,
  installationId: string,
  privateKey: string
): GitHubAppCredential {
  return {
    appId: parseGitHubAppId(appId)!,
    installationId: parseGitHubAppId(installationId)!,
    privateKey: privateKey.trim()
  }
}

function encodeApprovedRefSegment(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*~]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  )
}

export function githubTargetsError(targets: GitHubScanTarget[]): string | null {
  if (targets.length > 100)
    return '검사 대상은 한 연결에 최대 100개까지 등록할 수 있어요.'
  const repositoryPaths = new Map<string, string[]>()
  for (const target of targets) {
    if (
      !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/.test(
        target.repository
      ) ||
      ['.', '..'].includes(target.repository.split('/')[1])
    )
      return '저장소를 선택하세요.'
    if (
      !target.branch ||
      target.branch.length > 200 ||
      /^[\/]|\/$|\.\.|\/\/|@\{|[\x00-\x20\x7f\\?#*\[\]~^:]/.test(target.branch)
    )
      return '브랜치를 선택하세요.'
    const path = target.path.trim()
    const canonicalPath = path && !path.endsWith('/') ? `${path}/` : path
    if (
      canonicalPath.length > 250 ||
      /^[\/\\]/.test(path) ||
      /[\\\x00-\x1f\x7f?#%*:]/.test(target.path) ||
      path
        .replace(/\/$/, '')
        .split('/')
        .some((part) => path && (!part.trim() || part === '.' || part === '..'))
    )
      return '폴더는 250자 이내의 저장소 상대 경로로 입력하세요.'
    let approvedRef: string
    try {
      const branch = encodeApprovedRefSegment(target.branch)
      const encodedPath = canonicalPath
        .split('/')
        .map(encodeApprovedRefSegment)
        .join('/')
      approvedRef = `github://${target.repository}/${branch}/${encodedPath}`
    } catch {
      return '브랜치·폴더 경로의 문자를 확인하세요.'
    }
    if (approvedRef.length > 500)
      return '저장소·브랜치·폴더 경로가 너무 길어요.'
    const repository = target.repository.toLowerCase()
    const paths = repositoryPaths.get(repository) ?? []
    if (
      paths.some(
        (existing) =>
          existing.startsWith(canonicalPath) ||
          canonicalPath.startsWith(existing)
      )
    )
      return '같은 저장소의 겹치는 경로는 연결을 나눠 등록하세요.'
    repositoryPaths.set(repository, [...paths, canonicalPath])
  }
  return null
}

export function awsTargetOptions(
  kinds: AwsMetadataKind[],
  regions: string[],
  current: AwsScanTarget[] = []
): AwsScanTarget[] {
  const options = kinds.flatMap((kind) => {
    const global =
      kind === 'IAM_ACCESS_KEY_METADATA' || kind === 'AWS_S3_BUCKET_METADATA'
    return (
      global ? ['global'] : regions.filter((region) => region !== 'global')
    ).map((region) => ({ kind, region }))
  })
  return [
    ...new Map(
      [...options, ...current].map((target) => [
        JSON.stringify([target.kind, target.region]),
        target
      ])
    ).values()
  ]
}

export function connectionManagementError(error: unknown): string {
  if (!(error instanceof ApiError))
    return '요청 결과를 확인하지 못했어요. 연결 상태를 확인하고 다시 시도하세요.'
  if (error.code === 'SOURCE_CONNECTION_UNAVAILABLE')
    return '인증 저장소나 연결 서비스에 접근하지 못했어요. 서버 설정과 접근 권한을 확인하세요.'
  if (error.status === 401) return '로그인 후 다시 시도하세요.'
  if (error.status === 403) return '이 연결을 설정할 운영 권한이 없어요.'
  if (error.status === 404)
    return '연결을 찾을 수 없어요. 목록을 새로고침하세요.'
  if (error.status === 409)
    return '연결 설정이 변경되었거나 실행 조건이 달라졌어요. 최신 설정을 다시 조회하세요.'
  if (error.status === 400 || error.status === 422)
    return '입력값과 검사 대상 형식을 확인하세요.'
  if (error.status === 429) return '요청이 많아요. 잠시 후 다시 시도하세요.'
  if (error.status === 503)
    return '인증 저장소나 연결 서비스를 사용할 수 없어요. 서버 설정을 확인하세요.'
  return '설정을 저장하지 못했어요. 잠시 후 다시 시도하세요.'
}
