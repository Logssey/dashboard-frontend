import type { PermissionAssistance, PermissionConfirmation, PartialPermissionConfirmation, PermissionPreview } from '../api/secretPermissionAssistance'
import type { RiskSourceRef } from '../api/secretRisk'
import { allowedRiskSources, riskInputUtc, riskSourcePayload, validRiskApplicability, validRiskEvidenceWindow } from './secretRiskForms'
import { validEvidenceRef } from './secretEvidence'

export const permissionCapabilities = ['IDENTITY_ADMINISTRATION', 'SECURITY_SETTINGS_WRITE', 'RESOURCE_ADMINISTRATION', 'PRODUCTION_DEPLOY', 'DATA_WRITE', 'SENSITIVE_DATA_READ', 'RESOURCE_READ', 'TEST_RESOURCE_READ'] as const
export const permissionCoverageLabels: Record<string, string> = { permissionCoverage: '권한 범위', targetCoverage: '대상 범위', restrictionCoverage: '제한 조건', classificationCoverage: '자산 분류' }
export const permissionCoverageValues: Record<string, string> = { COMPLETE: '전체 확인', PARTIAL: '일부 확인', UNKNOWN: '미확인', NOT_APPLICABLE: '해당 없음 확인' }
export const permissionTargetLabels: Record<string, string> = { ASSET: '특정 자산', ACCOUNT: '계정', ORGANIZATION: '조직' }
export const permissionRejectLabels: Record<string, string> = { NOT_APPLICABLE: '이 위치에 적용되지 않음', INSUFFICIENT_EVIDENCE: '확인 근거 부족', IDENTITY_MISMATCH: '키 주체가 일치하지 않음' }
const reasonLabels: Record<string, string> = {
  IDENTITY_UNAVAILABLE: '먼저 키 유효성을 확인해 주체를 연결하세요.', IDENTITY_MISSING: '먼저 키 유효성을 확인해 주체를 연결하세요.',
  IDENTITY_NOT_MATCHED: '인증한 키 주체를 확인해야 해요.', IDENTITY_STALE: '키 주체 확인 기한이 지났어요. 유효성을 다시 확인하세요.',
  IDENTITY_MISMATCH: '키 주체와 조회 대상이 일치하지 않아요.', FRESH_IDENTITY_REQUIRED: '현재 키의 유효성을 먼저 확인하세요.',
  PROVIDER_UNSUPPORTED: '이 유형의 권한 조회는 아직 지원하지 않아요.', PERMISSION_COLLECTION_UNSUPPORTED: '이 유형의 권한 조회는 아직 지원하지 않아요.',
  COLLECTOR_UNAVAILABLE: '승인된 권한 조회 연결을 확인하세요.', COLLECTOR_REQUIRED: '권한을 조회할 연결을 선택하세요.',
  NO_COLLECTOR: '승인된 권한 조회 연결이 없어요.', ACCESS_DENIED: '조회 연결의 읽기 권한을 확인하세요.', AWS_ACCESS_DENIED: 'AWS 연결의 권한 읽기를 허용해야 해요.',
  GITHUB_ACCESS_DENIED: 'GitHub에서 허용한 토큰 권한만 확인할 수 있어요.', RATE_LIMITED: '호출 제한이 끝난 뒤 다시 조회하세요.',
  PROVIDER_UNAVAILABLE: '공급자에 연결하지 못했어요. 기존 요청을 확인하세요.', PERMISSION_COLLECTOR_DISABLED: '권한 조회 워커가 꺼져 있어요. 운영 설정을 확인하세요.',
  ROLE_REQUIRED: '이 위치의 보안 담당자에게 권한 조회를 요청하세요.', SECURITY_ROLE_REQUIRED: '이 위치의 보안 담당자에게 자료 검토를 요청하세요.',
  OBSERVATION_EXPIRED: '조회 자료의 기한이 지났어요. 새 자료를 가져오세요.', CONTEXT_CHANGED: '키·범위·근거가 바뀌었어요. 현재 조건을 다시 조회하세요.',
  RESTRICTIONS_UNKNOWN: '적용 제한을 확인하지 못했어요.', TARGETS_UNKNOWN: '접근 가능한 전체 대상을 확인하지 못했어요.',
  CLASSIFICATION_UNKNOWN: '대상 자산의 중요도 분류가 필요해요.', HUMAN_CONFIRMATION_REQUIRED: '수동 검토를 거쳐야 평가 근거로 사용할 수 있어요.',
  READ_ONLY_OBSERVATION: '권한 조회 자료이며 실제 접근·영향을 확정하지 않아요.', PARTIAL_POLICY_VISIBILITY: '권한 정책의 일부만 확인했어요.',
  ACTIVE_REQUEST_EXISTS: '진행 중인 요청의 결과를 먼저 확인하세요.', SYNTHETIC_FIXTURE: '합성 표본에는 실제 공급자 권한 조회를 실행하지 않아요.',
  WORKER_NOT_CONFIGURED: '권한 조회 워커가 꺼져 있어요. 운영 담당자에게 실행 설정을 확인하세요.', SECURITY_REQUIRED: '이 위치의 보안 담당자에게 권한 자료 검토를 요청하세요.',
  UNSUPPORTED_TYPE: '이 키 유형은 현재 권한 정보를 자동으로 가져올 수 없어요. 근거 보완에서 확인 자료를 기록하세요.',
  COMPLETE_IDENTITY_REQUIRED: '키 구성이 완전하지 않아요. 원천에서 필요한 구성요소를 확인하세요.', FRESH_IDENTITY_VALIDATION_REQUIRED: '현재 키의 유효성을 먼저 확인해 주체를 연결하세요.',
  SOURCE_UNAVAILABLE: '연결과 검사 대상이 활성 상태인지 확인하세요.', APPROVED_COLLECTOR_REQUIRED: '같은 대상의 승인된 읽기 연결을 먼저 등록해야 해요.',
  NO_SUPPORTED_CAPABILITY: '조회 자료에서 지원하는 권한 기능을 확인하지 못했어요. 확인 자료를 보완하세요.', ALREADY_REVIEWED: '이미 검토한 자료예요. 새 자료가 필요하면 다시 조회하세요.',
  COLLECTOR_NOT_AUTHORIZED: '조회 연결의 접근 권한이 바뀌었어요. 운영 담당자에게 확인하세요.',
  COLLECTOR_APPROVAL_CHANGED: '조회 연결의 승인 범위가 바뀌었어요. 현재 조건에서 자료를 다시 가져오세요.',
  AUTOMATIC_IMPACT_UNSUPPORTED: '권한 자료를 자동으로 읽어도 실제 영향도와 등급은 자동 확정하지 않아요.',
  ASSET_CLASSIFICATION_REQUIRED: '현재 자산 분류 자료를 먼저 등록·수용하세요.', PERMISSION_ASSERTION_REQUIRED: '추가 조사에서 권한·대상 확인 자료를 등록·수용하세요.',
  RESTRICTION_PROOF_REQUIRED: '추가 조사에서 제한 조건 확인 자료를 등록·수용하세요.', IDENTITY_PROOF_REQUIRED: '현재 키의 유효성 확인이 필요해요.',
  EFFECTIVE_PERMISSION_NOT_PROVEN: '정책의 허용 구문을 읽었으며 실제 허용 권한을 확정한 결과는 아니에요.',
  ORGANIZATION_LIMITS_UNOBSERVED: '조직 정책이 추가로 제한하는 범위를 확인하지 못했어요.', RESOURCE_POLICY_UNOBSERVED: '리소스 자체의 접근 정책은 함께 평가하지 않았어요.',
  SESSION_POLICY_UNOBSERVED: '임시 세션에 붙은 추가 제한을 확인하지 못했어요.', POLICY_DOCUMENT_LIMIT: '정책 문서의 처리 한도를 넘어 일부만 확인했어요.',
  POLICY_CONDITIONS_PRESENT: '정책에 조건이 있어 실제 조건 충족 여부를 확인해야 해요.', POLICY_COMPLEMENT_UNSUPPORTED: '예외로 권한을 지정한 정책 구문은 자동 해석하지 못했어요.',
  POLICY_DOCUMENT_UNSUPPORTED: '자동으로 해석하지 못한 정책 문서가 있어요.', POLICY_COLLECTION_PARTIAL: '일부 정책만 가져왔어요. 누락된 정책과 제한을 확인하세요.',
  TOKEN_OWNER_NOT_EFFECTIVE_PERMISSION: '토큰 소유자 확인은 실제 저장소 접근 권한을 증명하지 않아요.', REPOSITORY_AUTHORIZATION_UNOBSERVED: '저장소별로 허용된 실제 접근 범위를 확인하지 못했어요.',
  TOKEN_PERMISSIONS_UNAVAILABLE: '토큰이 제공하지 않는 권한 정보는 직접 확인해야 해요.', COLLECTOR_NOT_CONFIGURED: '조회 연결과 워커의 자격 증명 설정을 확인하세요.',
  COLLECTOR_ACCOUNT_MISMATCH: '승인된 조회 연결과 인증한 키의 계정이 달라요.', PERMISSION_ACCESS_DENIED: '조회 연결에 권한 정보를 읽을 권한이 없어요.',
  PERMISSION_RATE_LIMITED: '권한 조회 호출이 제한됐어요. 잠시 후 현재 요청을 확인하세요.', PERMISSION_PROVIDER_UNAVAILABLE: '권한 조회 공급자에 연결하지 못했어요.',
  CREDENTIAL_IDENTITY_MISMATCH: '정책의 주체와 인증한 키 주체가 달라요.', PRINCIPAL_TYPE_MANUAL_REVIEW_REQUIRED: '이 주체 유형의 권한은 자동 해석하지 않아요. 수동 근거를 보완하세요.',
  PERMISSION_BASELINE_CHANGED: '조회 중 키·범위·권한 조건이 바뀌었어요. 현재 조건에서 다시 가져오세요.', IDENTITY_OBSERVATION_EXPIRED: '조회 도중 키 주체 확인 기한이 지났어요. 유효성을 다시 확인하세요.',
  PERMISSION_JOB_INCOMPLETE: '권한 조회 작업을 마치지 못했어요. 현재 요청의 이유를 확인하세요.', PERMISSION_POLL_FAILED: '권한 조회 워커가 작업 확인을 마치지 못했어요. 운영 상태를 확인하세요.',
}
export const permissionPrincipalLabel = (type?: string) => ({ IAM_USER: 'IAM 사용자', ASSUMED_ROLE: '위임 역할', IAM_ROLE: 'IAM 역할', ROOT: '계정 루트', FEDERATED_USER: '연합 사용자', GITHUB_USER: 'GitHub 사용자', GITHUB_INSTALLATION: 'GitHub App 설치' } as Record<string, string>)[type ?? ''] ?? '주체 유형 미확인'
export const permissionReason = (code: string) => Object.hasOwn(reasonLabels, code) ? reasonLabels[code] : '조회 범위와 부족한 근거를 확인해 주세요.'
export const activePermissionRequest = (status?: string) => status === 'PENDING' || status === 'LEASED'
export const completedPermissionRequest = (status?: string) => ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(status ?? '')
export const permissionRequestStatus = (status?: string) => ({ PENDING: '조회 대기', LEASED: '권한 조회 중', SUCCEEDED: '조회 처리 완료', FAILED: '조회 실패', CANCELLED: '조회 취소' } as Record<string, string>)[status ?? ''] ?? '상태 확인 필요'
export function permissionPrerequisites(context: PermissionAssistance, collector: string, synthetic = false) {
  const reasons = [...context.support.reasonCodes, ...context.capabilities.blockedReasonCodes]
  const isSynthetic = synthetic || reasons.includes('SYNTHETIC_FIXTURE')
  const supported = ['AWS', 'GITHUB'].includes(context.identity.provider) && context.support.status !== 'UNSUPPORTED'
  const identityReady = context.identity.status === 'MATCHED' && !reasons.some((code) => ['FRESH_IDENTITY_VALIDATION_REQUIRED', 'FRESH_IDENTITY_REQUIRED', 'IDENTITY_OBSERVATION_EXPIRED', 'IDENTITY_MISMATCH'].includes(code))
  const collectorReady = context.identity.provider !== 'AWS' || context.collectorOptions.some((option) => String(option.connectionId) === collector)
  const canRequest = !isSynthetic && supported && identityReady && collectorReady && context.capabilities.canRequest && !!context.contextVersion
  const actionHelp: Record<string, string> = {
    CONTACT_OPERATIONS: '운영 담당자에게 권한 조회 기능과 워커 설정을 확인해 달라고 요청하세요.',
    CONTACT_SECURITY: '이 위치의 보안 담당자에게 권한 조회를 요청하세요.',
    MANUAL_PERMISSION_REVIEW: '이 키 유형은 자동 권한 조회를 지원하지 않아요. 조사에서 확인한 권한 자료를 기록하세요.',
    COLLECT_COMPLETE_CREDENTIAL: '현재 위치의 키 구성요소가 부족해요. 승인된 원천에서 같은 구성의 키 쌍과 필요한 세션 토큰을 확인하세요.',
    REVIEW_CONNECTION: '현재 위치의 원천 연결과 검사 범위가 활성 상태이고 열람 가능한지 확인하세요.',
  }
  const blocker = isSynthetic ? '합성 표본에는 실제 공급자 권한 조회를 실행하지 않아요.'
    : (Object.hasOwn(actionHelp, context.requestReadiness?.nextAction ?? '') ? actionHelp[context.requestReadiness!.nextAction] : '') || (
    !supported ? '이 키 유형은 자동 권한 조회를 지원하지 않아요. 확인한 자료를 직접 기록하세요.'
      : !identityReady ? '1단계에서 현재 위치의 키 유효성을 확인하세요. 인증한 주체가 연결되어야 다음 단계로 진행할 수 있어요.'
        : !collectorReady ? context.collectorOptions.length ? '2단계에서 승인된 읽기 연결을 선택하세요.' : '2단계에서 같은 계정의 승인된 IAM 읽기 연결을 확인하세요.'
          : !context.capabilities.canRequest ? reasons.length ? permissionReason(reasons[0]) : '현재 사용자 또는 운영 설정에서 조회를 허용하지 않아요. 보안 담당자에게 확인하세요.'
            : !context.contextVersion ? '현재 조회 조건을 다시 불러오세요.' : '')
  const displayReasonCodes = reasons.filter((code) => identityReady || !['APPROVED_COLLECTOR_REQUIRED', 'COLLECTOR_REQUIRED', 'NO_COLLECTOR'].includes(code))
  return { isSynthetic, supported, identityReady, collectorReady, collectorWaiting: context.identity.provider === 'AWS' && !identityReady, canRequest, blocker, displayReasonCodes }
}
export function permissionSourceRequirements(sources: RiskSourceRef[]): string[] {
  const available = allowedRiskSources(sources)
  return [
    ['VALIDATION_ATTEMPT', 'BINDS_IDENTITY', '현재 키의 주체 연결'],
    ['RISK_EVIDENCE', 'CLASSIFIES', '수용된 자산 분류'],
    ['INVESTIGATION_HISTORY', 'ASSERTS', '권한·대상 확인 자료'],
    ['INVESTIGATION_HISTORY', 'LIMITS', '제한 조건 확인 자료'],
  ].filter(([type, role]) => !available.some((ref) => ref.type === type && ref.role === role)).map((entry) => entry[2])
}
export function currentPermissionPreview(preview: PermissionPreview | undefined, observationId: number, revision: number, now = Date.now()): boolean {
  return !!preview && preview.observationId === observationId && preview.evidenceRevision === revision && !!preview.contextVersion && Date.parse(preview.expiresAt) > now
}
export function observedPermissionOptions(preview: Pick<PermissionPreview, 'capabilities'>): string[] {
  return [...new Set(preview.capabilities)].filter((code) => permissionCapabilities.some((value) => value === code))
}
export interface PermissionReviewInput { capability: string; targetScope: string; coverage: Record<string, string>; selectedSourceKeys: string[]; evidenceRef: string; until: string; attested: boolean; attestedAt: string | null; applicableFrom?: string; applicableUntil?: string }

