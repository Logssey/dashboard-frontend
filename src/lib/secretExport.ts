import type { InventoryFilter } from '@/api/secrets'

export type SecretExportFormat = 'csv' | 'sarif' | 'logssey-json' | 'gitleaks'
export type ServerExportFormat = Exclude<SecretExportFormat, 'csv'>

export const SARIF_GITHUB_NOTICE = 'GitHub 코드 스캐닝은 저장소 하나 단위로 올라가요. 여러 저장소나 노션 위치가 섞이면 일부만 보일 수 있어요.'

export const secretExportOptions: ReadonlyArray<{ format: SecretExportFormat; label: string; description: string }> = [
  { format: 'csv', label: '마스킹 CSV', description: '키 단위 요약. 위치 좌표는 넣지 않아요.' },
  { format: 'sarif', label: 'SARIF 2.1.0', description: `GitHub 코드 스캐닝·DefectDojo용. ${SARIF_GITHUB_NOTICE}` },
  { format: 'logssey-json', label: 'Logssey JSON', description: '위치별 전체 필드. 필드 설명 문서를 함께 제공해요.' },
  { format: 'gitleaks', label: 'Gitleaks 호환 JSON', description: 'DefectDojo의 Gitleaks 가져오기용.' },
]

const FILTER_KEYS = ['issuer', 'componentState', 'origin', 'source', 'provider', 'environment', 'contentKind', 'workBucket', 'validity', 'severity', 'snapshotId', 'runId', 'q'] as const

/** 키 목록과 같은 필터·조회 기준(snapshotId)으로 내보내기 주소를 만든다. q는 호출하는 쪽에서 안전하게 정리해 넘긴다. */
export function secretExportPath(format: ServerExportFormat, filters: InventoryFilter): string {
  const params = new URLSearchParams({ format })
  for (const key of FILTER_KEYS) {
    const value = filters[key]
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  return `/api/v1/secrets/exports?${params}`
}

const SERVER_FILENAME = /^logssey-secrets-(sarif|logssey-json|gitleaks)-\d{4}-\d{2}-\d{2}\.(sarif|json)$/

/** 서버가 준 파일 이름이 약속한 모양일 때만 쓰고, 아니면 같은 규칙으로 직접 만든다. */
export function secretExportFilename(format: SecretExportFormat, contentDisposition: string | null, now = new Date()): string {
  const date = now.toISOString().slice(0, 10)
  if (format === 'csv') return `logssey-secrets-masked-${date}.csv`
  const supplied = contentDisposition?.match(/filename="([^"]+)"/)?.[1]
  if (supplied && SERVER_FILENAME.test(supplied) && supplied.startsWith(`logssey-secrets-${format}-`)) return supplied
  return `logssey-secrets-${format}-${date}.${format === 'sarif' ? 'sarif' : 'json'}`
}

export function secretExportErrorMessage(error: unknown): string {
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status: unknown }).status) : null
  if ((error instanceof Error && error.message === 'SECRET_EXPORT_TOO_LARGE') || status === 413) return '한 번에 10,000개까지 내보낼 수 있어요. 조건을 좁혀 주세요.'
  if (status === 404 || status === 409) return '조회 기준이 만료되거나 권한이 바뀌었어요. 새로고침 후 다시 내보내 주세요.'
  if (status === 403) return '내보내기 권한이 없어요.'
  return '파일을 완성하지 못했어요. 목록을 새로고침한 뒤 다시 시도해 주세요.'
}
