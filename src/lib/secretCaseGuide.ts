import type { SecretCaseGuide } from '../api/secretCaseGuide'
import type { SecretCaseDetail } from '../api/secretCases'

const guideReasons: Record<string, string> = {
  BASIC_CONTEXT: '기본 안내로 확인할 수 있어요.',
  READY: 'AI 보조 가이드를 요청할 수 있어요. 아래 기본 절차는 바로 사용할 수 있어요.',
  DISABLED: '서버에서 AI 보조 기능이 꺼져 있어요. 기본 가이드를 사용하세요.',
  KEY_MISSING: '서버에 AI 제공자 키가 설정되지 않았어요. 운영 담당자가 설정하면 AI 보조를 요청할 수 있어요.',
  KEY_INVALID: '서버의 AI 제공자 키 설정을 사용할 수 없어요. 운영 담당자에게 설정 확인을 요청하세요.',
  KEY_FILE_UNREADABLE: '서버의 AI 제공자 키 파일을 읽지 못했어요. 운영 담당자가 파일 위치와 읽기 권한을 확인해야 해요.',
  KEY_STORE_UNAVAILABLE: 'Claude 인증 저장소에 연결하지 못했어요. 기본 안내를 사용하고 운영 담당자에게 연결 상태를 확인해 주세요.',
  WORKSPACE_INVALID: '서버의 AI 워크스페이스 설정을 확인해야 해요. 운영 담당자에게 설정 확인을 요청하세요.',
  CONFIGURATION_INVALID: '서버의 AI 안전 설정을 확인해야 해요. 운영 담당자에게 설정 확인을 요청하세요.',
  ENDPOINT_NOT_ALLOWED: '서버의 AI 연결 주소가 허용된 설정과 달라요. 운영 담당자에게 연결 설정을 확인해 달라고 요청하세요.',
  MODEL_NOT_ALLOWED: '서버의 AI 모델이 허용된 설정과 달라요. 운영 담당자에게 모델 설정을 확인해 달라고 요청하세요.',
  UNSUPPORTED_ISSUER: '이 발급자의 AI 보조 가이드는 지원하지 않아요.',
  TEST_ONLY: 'AI 보조는 승인된 합성 표본 사례에서만 사용할 수 있어요. 실제 키의 대응에는 기본 가이드를 사용하세요.',
  SYNTHETIC_FIXTURE_REQUIRED: '승인된 합성 표본임이 확인되어야 AI 보조를 사용할 수 있어요. 합성 키 여부는 정확한 비교 근거로 판단해요.',
  ALL_LOCATIONS_ACCESS_REQUIRED: '대응 건의 모든 위치를 열람할 수 있어야 AI 보조를 요청할 수 있어요. 현재 열람 범위에서는 기본 가이드를 사용하세요.',
  CONTEXT_CHANGED: '키 상태나 대응 단계가 바뀌었어요. 가이드 상태를 다시 조회해 주세요.',
  GROQ_GENERATED: 'AI 보조 가이드를 받았어요. 실제 권한·조치와 비교해 검토하세요.',
  CLAUDE_GENERATED: 'Claude가 제안한 대응 순서를 받았어요. 실제 사용처와 조치 근거를 함께 확인하세요.',
  CACHE_HIT: '현재 조건으로 이전에 생성한 AI 보조 가이드를 표시해요. 제공자를 다시 호출하지 않았어요.',
  REQUEST_IN_PROGRESS: '다른 AI 가이드 요청이 진행 중이에요. 기본 절차를 확인하고 잠시 후 상태를 다시 조회하세요.',
  CALL_BUDGET_EXHAUSTED: '서버의 AI 요청 한도에 도달했어요. 기본 가이드를 사용하세요.',
  CALL_BUDGET_UNAVAILABLE: 'AI 호출 한도를 확인하지 못해 기본 가이드를 표시해요. 잠시 후 다시 요청하세요.',
  PROVIDER_TIMEOUT: 'AI 제공자의 응답 시간이 초과되어 기본 가이드를 표시해요.',
  PROVIDER_REJECTED: 'AI 제공자가 요청을 거절하여 기본 가이드를 표시해요. 운영 담당자가 제공자 설정을 확인해야 해요.',
  PROVIDER_AUTHENTICATION_FAILED: 'AI 제공자의 API 인증이 거부됐어요. 운영 담당자가 API 키를 확인해야 해요. 기본 가이드는 바로 사용할 수 있어요.',
  PROVIDER_ACCESS_DENIED: 'AI 제공자가 접근을 거부했어요. 운영 담당자가 모델·워크스페이스 접근 설정을 확인해야 해요. 기본 가이드를 표시해요.',
  PROVIDER_BILLING_REQUIRED: 'AI 제공자의 API 결제·크레딧 상태를 확인해야 해요. 기본 가이드를 표시해요.',
  PROVIDER_RATE_LIMITED: 'AI 제공자의 호출 제한으로 기본 가이드를 표시해요. 잠시 후 다시 요청하세요.',
  PROVIDER_UNAVAILABLE: 'AI 제공자에 연결하지 못하여 기본 가이드를 표시해요.',
  PROVIDER_INVALID_RESPONSE: 'AI 제공자의 응답을 가이드로 사용할 수 없어 기본 가이드를 표시해요.',
  PROVIDER_RESPONSE_TOO_LARGE: 'AI 제공자의 응답이 처리 범위를 넘어 기본 가이드를 표시해요.',
  PROVIDER_INTERRUPTED: 'AI 요청이 중단되어 기본 가이드를 표시해요.',
}
export function guideProviderName(guide: SecretCaseGuide): string {
  const provider = guide.readiness?.provider ?? guide.source
  return provider === 'CLAUDE' ? 'Claude' : provider === 'GROQ' ? 'Groq' : 'AI'
}
export function guideModelName(guide: SecretCaseGuide): string | null {
  const labels: Record<string, string> = { 'claude-sonnet-5-5': 'Claude Sonnet 5.5', 'openai/gpt-oss-20b': 'openai/gpt-oss-20b' }
  return guide.readiness?.model ? labels[guide.readiness.model] ?? '모델 정보 확인 필요' : null
}
export function guideReadinessMessage(guide: SecretCaseGuide): string {
  if (!guide.readiness) return '가이드 사용 조건을 확인하는 중이에요. 기본 절차는 바로 사용할 수 있어요.'
  const reason = Object.hasOwn(guideReasons, guide.readiness.reasonCode) ? guideReasons[guide.readiness.reasonCode] : 'AI 사용 조건을 확인하지 못했어요. 기본 가이드를 사용하고 상태를 다시 조회하세요.'
  const provider = guideProviderName(guide)
  return provider === 'AI' ? reason : reason.replaceAll('AI 제공자 키', `${provider} API 키`).replaceAll('AI 제공자', provider)
}
export const guideReasonMessage = (code: string) => Object.hasOwn(guideReasons, code) ? guideReasons[code] : '현재 기본 안내를 사용하고 있어요.'
export const canRequestGuideAi = (guide: SecretCaseGuide) => guide.readiness?.aiAvailable === true && guide.readiness.status !== 'UNAVAILABLE' && Object.hasOwn(guideReasons, guide.readiness.reasonCode) && !['REQUEST_IN_PROGRESS', 'CALL_BUDGET_EXHAUSTED', 'CONTEXT_CHANGED'].includes(guide.readiness.reasonCode)

