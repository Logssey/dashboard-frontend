import { useMutation, useQuery } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { fetchSecretCaseGuide, requestSecretCaseGuide, type SecretCaseGuide as Guide } from '@/api/secretCaseGuide'
import type { SecretCaseDetail } from '@/api/secretCases'
import { canRequestGuideAi, guideModelName, guideProviderName, guideReadinessMessage, immediateSecretCaseGuide } from '@/lib/secretCaseGuide'
import { scanDate } from '@/lib/secretScan'

export function GuideResult({ guide }: { guide: Guide }) {
  const generated = guide.source === 'CLAUDE' || guide.source === 'GROQ'
  const provider = guideProviderName(guide)
  const model = guideModelName(guide)
  return <div className="secret-case-guide-result" role="region" aria-label="대응 가이드 결과">
    <div className="secret-case-guide-result-heading"><h4>{guide.title}</h4><span className={`secret-case-guide-source ${guide.source.toLowerCase()}`}>{generated ? `${provider} 가이드` : '기본 가이드'}</span></div>
    <ol>{guide.steps.map((step, index) => <li key={`${step.code}-${index}`}><strong>{index + 1}. {step.title}</strong><p>{step.description}</p></li>)}</ol>
    <p className="notice">{guide.notice}</p>
    <details>
      <summary>가이드 생성·확인 정보</summary>
      <dl className="secret-case-guide-metadata">
        <div><dt>가이드 버전</dt><dd>{guide.version}</dd></div>
        {provider !== 'AI' && <div><dt>제공자</dt><dd>{provider}</dd></div>}
        {model && <div><dt>모델</dt><dd>{model}</dd></div>}
        {guide.readiness?.generatedAt && <div><dt>생성 시각</dt><dd>{scanDate(guide.readiness.generatedAt)}</dd></div>}
      </dl>
      {guide.readiness && <p className="caption">{guide.readiness.cached ? generated ? `이전에 생성한 ${provider} 결과 재사용` : '이전 요청 상태 확인 · 기본 가이드 사용' : guide.readiness.providerCalled ? `${provider} 요청 실행${generated ? ' · 가이드 생성' : ' · 기본 가이드 사용'}` : '기본 가이드 조회'}</p>}
    </details>
  </div>
}

export function SecretCaseGuide({ detail }: { detail: SecretCaseDetail }) {
  const baseline = useQuery({ queryKey: ['secret-case-guide', detail.caseId, detail.version], queryFn: () => fetchSecretCaseGuide(detail.caseId), retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false })
  const request = useMutation({ mutationFn: () => requestSecretCaseGuide(detail.caseId) })
  const guide = request.data ?? baseline.data ?? immediateSecretCaseGuide(detail)
  const provider = guideProviderName(guide)
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
        <h3 id={`secret-case-guide-title-${detail.caseId}`}>{provider === 'AI' ? '대응 가이드' : `${provider} 대응 가이드`}</h3>
        <p className="caption">발급자와 현재 상태에 맞는 대응 순서를 제안해요. 버튼을 누르면 가이드를 생성해요.</p>
      </div>
      <button className="btn outline" type="button" disabled={baseline.isFetching || request.isPending} onClick={refresh}>
        가이드 상태 새로고침
      </button>
    </div>
    {error && <p className="notice error" role="alert">{errorMessage}</p>}
    {!denied && <>
      <GuideResult guide={guide} />
      <div className="secret-case-guide-ai">
        <p id={`guide-ai-help-${detail.caseId}`} role="status">{baseline.isPending ? '가이드 사용 조건을 확인하는 중이에요. 기본 절차는 바로 사용할 수 있어요.' : guideReadinessMessage(guide)}</p>
        <button className="btn outline" type="button" aria-describedby={`guide-ai-help-${detail.caseId}`} disabled={baseline.isFetching || request.isPending || !canRequestGuideAi(guide)} onClick={() => request.mutate()}>{request.isPending ? `${provider} 가이드 생성 중…` : `${provider}로 가이드 생성`}</button>
        <p className="caption">발급자·키 유형·구성·진행 단계·인증 상태를 전달해요. 제안된 절차를 현재 근거와 비교해 검토하세요.</p>
      </div>
    </>}
  </section>
}
