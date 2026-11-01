import { useMutation, useQuery } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { fetchSecretCaseGuide, requestSecretCaseGuide, type SecretCaseGuide as Guide } from '@/api/secretCaseGuide'
import type { SecretCaseDetail } from '@/api/secretCases'
import { canRequestGuideAi, guideReadinessMessage, immediateSecretCaseGuide } from '@/lib/secretCaseGuide'

export function GuideResult({ guide }: { guide: Guide }) {
  return <div className="secret-case-guide-result" role="region" aria-label="대응 가이드 결과">
    <div className="secret-case-guide-result-heading"><h4>{guide.title}</h4><span className={`secret-case-guide-source ${guide.source.toLowerCase()}`}>{guide.source === 'GROQ' ? 'AI 보조 가이드' : '기본 가이드'}</span></div>
    <ol>{guide.steps.map((step, index) => <li key={`${step.code}-${index}`}><strong>{index + 1}. {step.title}</strong><p>{step.description}</p></li>)}</ol>
    <p className="notice">{guide.notice}</p>
    <details><summary>가이드 생성·확인 정보</summary><p className="caption">가이드 버전: {guide.version}</p>{guide.readiness && <p className="caption">{guide.readiness.aiRequested ? 'AI 보조 요청함' : '기본 가이드 조회'} · {guide.readiness.cached ? guide.source === 'GROQ' ? '저장된 AI 결과 사용' : '이전 요청 상태 사용 · AI 제공자 호출 안 함' : guide.readiness.providerCalled ? 'AI 제공자 호출함' : 'AI 제공자 호출 안 함'}</p>}</details>
  </div>
}

export function SecretCaseGuide({ detail }: { detail: SecretCaseDetail }) {
  const baseline = useQuery({ queryKey: ['secret-case-guide', detail.caseId, detail.version], queryFn: () => fetchSecretCaseGuide(detail.caseId), retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false })
  const request = useMutation({ mutationFn: () => requestSecretCaseGuide(detail.caseId) })
  const guide = request.data ?? baseline.data ?? immediateSecretCaseGuide(detail)
  const error = request.error ?? baseline.error
  const denied = error instanceof ApiError && [403, 404].includes(error.status)
  const errorMessage = error instanceof ApiError && error.status === 403
    ? '이 대응 건의 가이드를 조회할 권한이 없어요. 보안 담당자 또는 지정된 조치 담당자인지 확인해 주세요.'
    : error instanceof ApiError && error.status === 404
      ? '현재 대응 건을 찾지 못했어요. 목록을 새로 조회해 주세요.'
      : request.isError ? 'AI 보조 요청 결과를 받지 못했어요. 기본 절차를 사용하고 상태를 다시 조회하세요.' : '서버 가이드를 불러오지 못했어요. 아래 기본 절차를 사용하고 상태를 다시 조회하세요.'
  const refresh = () => { request.reset(); void baseline.refetch() }

  return <section className="secret-case-guide" aria-labelledby={`secret-case-guide-title-${detail.caseId}`}>
    <div className="secret-case-guide-heading">
      <div>
        <h3 id={`secret-case-guide-title-${detail.caseId}`}>대응 가이드</h3>
        <p className="caption">기본 절차는 바로 확인할 수 있어요. AI 보조는 버튼으로 요청할 때만 사용하며, 키 원문은 입력하거나 보내지 않아요.</p>
      </div>
      <button className="btn outline" type="button" disabled={baseline.isFetching || request.isPending} onClick={refresh}>
        가이드 상태 다시 조회
      </button>
    </div>
    {error && <p className="notice error" role="alert">{errorMessage}</p>}
    {!denied && <><GuideResult guide={guide} /><div className="secret-case-guide-ai"><p id={`guide-ai-help-${detail.caseId}`} role="status">{baseline.isPending ? 'AI 사용 조건을 확인하는 중이에요. 기본 절차는 바로 사용할 수 있어요.' : guideReadinessMessage(guide)}</p><button className="btn outline" type="button" aria-describedby={`guide-ai-help-${detail.caseId}`} disabled={baseline.isFetching || request.isPending || !canRequestGuideAi(guide)} onClick={() => request.mutate()}>{request.isPending ? 'AI 보조 요청 중…' : 'AI 보조 가이드 요청'}</button><p className="caption">발급자·키 유형·진행 단계 같은 분류 정보와 절차 코드만 전달해요. AI 응답은 실제 권한이나 조치 완료의 확인 자료로 사용하지 않아요.</p></div></>}
  </section>
}