/** Safe local baseline remains available while the server-authored guide is loading. */
export function immediateSecretCaseGuide(detail: Pick<SecretCaseDetail, 'issuer'>): SecretCaseGuide {
  const aws = detail.issuer === 'AWS'
  const github = detail.issuer === 'GITHUB'
  const notion = detail.issuer === 'NOTION'
  return {
    version: '기본 절차', source: 'DEFAULT', title: `${aws ? 'AWS' : github ? 'GitHub' : notion ? 'Notion' : '키'} 대응 절차`,
    steps: [
      { code: 'IDENTIFY_OWNER', title: '키 소유자와 영향 범위 확인', description: aws ? 'AWS 계정과 IAM 사용자·역할의 담당자를 확인하세요. 인증 결과, IAM 정책, 연결 자산을 각각 확인하고 미확인 권한은 확정하지 마세요.' : github ? '토큰 소유자와 해당 저장소·조직의 담당자를 확인하세요. 토큰 종류, 허용한 저장소, 권한 범위와 만료 설정을 확인하세요.' : notion ? 'Notion 연결의 소유자와 공유된 페이지를 확인하세요. 연결 기능과 페이지별 공유 권한을 함께 검토하세요.' : '발급자와 소유자를 확인하고 접근 대상과 제한을 조사하세요.' },
      { code: 'ROTATE_OR_REVOKE', title: '발급자에서 키 교체·폐기', description: aws ? '담당자가 AWS IAM에서 새 키로 서비스를 전환한 후 노출된 키를 비활성화·삭제하세요. 임시 키라면 세션과 발급 역할의 대응도 확인하세요.' : github ? '담당자가 GitHub 설정에서 해당 토큰을 폐기하거나 교체하고 사용하는 배포·자동화의 자격 증명을 갱신하세요.' : notion ? '담당자가 Notion 연결 설정에서 노출된 토큰을 교체·폐기하고 연결된 수집기와 자동화의 인증 정보를 갱신하세요.' : '담당자가 발급자에서 키를 교체·폐기하고 사용 중인 서비스의 자격 증명을 갱신하세요.' },
      { code: 'REMOVE_EXPOSURE', title: '발견 위치에서 노출 제거', description: '표시된 원본 위치에서 키를 제거하고 안전한 비밀 저장 방식으로 옮기세요. 저장소의 커밋 이력과 복제본도 확인하세요. 파일에서 지우는 것만으로 키가 폐기되지는 않아요.' },
      { code: 'CHECK_ACCESS_LOGS', title: '사용 기록 확인 후 조치 기록·재검사', description: aws ? 'CloudTrail 등 사용 기록에서 의심스러운 활동을 확인하세요. 실제 수행한 조치와 내부 기록 번호를 저장한 뒤 위치 재검사와 키 폐기·교체 확인을 진행하세요.' : github ? '접근 가능한 GitHub 감사·보안 기록과 저장소 활동에서 의심스러운 사용을 확인하세요. 실제 수행한 조치와 내부 기록 번호를 저장한 뒤 재검사하세요.' : notion ? '열람 가능한 페이지 활동과 워크스페이스 감사 기록을 확인하세요. 기록 접근이 제한되면 확인 범위를 남기고 조치 기록과 재검사를 진행하세요.' : '공급자의 사용 기록을 확인하고 실제 조치와 내부 기록 번호를 저장한 뒤 재검사하세요.' },
    ],
    notice: '가이드는 조치 절차를 안내해요. 실제 키 변경은 담당자가 발급자에서 수행하며, 가이드를 읽는 것만으로 조치·심각도·해결 상태를 확정하지 않아요.',
  }
}
