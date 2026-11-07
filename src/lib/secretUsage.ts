import type { ManualUsageInput, SecretUsage, UsageSourceRef, UsageTargetRef } from '../api/secretUsage'
import { riskInputUtc } from './secretRiskForms'
import { scanDate } from './secretScan'
import { caseActionLabels } from './secretResponse'

const observationLabels: Record<string, string> = { OBSERVED: '사용 자료 확인', NOT_OBSERVED_IN_SCOPE: '조회 범위에서 관측 0건', UNAVAILABLE: '확인 불가', NOT_REQUESTED: '아직 조회하지 않음' }
const requestLabels: Record<string, string> = { PENDING: '조회 대기', RUNNING: '조회 중', COMPLETE: '조회 완료', PARTIAL: '부분 조회', UNAVAILABLE: '조회 불가', CANCELLED: '조회 취소' }
const bindingLabels: Record<string, string> = { EXACT_CREDENTIAL: '이 키와 연결 확인', PRINCIPAL_ONLY: '사용자·앱 수준 자료', UNRESOLVED: '키 연결 미확인' }
const coverageLabels: Record<string, string> = { COMPLETE: '등록된 조회 범위 완료', PARTIAL: '일부 범위만 확인', UNKNOWN: '확인 범위 미상' }
const reviewLabels: Record<string, string> = { PENDING: '보안 담당자 검토 대기', ACCEPTED: '수동 자료 수용', REJECTED: '자료 거절', WITHDRAWN: '수용 철회', NOT_REQUIRED: '공급자 관측' }
export const usageActions: Record<string, string> = { API_CALL: 'API 호출', RESOURCE_READ: '자원 읽기', RESOURCE_CHANGE: '자원 변경', AUTHENTICATION: '인증', UNKNOWN: '행위 미확인' }
export const usageResults: Record<string, string> = { SUCCESS: '성공', FAILURE: '실패', UNKNOWN: '결과 미확인' }
export const usageActors: Record<string, string> = { OWN_VALIDATION: '자체 검증 근거 연결', EXPECTED_WORKLOAD: '업무 사용 자료', UNATTRIBUTED: '사용 주체 미분류' }
export const usageDecisions: Record<string, string> = { ACCEPT: '자료 수용', REJECT: '자료 거절', WITHDRAW: '수용 철회' }
export const usageDecisionReasons: Record<string, string> = { REVIEWED_USAGE: '사용 자료와 연결 근거 확인', INSUFFICIENT_EVIDENCE: '확인 자료 부족', IDENTITY_MISMATCH: '키·주체 연결 불일치', WITHDRAWN_BY_REVIEWER: '수용 근거 철회' }
const reasonLabels: Record<string, string> = {
  USAGE_HISTORY_NOT_AVAILABLE: '이 발급자의 자동 사용 조회를 지원하지 않아요. 확인한 관리 자료를 제출할 수 있어요.',
  PROVIDER_UNSUPPORTED: '이 발급자의 자동 사용 조회를 지원하지 않아요.', UNSUPPORTED_PROVIDER: '이 발급자의 자동 사용 조회를 지원하지 않아요.',
  CLOUDTRAIL_DISABLED: 'AWS 사용 조회가 꺼져 있어요. 운영 담당자에게 설정을 확인해 달라고 요청하세요.',
  USAGE_CLOUDTRAIL_DISABLED: 'AWS 사용 조회가 꺼져 있어요. 승인된 관리 연결과 운영 설정이 필요해요.',
  KEY_IDENTIFIER_UNAVAILABLE: '조회할 정확한 키 ID를 승인된 원천에서 확보하지 못했어요.',
  IDENTITY_BINDING_UNRESOLVED: '발견된 키와 조회 대상의 연결을 확인해야 해요.',
  ACCESS_DENIED: '승인된 조회 연결에 이벤트 읽기 권한이 없어요.', RATE_LIMITED: '공급자 호출 제한으로 조회를 완료하지 못했어요.',
  PAGE_LIMIT_REACHED: '조회 페이지 한도에 도달해 나머지 범위를 확인하지 못했어요.', EVENT_LIMIT_REACHED: '조회 건수 한도에 도달해 일부만 확인했어요.',
  DATA_EVENTS_OUT_OF_SCOPE: 'S3 객체 읽기 같은 데이터 이벤트는 이 조회 범위에 포함되지 않아요.',
  MANAGEMENT_EVENTS_ONLY: 'CloudTrail 관리 이벤트만 조회해요. 모든 자원 접근 이력을 확인한 결과로 해석하지 마세요.',
  APPROVED_TARGET_REQUIRED: '승인된 계정·리전 조회 대상을 먼저 등록해야 해요.', TARGET_UNAVAILABLE: '등록된 조회 대상이 현재 허용되지 않아요.',
  CONTEXT_CHANGED: '키 또는 승인 범위가 바뀌었어요. 현재 조건을 다시 조회하세요.',
  PROVIDER_USAGE_UNSUPPORTED: '이 발급자의 자동 사용 조회는 지원하지 않아요. 등록된 관리 자료를 제출할 수 있어요.',
  IAM_METADATA_IS_SEPARATE: 'IAM 최근 사용 정보와 관리 이벤트 조회 결과는 각각의 출처로 표시해요.',
  USAGE_COLLECTION_DISABLED: '사용 조회가 꺼져 있어요. 운영 담당자에게 승인된 조회 대상과 워커 설정을 확인해 달라고 요청하세요.',
  SECURITY_REQUIRED: '자동 사용 조회는 이 위치의 보안 담당자가 요청할 수 있어요.',
  SOURCE_UNAVAILABLE: '원천 연결과 검사 범위가 활성 상태인지 확인하세요.',
  FRESH_IDENTITY_VALIDATION_REQUIRED: '먼저 이 위치의 현재 키 인증을 확인해 IAM 주체를 연결해야 해요.',
  USAGE_ACCESS_DENIED: '승인된 조회 연결에 관리 이벤트를 읽을 권한이 없어요.',
  USAGE_RATE_LIMITED: '공급자 호출 제한으로 조회를 마치지 못했어요. 기존 요청의 진행 상태를 확인하세요.',
  USAGE_PROVIDER_UNAVAILABLE: 'AWS 조회 서비스에 연결하지 못했어요. 읽은 자료와 완료 범위를 확인하세요.',
  USAGE_PAGE_LIMIT: '조회 페이지 한도에 도달해 나머지 범위는 확인하지 못했어요.',
  USAGE_EVENT_LIMIT: '조회 이벤트 한도에 도달해 일부만 확인했어요.',
  USAGE_RESPONSE_LIMIT: '응답 처리 한도를 넘어 해당 범위를 완료하지 못했어요.',
  USAGE_PAGINATION_INVALID: '페이지 연결 정보를 확인하지 못해 나머지 조회를 중단했어요.',
  USAGE_EVENT_BINDING_UNCONFIRMED: '일부 이벤트를 이 키와 정확히 연결하지 못해 제외했어요.',
  USAGE_EVENT_DETAILS_UNAVAILABLE: '일부 이벤트의 행위·결과 세부 정보를 확인하지 못했어요.',
  USAGE_NON_MANAGEMENT_EVENT: '관리 이벤트가 아닌 자료는 이번 조회에서 제외했어요.',
  KEY_IDENTIFIER_LIST_INCOMPLETE: '키 목록을 끝까지 읽지 못해 정확한 조회 대상을 확인하지 못했어요.',
  COLLECTOR_NOT_CONFIGURED: '승인된 AWS 조회 연결의 실행 자격 증명 설정이 필요해요.',
  COLLECTOR_ACCOUNT_MISMATCH: '조회 연결의 AWS 계정과 승인된 조회 계정이 달라요.',
  USAGE_BASELINE_CHANGED: '조회 중 키·승인 범위가 변경됐어요. 현재 조건을 다시 확인하세요.',
  USAGE_LEASE_EXPIRED: '실행 권한이 만료돼 조회가 지연되거나 중단됐어요. 현재 요청 상태를 확인하세요.',
  USAGE_JOB_INCOMPLETE: '사용 조회 작업을 마치지 못했어요. 읽은 자료와 누락 범위를 확인하세요.',
  USAGE_POLL_FAILED: '워커가 사용 조회 작업을 확인하지 못했어요. 운영 담당자에게 실행 상태를 확인해 달라고 요청하세요.',
  USAGE_OBSERVER_FAILED: '사용 자료를 읽는 중 작업을 완료하지 못했어요. 현재 조건과 요청 상태를 확인하세요.',
  USAGE_INTERRUPTED: '사용 조회 실행이 중단됐어요. 현재 요청의 완료 범위를 확인하세요.',
}
const label = (labels: Record<string, string>, code: string, fallback: string) => Object.hasOwn(labels, code) ? labels[code] : fallback
export const usageObservationLabel = (code: string) => label(observationLabels, code, '확인 상태 미상')
export const usageRequestLabel = (code: string) => label(requestLabels, code, '요청 상태 확인 필요')
export const usageBindingLabel = (code: string) => label(bindingLabels, code, '키 연결 미확인')
export const usageCoverageLabel = (code: string) => label(coverageLabels, code, '확인 범위 미상')
export const usageReviewLabel = (code: string) => label(reviewLabels, code, '검토 상태 확인 필요')
export const usageActionLabel = (code: string) => label(usageActions, code, '등록된 행위')
const operationLabels: Record<string, string> = {
  GetCallerIdentity: '인증한 주체 확인', AssumeRole: '역할 위임 요청', GetSessionToken: '임시 세션 발급', GetFederationToken: '연합 인증 토큰 발급',
  CreateAccessKey: '접근키 생성', UpdateAccessKey: '접근키 상태 변경', DeleteAccessKey: '접근키 삭제', ListAccessKeys: '접근키 목록 조회', GetAccessKeyLastUsed: '접근키 최근 사용 조회',
  GetUser: '사용자 조회', ListUsers: '사용자 목록 조회', AttachUserPolicy: '사용자 정책 연결', DetachUserPolicy: '사용자 정책 연결 해제', PutUserPolicy: '사용자 정책 변경', CreateUser: '사용자 생성', DeleteUser: '사용자 삭제',
  CreateRole: '역할 생성', DeleteRole: '역할 삭제', AttachRolePolicy: '역할 정책 연결', PutRolePolicy: '역할 정책 변경',
  ListBuckets: '버킷 목록 조회', GetBucketPolicy: '버킷 정책 조회', PutBucketPolicy: '버킷 정책 변경', DeleteBucketPolicy: '버킷 정책 삭제', CreateBucket: '버킷 생성', DeleteBucket: '버킷 삭제',
  DescribeInstances: 'EC2 인스턴스 조회', RunInstances: 'EC2 인스턴스 실행', TerminateInstances: 'EC2 인스턴스 종료', AuthorizeSecurityGroupIngress: '인바운드 접근 허용 추가', RevokeSecurityGroupIngress: '인바운드 접근 허용 제거',
  GetSecretValue: '시크릿 값 조회', PutSecretValue: '시크릿 값 변경', DeleteSecret: '시크릿 삭제', DescribeSecret: '시크릿 정보 조회',
  GetParameter: '파라미터 조회', GetParameters: '파라미터 목록 조회', PutParameter: '파라미터 변경', DeleteParameter: '파라미터 삭제',
  Decrypt: '복호화 요청', Encrypt: '암호화 요청', GenerateDataKey: '데이터 암호화 키 생성', GetFunction: '함수 조회', UpdateFunctionCode: '함수 코드 변경',
  LookupEvents: '관리 이벤트 조회', StopLogging: '이벤트 기록 중지', DeleteTrail: '감사 추적 삭제',
}
export const usageOperationLabel = (operation: string | undefined, action: string) => operation && Object.hasOwn(operationLabels, operation) ? operationLabels[operation] : usageActionLabel(action)
export const usageResultLabel = (code: string) => label(usageResults, code, '결과 미확인')
export const usageActorLabel = (code: string) => label(usageActors, code, '사용 주체 미분류')
export const usageReason = (code: string) => label(reasonLabels, code, '조회 조건과 확인하지 못한 범위를 보안 담당자에게 확인하세요.')
export const activeUsageRequest = (status?: string) => status === 'PENDING' || status === 'RUNNING'
export const terminalUsageRequest = (status?: string) => ['COMPLETE', 'PARTIAL', 'UNAVAILABLE', 'CANCELLED'].includes(status ?? '')
export function usageRefKey(ref: UsageSourceRef | UsageTargetRef): string { return `${ref.type}:${ref.id}` }
export function usageRefLabel(ref: UsageSourceRef | UsageTargetRef): string {
  const source = ref as UsageSourceRef
  const kind = label({ INVESTIGATION_HISTORY: '조사 기록', ACTION_RECORD: '조치 기록', APPROVED_SCOPE: '승인 범위', ASSET: '자산' }, ref.type, '등록 근거')
  const event = source.type === 'ACTION_RECORD' && source.labelCode && Object.hasOwn(caseActionLabels, source.labelCode)
    ? caseActionLabels[source.labelCode as keyof typeof caseActionLabels]
    : label({ EVIDENCE_ADDED: '근거 추가', EVIDENCE_ACCEPTED: '근거 수용', EVIDENCE_REJECTED: '근거 거절', INVESTIGATION_RECORD: '조사 자료', ACTION_RECORD: '외부 조치', ASSIGNED: '담당·기한 변경', CLOSED: '조사 종료', CREATED: '조사 생성', REQUESTED: '조사 요청' }, source.labelCode ?? '', '')
  return `${kind}${event ? ` · ${event}` : ''}${source.recordedAt ? ` · ${scanDate(source.recordedAt)}` : ''} · #${ref.id}`
}
export function validUsageWindow(start: string | null, end: string | null, now = Date.now()): boolean {
  if (!start || !end) return false
  const from = Date.parse(start), until = Date.parse(end)
  return Number.isFinite(from) && Number.isFinite(until) && from < until && until <= now && from >= now - 90 * 86400000
}
export function manualUsagePayload(context: SecretUsage, input: { source: string; target: string; from: string; until: string; eventAt: string; action: string; result: string; actor: string }, now = Date.now()): Omit<ManualUsageInput, 'idempotencyKey'> | null {
  const sourceRef = context.availableSourceRefs.find((ref) => usageRefKey(ref) === input.source)
  const targetRef = context.availableTargetRefs.find((ref) => usageRefKey(ref) === input.target)
  const windowStart = riskInputUtc(input.from), windowEnd = riskInputUtc(input.until), eventAt = riskInputUtc(input.eventAt)
  if (!context.capabilities.canSubmit || !sourceRef || !targetRef || !validUsageWindow(windowStart, windowEnd, now) || !eventAt || Date.parse(eventAt) < Date.parse(windowStart!) || Date.parse(eventAt) >= Date.parse(windowEnd!)
    || !Object.hasOwn(usageActions, input.action) || !Object.hasOwn(usageResults, input.result) || !['UNATTRIBUTED', 'EXPECTED_WORKLOAD'].includes(input.actor)) return null
  return { occurrenceId: context.occurrenceId, expectedCredentialRevision: context.credentialRevision, expectedScopeRevision: context.scopeRevision,
    sourceRef: { type: sourceRef.type, id: sourceRef.id }, targetRef: { type: targetRef.type, id: targetRef.id }, windowStart: windowStart!, windowEnd: windowEnd!, eventAt, actionCode: input.action, actionResult: input.result, actorAttribution: input.actor }
}