export function partialPermissionConfirmationFacts(preview: PermissionPreview, revision: number, input: PermissionReviewInput, now = Date.now()): Omit<PartialPermissionConfirmation, 'idempotencyKey'> | null {
  if (!preview.canSavePartial || !currentPermissionPreview(preview, preview.observationId, revision, now)
    || ['CONFIRMED', 'REJECTED'].includes(preview.decision ?? '') || !input.attested || !input.attestedAt) return null
  if (input.evidenceRef && !validEvidenceRef(input.evidenceRef)) return null
  if (input.capability && !observedPermissionOptions(preview).includes(input.capability)) return null
  if (input.targetScope && !Object.hasOwn(permissionTargetLabels, input.targetScope)) return null
  if (!Object.keys(permissionCoverageLabels).every((field) => Object.hasOwn(permissionCoverageValues, input.coverage[field]))) return null
  const sourceRefs = riskSourcePayload(preview.availableSourceRefs, input.selectedSourceKeys)
  if (!sourceRefs) return null
  const validUntil = input.until ? riskInputUtc(input.until) : null
  const applicableFrom = input.applicableFrom ? riskInputUtc(input.applicableFrom) : null
  const applicableUntil = input.applicableUntil ? riskInputUtc(input.applicableUntil) : null
  if (input.until && (!validUntil || Date.parse(validUntil) <= now || Date.parse(validUntil) > Date.parse(preview.expiresAt))) return null
  if ((input.applicableFrom || input.applicableUntil)
    && !validRiskApplicability(applicableFrom, applicableUntil, preview.sourcePresenceObservedAt, input.attestedAt, validUntil)) return null
  return {
    savePartial: true,
    expectedContextVersion: preview.contextVersion,
    expectedEvidenceRevision: revision,
    attestation: true,
    observedAt: input.attestedAt,
    ...(validUntil ? { validUntil } : {}),
    ...(applicableFrom ? { applicableFrom } : {}),
    ...(applicableUntil ? { applicableUntil } : {}),
    ...(input.evidenceRef ? { evidenceRef: input.evidenceRef } : {}),
    facts: {
      capability: input.capability || 'UNKNOWN',
      targetScope: input.targetScope || 'UNKNOWN',
      permissionCoverage: input.coverage.permissionCoverage,
      targetCoverage: input.coverage.targetCoverage,
      restrictionCoverage: input.coverage.restrictionCoverage,
      classificationCoverage: input.coverage.classificationCoverage,
    },
    sourceRefs,
  }
}
export function permissionConfirmationFacts(preview: PermissionPreview, revision: number, input: PermissionReviewInput, now = Date.now()): Omit<PermissionConfirmation, 'idempotencyKey'> | null {
  const observedAt = input.attestedAt, validUntil = riskInputUtc(input.until)
  const applicableFrom = riskInputUtc(input.applicableFrom ?? ''), applicableUntil = riskInputUtc(input.applicableUntil ?? '')
  const refs = riskSourcePayload(preview.availableSourceRefs, input.selectedSourceKeys)
  if (!currentPermissionPreview(preview, preview.observationId, revision, now) || !preview.canConfirm || ['CONFIRMED', 'REJECTED'].includes(preview.decision ?? '') || !input.attested || !validEvidenceRef(input.evidenceRef)
    || !observedPermissionOptions(preview).includes(input.capability) || !Object.hasOwn(permissionTargetLabels, input.targetScope)
    || !refs || permissionSourceRequirements(refs).length || !validRiskEvidenceWindow('PERMISSION_MAPPING', observedAt, validUntil, now)
    || !observedAt || Date.parse(observedAt) < Date.parse(preview.observedAt)
    || !validRiskApplicability(applicableFrom, applicableUntil, preview.sourcePresenceObservedAt, observedAt, validUntil)
    || !validUntil || Date.parse(validUntil) > Date.parse(preview.expiresAt)
    || Object.keys(input.coverage).length !== 4 || !Object.keys(permissionCoverageLabels).every((field) => input.coverage[field] === 'COMPLETE')) return null
  return { expectedContextVersion: preview.contextVersion, expectedEvidenceRevision: revision, attestation: true, evidenceRef: input.evidenceRef, observedAt: observedAt!, validUntil, applicableFrom, applicableUntil,
    facts: { capability: input.capability, targetScope: input.targetScope, permissionCoverage: input.coverage.permissionCoverage, targetCoverage: input.coverage.targetCoverage, restrictionCoverage: input.coverage.restrictionCoverage, classificationCoverage: input.coverage.classificationCoverage }, sourceRefs: refs }
}
