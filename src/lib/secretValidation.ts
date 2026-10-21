import type { SecretValidation } from '../api/secretValidation'

export const validationReasonLabels: Record<string, string> = {
  AUTHENTICATED: '공급자 인증 확인', AUTHENTICATION_REJECTED: '인증이 거절됨 · 만료·폐기 원인은 확인되지 않음',
  DISABLED: '검증 설정이 꺼져 있어요.', PROFILE_DISABLED: '서버 검증 기능이 꺼져 있어요.', GLOBAL_DISABLED: '서버 검증 기능이 꺼져 있어요.',
  UNSUPPORTED_TYPE: '이 유형의 인증 확인은 지원하지 않아요.', UNSUPPORTED: '이 유형의 인증 확인은 지원하지 않아요.',
  SYNTHETIC_FIXTURE: '합성 시험 키로 확인되어 공급자 호출을 생략했어요.', METADATA_ONLY: '존재 정보만 있어 인증을 확인하지 않아요.',
  INCOMPLETE_CREDENTIAL: '인증에 필요한 키 구성요소가 부족해요.', INCOMPLETE_PAIR: '같은 구성임이 확인된 키 쌍이 필요해요.', MISSING_SESSION_TOKEN: '임시 키의 세션 토큰이 필요해요.',
  NO_VERIFICATION_ATTEMPT: '아직 인증을 확인하지 않았어요.', NOT_APPROVED: '이 범위의 인증 확인 허용이 필요해요.',
  SOURCE_VALUE_UNAVAILABLE: '승인 원천에서 원문을 다시 얻을 경로가 없어요.', SOURCE_UNAVAILABLE: '승인 원천에서 값을 다시 읽지 못했어요.',
  CREDENTIAL_MISMATCH: '현재 원천의 키가 요청한 키와 달라 호출하지 않았어요.',
  RATE_LIMITED: '공급자 호출 제한으로 다시 확인해야 해요.', RATE_BUDGET_EXHAUSTED: '호출 예산이 소진되어 다음 확인을 기다려요.',
  PROVIDER_UNAVAILABLE: '공급자 연결 문제로 확인하지 못했어요.', ACCESS_AMBIGUOUS: '접근 제한으로 인증 여부를 확정하지 못했어요.',
  RESPONSE_UNEXPECTED: '예상한 인증 응답을 받지 못했어요.', CLIENT_FAILURE: '검증 요청 구성 문제로 확인하지 못했어요.',
  INVALID_ACCESS_KEY: '공급자가 접근키 인증을 거절했어요.', EXPIRED_SESSION: '공급자가 세션 만료를 확인했어요.', SIGNATURE_AMBIGUOUS: '서명 또는 실행 환경을 확인해야 해요.',
  ACTIVE_JOB_EXISTS: '다른 확인 작업이 진행 중이에요.', APPROVAL_CHANGED: '검증 허용이 바뀌어 현재 근거로 사용할 수 없어요.',
  POST_ACTION_VALIDATION_REQUIRED: '조치 이후 인증을 다시 확인해야 해요.', FORBIDDEN: '이 작업을 수행할 권한이 없어요.',
}
export const validationReason = (code?: string | null) => code ? validationReasonLabels[code] ?? '확인 조건을 충족하지 못했어요. 담당자에게 사유 코드를 알려 주세요.' : '아직 인증을 확인하지 않았어요.'
export const activeRequest = (status?: string | null) => status === 'PENDING' || status === 'LEASED' || status === 'RUNNING'
export const requestStatusLabel = (status: string) => ({ PENDING: '확인 대기', LEASED: '확인 중', RUNNING: '확인 중', SUCCEEDED: '요청 처리 완료', FAILED: '요청 실패', CANCELLED: '요청 취소', SKIPPED: '확인 생략' } as Record<string, string>)[status] ?? '진행 상태 확인 필요'
export function validationPresentation(data: SecretValidation): { title: string; description: string } {
  const reason = data.latestAttempt?.reasonCode ?? data.capabilities.blockedReasonCodes[0] ?? data.support.reasonCode ?? data.support.reasonCodes?.[0]
  if (activeRequest(data.latestRequest?.status)) return { title: requestStatusLabel(data.latestRequest!.status), description: '접수된 요청의 진행 상황이에요. 아직 새 인증 결과가 아니에요.' }
  if (data.postActionValidationPending || data.freshness.status === 'POST_ACTION_REQUIRED') return { title: '조치 후 미검증', description: '조치 이전 결과와 현재 재확인 대기를 구분하세요.' }
  if (data.freshness.status === 'STALE') return { title: '다시 확인 필요', description: '이전 결과의 확인 기한이 지났어요. 당시 결과는 이력에서 확인할 수 있어요.' }
  if (reason === 'SYNTHETIC_FIXTURE') return { title: '검증 생략', description: validationReason(reason) }
  if (data.support.status === 'UNSUPPORTED' || reason === 'UNSUPPORTED_TYPE') return { title: '검증 미지원', description: validationReason('UNSUPPORTED_TYPE') }
  if (['DISABLED', 'PROFILE_DISABLED', 'GLOBAL_DISABLED'].includes(reason ?? '')) return { title: '검증 꺼짐', description: validationReason(reason) }
  if (['INCOMPLETE_CREDENTIAL', 'INCOMPLETE_PAIR', 'MISSING_SESSION_TOKEN'].includes(reason ?? '')) return { title: '구성 부족', description: validationReason(reason) }
  const result = data.latestAttempt?.result
  return { title: result === 'VALID' ? '유효' : result === 'INVALID' ? '사용 불가' : result === 'UNKNOWN' ? '확인 불가' : '미검증', description: validationReason(reason) }
}
