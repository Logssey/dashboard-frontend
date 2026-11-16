import type { SecretConnectionSettings } from '@/api/secretConnections'
import { validationIssuerLabels, validationReason } from '@/lib/secretValidation'

const readinessReasons: Record<string, string> = {
  ACTIVE_REQUIRED: '연결을 활성화하세요.',
  CREDENTIAL_REQUIRED: '수집 인증을 등록하세요.',
  SCOPES_REQUIRED: '검사 대상을 등록하세요.',
  VALIDATION_DISABLED: '연결의 인증 확인을 허용하세요.',
  VALIDATOR_DISABLED: '선택한 키 발급 서비스의 서버 기능을 확인하세요.',
  SCOPES_NOT_APPROVED: '검사 대상에서 인증 확인을 허용하세요.',
  WORKER_CAPABILITIES_UNKNOWN: '워커가 실행 가능한 검증 기능을 아직 보고하지 않았어요.',
  WORKER_CONFIGURATION_MISMATCH: '서버와 워커의 검증 기능 설정을 맞춰야 해요.',
}

export function SecretConnectionReadiness({ settings }: { settings: SecretConnectionSettings }) {
  const readiness = settings.validationReadiness
  if (!readiness) return null

  return <section className="secret-manager-readiness" aria-label="실행 준비 상태" role="status">
    <strong>{settings.status === 'ACTIVE' ? '검사 사용 중' : '연결 일시중지'}</strong>
    <p>{readiness.ready
      ? '발견한 키의 인증 확인을 실행할 수 있어요.'
      : '아래 발급 서비스별 인증 확인 준비 상태를 확인하세요.'}</p>
    <ul>{readiness.validators.map((validator) => {
      const issuer = validationIssuerLabels[validator.issuer as keyof typeof validationIssuerLabels]
      const status = !validator.serverEnabled ? '서버 기능 꺼짐'
        : !validator.connectionAllowed ? '연결 허용 꺼짐'
          : `${validator.allowedScopeCount} / ${validator.scopeCount}개 대상에서 허용`
      return <li key={validator.issuer}><span>{issuer ?? '키 발급 서비스'}</span><span>{status}</span></li>
    })}</ul>
    {!readiness.ready && readiness.reasonCodes.length > 0 && <details>
      <summary>인증 확인 사용 조건</summary>
      <ul>{readiness.reasonCodes.map((code) => <li key={code}>
        {readinessReasons[code] ?? validationReason(code)}
      </li>)}</ul>
    </details>}
  </section>
}
