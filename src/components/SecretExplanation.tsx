import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { contextualExplanationPath } from '@/lib/secretDetailNavigation'
import { ApiError } from '@/api/client'
import { fetchSecretExplanation, requestSecretExplanation, type SecretExplanationTopic } from '@/api/secretExplanation'
import { scanDate } from '@/lib/secretScan'
import { guideReasonMessage } from '@/lib/secretCaseGuide'
import './secret-explanation.css'

const documentHosts = new Set(['docs.github.com', 'docs.aws.amazon.com', 'developers.notion.com', 'www.notion.com', 'www.notion.so'])

function approvedDocumentUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (!url.port || url.port === '443') && !url.username && !url.password && documentHosts.has(url.hostname)
  } catch { return false }
}

function ExplanationContent({ topic, id, contextVersion }: {
  topic: SecretExplanationTopic; id: number; contextVersion?: string | number
}) {
  const location = useLocation()
  const baseline = useQuery({
    queryKey: ['secret-explanation', topic, id, contextVersion ?? null],
    queryFn: () => fetchSecretExplanation(topic, id),
    retry: false,
    refetchOnWindowFocus: false,
  })
  const request = useMutation({ mutationFn: () => requestSecretExplanation(topic, id) })
  const denied = [baseline.error, request.error].some((error) => error instanceof ApiError && [401, 403, 404].includes(error.status))
  if (denied) return null

  const result = request.data ?? baseline.data
  if (!result || result.topic !== topic) return <section className="secret-explanation" role="status">
    <h2>{topic === 'SCAN' ? '검사 결과 안내' : '지금 할 일'}</h2>
    <p>{baseline.isPending ? '현재 상태를 정리하고 있어요.' : '현재 상태의 설명을 불러오지 못했어요.'}</p>
    {baseline.isError && <button className="btn outline" onClick={() => void baseline.refetch()}>설명 다시 조회</button>}
  </section>

  const actions = result.actions.filter((action) => /^\/secrets(?:\/|\?|$)/.test(action.href) && !action.href.includes('\\')).slice(0, 3)
  const documents = result.documents.filter((document) => approvedDocumentUrl(document.url))
  const readiness = result.readiness
  const available = readiness.aiAvailable && readiness.status !== 'UNAVAILABLE'
  const waiting = ['REQUEST_IN_PROGRESS', 'CALL_BUDGET_EXHAUSTED', 'CONTEXT_CHANGED'].includes(readiness.reasonCode)
  const usedFallback = readiness.status === 'FALLBACK' || request.isError

  return <section className="secret-explanation" aria-label={topic === 'SCAN' ? '검사 결과 안내' : '현재 조치 안내'}>
    <div className="secret-explanation-heading">
      <h2>{topic === 'SCAN' ? '검사 결과 안내' : '지금 할 일'}</h2>
      <span>{result.source === 'CLAUDE' ? 'Claude 설명' : '기본 안내'}</span>
    </div>
    <p className="secret-explanation-summary">{result.summary}</p>
    {result.facts.length > 0 && <ul className="secret-explanation-facts" aria-label="현재 확인된 사실">
      {result.facts.map((fact) => <li key={fact.code}>{fact.label}</li>)}
    </ul>}
    {actions.length > 0 && <div className="secret-explanation-actions">
      {actions.map((action, index) => <Link key={action.code} className={`btn ${index === 0 ? 'primary' : 'outline'}`} to={contextualExplanationPath(action.href, location.pathname, location.search)}>{action.label}</Link>)}
    </div>}
    <div className="secret-explanation-assist">
      {available && <button className="btn outline" disabled={request.isPending || baseline.isFetching || waiting}
        onClick={() => request.mutate()}>{request.isPending ? '설명 정리 중…' : 'Claude로 설명 정리'}</button>}
      {usedFallback && <p role="status">현재 기본 안내를 표시하고 있어요.</p>}
      <details><summary>설명 근거와 사용 정보</summary>
        <dl><div><dt>안내 버전</dt><dd>{result.version}</dd></div>
          {readiness.generatedAt && <div><dt>생성 시각</dt><dd>{scanDate(readiness.generatedAt)}</dd></div>}
          {readiness.model && <div><dt>모델</dt><dd>{readiness.model}</dd></div>}
          <div><dt>요청 상태</dt><dd>{readiness.cached ? '이전 설명 재사용' : readiness.providerCalled ? 'Claude 요청 실행' : '기본 안내 조회'}</dd></div>
        </dl>
        <p>서비스·키 유형·검사 상태·사유·허용 작업의 분류값으로 설명을 구성해요. 실제 대상과 작업 권한은 서버에서 확인해요.</p>
        <p>{guideReasonMessage(readiness.reasonCode)}</p>
        {documents.length > 0 && <ul className="secret-explanation-documents">{documents.map((document) => <li key={document.id}>
          <a href={document.url} target="_blank" rel="noopener noreferrer">{document.title}</a>
          {document.reviewedAt && <small>검토 {scanDate(document.reviewedAt)}</small>}
        </li>)}</ul>}
      </details>
    </div>
  </section>
}

export function SecretExplanation(props: { topic: SecretExplanationTopic; id: number; contextVersion?: string | number }) {
  return <ExplanationContent key={`${props.topic}:${props.id}:${props.contextVersion ?? ''}`} {...props} />
}
