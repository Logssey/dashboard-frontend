/** Safe internal references only: never accept a secret, URL, source path or free-form note. */
export function validEvidenceRef(value: string): boolean {
  return /^(TICKET|CHANGE|POLICY):[A-Z][A-Z0-9]{0,15}-[1-9][0-9]{0,12}$/.test(value)
}
export function safeMutationMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return '요청을 완료하지 못했어요.'
  const status = 'status' in error ? error.status : null
  if (status === 403) return '이 작업을 수행할 권한이 없어요.'
  if (status === 404) return '대상을 찾을 수 없거나 더 이상 접근할 수 없어요.'
  if (status === 409) return '근거 또는 버전이 바뀌었어요. 최신 정보를 다시 확인해 주세요.'
  if (status === 422 || status === 400) return '필수 근거와 입력 조건을 확인해 주세요.'
  return '요청 결과를 확인하지 못했어요. 같은 요청으로 다시 확인할 수 있어요.'
}
export function idempotencyFor(ref: { current: { payload: string; key: string } }, payload: unknown): string {
  const serialized = JSON.stringify(payload)
  if (ref.current.payload !== serialized || !ref.current.key) ref.current = { payload: serialized, key: crypto.randomUUID() }
  return ref.current.key
}
export function futureEvidenceDeadline(value: string | null, now = Date.now()): boolean {
  if (!value) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp > now && timestamp <= now + 90 * 24 * 60 * 60 * 1000
}
export const missingEvidenceLabel = (code: string | undefined) => ({ OWNER_UNKNOWN: '소유자 확인', POLICY_UNKNOWN: '보관 정책 확인', SOURCE_PERMISSION: '원천 접근 복구', VALIDATION_UNSUPPORTED: '검증 방법 확인', FIXTURE_UNCONFIRMED: '테스트용 키 확인', EVIDENCE_INCOMPLETE: '근거 보완' } as Record<string, string>)[code ?? ''] ?? '추가 근거 확인'
export const assignmentReasonLabel = (code: string) => ({ INITIAL_ASSIGNMENT: '최초 지정', OWNERSHIP_CHANGE: '담당자 변경', DUE_DATE_CHANGE: '확인 기한 변경', UNASSIGNED: '담당 미정으로 변경' } as Record<string, string>)[code] ?? '사유 확인 필요'
export const evidenceKindLabel = (code: string) => ({ OWNER_CONFIRMATION: '소유자 확인 근거', POLICY_REFERENCE: '정책 근거', SOURCE_ACCESS_RESTORED: '원천 접근 복구 근거', PROVIDER_REFERENCE: '발급자 근거', FIXTURE_REFERENCE: '테스트용 키 근거' } as Record<string, string>)[code] ?? '기타 근거'
