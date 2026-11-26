import type { SecretFilter, SecretItem, SecretListResponse } from '@/api/secrets'

const EXPORT_PAGE_SIZE = 100
const EXPORT_LIMIT = 10_000
type ExportSelection = Omit<SecretFilter, 'page' | 'size'> & { snapshotId: string }

/** 현재 필터의 전체 결과를 가져오되, 목록이 수집 중 바뀌면 불완전한 CSV를 만들지 않는다. */
export async function loadAllSecretItems(
  fetchPage: (filter: SecretFilter) => Promise<SecretListResponse>,
  selection: ExportSelection,
): Promise<SecretItem[]> {
  const items: SecretItem[] = []
  let total: number | null = null
  if (!selection.snapshotId) throw new Error('SECRET_EXPORT_SNAPSHOT_REQUIRED')

  for (let page = 0; page < EXPORT_LIMIT / EXPORT_PAGE_SIZE; page += 1) {
    const response = await fetchPage({ ...selection, page, size: EXPORT_PAGE_SIZE })
    if (!Number.isSafeInteger(response.total) || response.total < 0 ||
      response.page !== page || response.size !== EXPORT_PAGE_SIZE ||
      response.items.length > EXPORT_PAGE_SIZE ||
      response.snapshotId !== selection.snapshotId || response.scope !== 'inventory' || response.unit !== 'CredentialSet' ||
      (total !== null && response.total !== total)) {
      throw new Error('SECRET_EXPORT_CHANGED')
    }
    if (response.total > EXPORT_LIMIT) throw new Error('SECRET_EXPORT_TOO_LARGE')
    total ??= response.total
    items.push(...response.items)
    if (items.length >= total) {
      if (items.length !== total || new Set(items.map((item) => item.id)).size !== total) {
        throw new Error('SECRET_EXPORT_CHANGED')
      }
      return items
    }
    if (response.items.length !== EXPORT_PAGE_SIZE) throw new Error('SECRET_EXPORT_CHANGED')
  }
  throw new Error('SECRET_EXPORT_TOO_LARGE')
}

function csvCell(value: string | number | null): string {
  let text = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ')
  // 스프레드시트는 공백 뒤의 수식 시작 문자도 평가할 수 있다.
  if (/^[\s\uFEFF\u200B-\u200D\u2060]*[=+\-@]/u.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

/** 목록 API의 마스킹 필드만 선택한다. 위치 식별자나 원문은 이 경로로 전달하지 않는다. */
export function buildMaskedSecretsCsv(items: SecretItem[], context?: { asOf: string; origin: string; runId?: number | null }): string {
  const header = [
    '기준 시각', '조회 출처', '단위', '기록 ID', '발급자', '키 유형', '마스킹 표시', '구성 상태', '위험도',
    '검증 상태', '검증 사유 코드', '열람 위치 수', '첫 발견 시각', '마지막 확인 시각', '실행 필터',
  ]
  const rows = items.map((item) => [
    context?.asOf ?? '', context?.origin ?? item.origin ?? '', 'CredentialSet', item.id, item.issuer, item.credentialType, item.maskedLabel,
    item.componentState, item.severity, item.validationStatus,
    item.validationReasonCode, item.occurrenceCount,
    item.firstSeenAt, item.lastSeenAt, context?.runId ? `SCAN-${context.runId}` : '',
  ])
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}
