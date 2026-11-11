import type { SecretValidation, ValidationRequest, ValidationIssuer, ConnectionValidationPolicy } from '../api/secretValidation'
import { ApiError } from '../api/client'

export const validationIssuerLabels: Record<ValidationIssuer, string> = {
  GITHUB: 'GitHub PAT', AWS: 'AWS 접근키', NOTION: 'Notion 연결 토큰',
}
export function connectionValidationNextAction(policy: ConnectionValidationPolicy): string {
  if (!policy.enabled) return '연결의 외부 인증 확인이 꺼져 있어요.'
  if (policy.profileStatus === 'UNCONFIGURED') return '연결의 검증 설정을 다시 확인하세요.'
  if (policy.profileStatus !== 'ENABLED' || !policy.allowedIssuers.some((issuer) => policy.enabledIssuers.includes(issuer)))
    return '선택한 키 발급 서비스의 서버 검증 기능을 켜야 인증을 확인할 수 있어요.'
  if (policy.approvedScopeCount === 0) return '검사 대상에서 인증 확인을 허용한 뒤 키 상세에서 요청하세요.'
  return '키 상세에서 확인 조건을 보고 ‘유효성 확인’을 요청하세요.'
}

export const validationReasonLabels: Record<string, string> = {
  AUTHENTICATED: '공급자 인증 확인', AUTHENTICATION_REJECTED: '인증이 거절됨 · 만료·폐기 원인은 확인되지 않음',
  DISABLED: '검증 설정이 꺼져 있어요.', PROFILE_DISABLED: '서버 검증 기능이 꺼져 있어요.', GLOBAL_DISABLED: '서버 검증 기능이 꺼져 있어요.',
  UNSUPPORTED_TYPE: '이 유형의 인증 확인은 지원하지 않아요.', UNSUPPORTED: '이 유형의 인증 확인은 지원하지 않아요.',
  SYNTHETIC_FIXTURE: '합성 표본 키로 확인되어 공급자 호출을 생략했어요.', METADATA_ONLY: '존재 정보만 있어 인증을 확인하지 않아요.',
  SOURCE_GUARD_BLOCKED: '당시 적용된 원천 보호 설정으로 인증 확인을 생략했어요. 합성 여부는 별도 근거로 확인해요.',
  VALIDATOR_NOT_ALLOWED: '이 연결에서 해당 키 발급 서비스의 검증을 허용하세요.',
  INCOMPLETE_CREDENTIAL: '인증에 필요한 키 구성요소가 부족해요.', INCOMPLETE_PAIR: '같은 구성임이 확인된 키 쌍이 필요해요.', MISSING_SESSION_TOKEN: '임시 키의 세션 토큰이 필요해요.',
  NO_VERIFICATION_ATTEMPT: '아직 인증을 확인하지 않았어요.', NOT_APPROVED: '이 범위의 인증 확인 허용이 필요해요.',
  SOURCE_VALUE_UNAVAILABLE: '승인 원천에서 원문을 다시 얻을 경로가 없어요.', SOURCE_UNAVAILABLE: '승인 원천에서 값을 다시 읽지 못했어요.',
  CREDENTIAL_MISMATCH: '현재 원천의 키가 요청한 키와 달라 호출하지 않았어요.',
  RATE_LIMITED: '공급자 호출 제한으로 다시 확인해야 해요.', RATE_BUDGET_EXHAUSTED: '호출 예산이 소진되어 다음 확인을 기다려요.',
  PROVIDER_UNAVAILABLE: '공급자 연결 문제로 확인하지 못했어요.', ACCESS_AMBIGUOUS: '접근 제한으로 인증 여부를 확정하지 못했어요.', ACCESS_LIMITED: '공급자 접근 제한으로 인증 여부를 확인하지 못했어요. 접근 정책과 허용 범위를 확인하세요.',
  RESPONSE_UNEXPECTED: '예상한 인증 응답을 받지 못했어요.', UNEXPECTED_RESPONSE: '공급자의 응답 형식이 예상과 달라 인증 여부를 확인하지 못했어요.', CLIENT_FAILURE: '공급자와 통신하지 못했어요. 네트워크 상태를 확인한 뒤 다시 시도하세요.',
  VALIDATOR_TEMPORARY: '일시적인 인증 확인 오류가 발생했어요.',
  VALIDATION_DEADLINE_EXCEEDED: '검증 실행 기한 안에 재시도할 수 없어 자동 재시도를 종료했어요. 공급자 대기 시간이 지난 뒤 다시 확인하세요.',
  INVALID_ACCESS_KEY: '공급자가 접근키 인증을 거절했어요.', EXPIRED_SESSION: '공급자가 세션 만료를 확인했어요.', SIGNATURE_AMBIGUOUS: '서명 또는 실행 환경을 확인해야 해요.',
  ACTIVE_JOB_EXISTS: '다른 확인 작업이 진행 중이에요.', APPROVAL_CHANGED: '검증 허용이 바뀌어 현재 근거로 사용할 수 없어요.',
  POST_ACTION_VALIDATION_REQUIRED: '조치 이후 인증을 다시 확인해야 해요.', FORBIDDEN: '이 작업을 수행할 권한이 없어요.',
  PROFILE_UNCONFIGURED: '연결의 키 검증 설정을 저장하고 검사 대상별 인증 확인을 허용하세요.',
  NOT_AUTHORIZED: '이 위치의 인증 확인은 보안 담당자 또는 현재 할당된 조치 담당자만 요청할 수 있어요.',
  SECURITY_REQUIRED: '이 범위의 보안 담당자가 검증 허용을 설정할 수 있어요.', CONTEXT_CHANGED: '키·위치·검증 허용 기준이 바뀌었어요. 최신 확인 조건을 다시 조회하세요.',
  UNSUPPORTED_SOURCE: '이 발견 원천에서 값을 다시 취득하는 검증은 지원하지 않아요.', AUTHENTICATION_ONLY: '인증 가능 여부만 확인해요.',
  NO_PERMISSION_OR_REVOCATION_PROOF: '권한·폐기 여부는 이 인증 요청으로 확인하지 않아요.', CHECK_PERIOD_EXCEEDED: '이전 인증 결과의 확인 기한이 지났어요.',
  NO_CURRENT_CONCLUSIVE_RESULT: '현재 기준에 적용할 확정 인증 결과가 없어요.',
  LEASE_EXPIRED: '검증 작업의 실행 권한이 만료되어 시도를 중단했어요.', LEASE_LOST: '검증 작업의 실행 권한을 잃어 시도를 중단했어요.',
  ATTEMPT_ABANDONED: '작업 복구 과정에서 시도를 중단했어요. 완료된 인증 결과가 아니에요.',
}
export const validationReason = (code?: string | null) => code ? validationReasonLabels[code] ?? '확인 조건을 충족하지 못했어요. 담당자에게 사유 코드를 알려 주세요.' : '아직 인증을 확인하지 않았어요.'
export const activeRequest = (status?: string | null) => status === 'PENDING' || status === 'LEASED' || status === 'RUNNING'
export const completedRequest = (status?: string | null) => ['SUCCEEDED', 'FAILED', 'CANCELLED', 'SKIPPED'].includes(status ?? '')
export function currentValidationRequest(progress: ValidationRequest | undefined, latest: ValidationRequest | null | undefined) {
  if (!progress) return latest
  if (!latest) return progress
  if (progress.requestId !== latest.requestId) return progress.requestId > latest.requestId ? progress : latest
  return completedRequest(latest.status) ? latest : progress
}
export const requestStatusLabel = (status: string) => ({ PENDING: '확인 대기', LEASED: '확인 중', RUNNING: '확인 중', SUCCEEDED: '요청 처리 완료', FAILED: '요청 실패', CANCELLED: '요청 취소', SKIPPED: '확인 생략' } as Record<string, string>)[status] ?? '진행 상태 확인 필요'
export const temporaryValidationReadError = (error: Error) => !(error instanceof ApiError) || error.status === 429 || error.status >= 500
export const canRecoverValidationRead = (error: Error | null, failures: number) => error != null && temporaryValidationReadError(error) && failures <= 5
export function validationPresentation(data: SecretValidation): { title: string; description: string } {
  const allReasons = [data.latestAttempt?.reasonCode, ...(data.capabilities.blockedReasonCodes ?? []), data.support.reasonCode, ...(data.support.reasonCodes ?? [])]
  const reason = allReasons.find((code) => !!code && code !== 'SUPPORTED')
  if (data.latestRequest?.status === 'PENDING' && data.latestRequest.nextRetryAt) return { title: '재시도 대기', description: validationReason(reason) }
  if (activeRequest(data.latestRequest?.status)) return { title: requestStatusLabel(data.latestRequest!.status), description: '접수된 요청의 진행 상황이에요. 아직 새 인증 결과가 아니에요.' }
  if (allReasons.includes('SYNTHETIC_FIXTURE')) return { title: '합성 키 검증 생략', description: validationReason('SYNTHETIC_FIXTURE') }
  if (data.support.status === 'UNSUPPORTED' || reason === 'UNSUPPORTED_TYPE') return { title: '검증 미지원', description: validationReason('UNSUPPORTED_TYPE') }
  if (['INCOMPLETE_CREDENTIAL', 'INCOMPLETE_PAIR', 'MISSING_SESSION_TOKEN'].includes(reason ?? '')) return { title: '구성 부족', description: validationReason(reason) }
  if (allReasons.includes('PROFILE_UNCONFIGURED')) return { title: '연결 검증 설정 필요', description: validationReason('PROFILE_UNCONFIGURED') }
  if (allReasons.includes('VALIDATOR_NOT_ALLOWED')) return { title: '키 발급 서비스 허용 필요', description: validationReason('VALIDATOR_NOT_ALLOWED') }
  if (['DISABLED', 'PROFILE_DISABLED', 'GLOBAL_DISABLED'].some((code) => allReasons.includes(code))) return { title: '검증 꺼짐', description: validationReason('DISABLED') }
  if (allReasons.includes('NOT_APPROVED')) return { title: '검사 대상의 검증 허용 필요', description: validationReason('NOT_APPROVED') }
  if (allReasons.includes('SOURCE_GUARD_BLOCKED')) return { title: '이전 검증 생략', description: validationReason('SOURCE_GUARD_BLOCKED') }
  if (data.postActionValidationPending || data.freshness.status === 'POST_ACTION_REQUIRED') return { title: '조치 후 미검증', description: '조치 이전 결과와 현재 재확인 대기를 구분하세요.' }
  if (data.freshness.status === 'STALE') return { title: '다시 확인 필요', description: '이전 결과의 확인 기한이 지났어요. 당시 결과는 이력에서 확인할 수 있어요.' }
  const result = data.latestAttempt?.result
  return { title: result === 'VALID' ? '유효' : result === 'INVALID' ? '사용 불가' : result === 'UNKNOWN' ? '확인 불가' : '미검증', description: validationReason(reason) }
}
