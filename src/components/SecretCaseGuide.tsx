import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { requestSecretCaseGuide, type SecretCaseGuide as Guide } from '@/api/secretCaseGuide'
import type { SecretCaseDetail } from '@/api/secretCases'

export function SecretCaseGuide({ detail }: { detail: SecretCaseDetail }) {
  const [guide, setGuide] = useState<Guide | null>(null)
  const request = useMutation({
    mutationFn: () => requestSecretCaseGuide(detail.caseId),
    onSuccess: setGuide,
  })

  const errorMessage = request.error instanceof ApiError && request.error.status === 403
    ? '이 대응 건의 가이드를 조회할 권한이 없어요. 보안 담당자 또는 지정된 조치 담당자인지 확인해 주세요.'
    : request.error instanceof ApiError && request.error.status === 404
      ? '현재 대응 건을 찾지 못했어요. 목록을 새로 조회해 주세요.'
      : '대응 가이드를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'

  return <section className="secret-case-guide" aria-labelledby="secret-case-guide-title">
    <div className="secret-case-guide-heading">
      <div>
        <h3 id="secret-case-guide-title">대응 가이드</h3>
        <p className="caption">사례의 마스킹된 정보와 정해진 절차를 바탕으로 확인할 항목을 제시해요. 키 원문은 입력하거나 보내지 않아요.</p>
      </div>
      <button className="btn outline" type="button" disabled={request.isPending} onClick={() => request.mutate()}>
        {request.isPending ? '가이드 불러오는 중…' : guide ? '가이드 다시 보기' : '대응 가이드 보기'}
      </button>
    </div>
    {request.isError && <p className="notice error" role="alert">{errorMessage}</p>}
    {guide && <div className="secret-case-guide-result" role="region" aria-label="대응 가이드 결과">
      <div className="secret-case-guide-result-heading">
        <h4>{guide.title}</h4>
        <span className={`secret-case-guide-source ${guide.source.toLowerCase()}`}>{guide.source === 'GROQ' ? 'AI 보조 가이드' : '기본 가이드'}</span>
      </div>
      <p className="caption">가이드 버전: {guide.version}</p>
      <ol>{guide.steps.map((step, index) => <li key={`${step.code}-${index}`}>
        <strong>{step.title}</strong>
        <p>{step.description}</p>
      </li>)}</ol>
      <p className="notice">{guide.notice}</p>
    </div>}
  </section>
}
