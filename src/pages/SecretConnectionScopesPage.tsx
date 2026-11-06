import { useEffect, useRef } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { fetchManagedScopes } from '@/api/secretConnections'
import { withSecretOrigin } from '@/lib/secretNavigation'
import { AttemptLink } from './SecretConnectionsPage'
import { positiveId, scanDate, scanReason, scopeTypeLabel } from '@/lib/secretScan'
import { safeWorkbenchReturn } from '@/lib/secretWorkbench'
import { SecretScopeAliasForm } from '@/components/SecretScopeAliasForm'
import './secret-connections.css'
import './secret-scan.css'
import './secret-governance.css'
import './secret-scope-workspace.css'

const freshnessLabel = { CURRENT: '현재 승인 범위 확인', OVERDUE: '검사 지연', NEVER_SCANNED: '검사 전', NOT_SCHEDULED: '정기 일정 없음', UNKNOWN: '확인 불가' }
const originLabel: Record<string, string> = { PRODUCTION: '운영', TEST: '시험', UNCLASSIFIED: '미분류' }
export function SecretConnectionScopesPage() {
  const { connectionId: rawId } = useParams()
  const connectionId = positiveId(rawId)
  const [params, setParams] = useSearchParams()
  const title = useRef<HTMLHeadingElement>(null)
  const restored = useRef(false)
  const page = (positiveId(params.get('page')) ?? 1) - 1
  const origin = params.get('origin') ?? ''
  const gapOnly = params.get('gapOnly') === 'true'
  const valid = connectionId != null && ['', 'PRODUCTION', 'TEST', 'UNCLASSIFIED'].includes(origin)
  const scopes = useQuery({ queryKey: ['secret-connection-scopes', connectionId, page, origin, gapOnly], queryFn: () => fetchManagedScopes(connectionId!, page, origin, gapOnly), enabled: valid, placeholderData: keepPreviousData,
    retry: (count, error) => !(error instanceof ApiError && [403, 404].includes(error.status)) && count < 1,
    refetchInterval: (query) => query.state.error || !query.state.data?.items.some((item) => item.coverage?.isRunning) ? false : 5000,
  })
  useEffect(() => { title.current?.focus(); window.scrollTo({ top: 0 }) }, [connectionId])
  useEffect(() => {
    const scopeId = positiveId(params.get('scopeId'))
    if (!scopes.isSuccess || scopes.isPlaceholderData || !scopeId || restored.current) return
    const row = document.getElementById(`scope-${scopeId}`)
    if (row) { row.focus({ preventScroll: true }); row.scrollIntoView({ block: 'center' }); restored.current = true }
  }, [params, scopes.isSuccess, scopes.isPlaceholderData, scopes.data])
  const change = (key: string, value: string) => { const next = new URLSearchParams(params); next.set('page', '1'); if (value) next.set(key, value); else next.delete(key); setParams(next) }
  const items = scopes.data?.items ?? []
  return <>
    <Link className="secret-scan-back" to={params.get('return') === 'workbench' ? safeWorkbenchReturn(params.get('returnQuery'), params.get('scopeId') ?? undefined) : withSecretOrigin('/secrets/connections', params)}>← 목록으로 돌아가기</Link>
    <section className="page-head"><div><h1 ref={title} tabIndex={-1}>연결 {connectionId ? `#${connectionId} ` : ''}검사 대상</h1><p className="subtitle">현재 승인 버전에서 실제로 어디까지 읽었는지 확인하세요.</p></div>{connectionId && <Link className="btn outline" to={withSecretOrigin(`/secrets/history?connectionId=${connectionId}`, params)}>연결의 실행 이력</Link>}</section>
    <div className="secret-connection-info"><span aria-hidden="true">ⓘ</span><span>인증 확인과 읽기 성공은 별개예요. 최근 시도와 마지막 완전 성공을 구분하며, 이전 버전의 성공을 현재 범위에 재사용하지 않아요.</span></div>
    <div className="card secret-scan-filters"><label>출처<select className="select" value={origin} onChange={(e) => change('origin', e.target.value)}><option value="">전체 출처</option>{Object.entries(originLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="secret-scope-gap-filter"><input type="checkbox" checked={gapOnly} onChange={(e) => change('gapOnly', e.target.checked ? 'true' : '')} /> 검사 누락만 보기</label></div>
    {!valid ? <div className="card secret-scan-message" role="alert">연결 주소 또는 조회 조건이 올바르지 않아요.</div> : scopes.isPending ? <p className="card secret-scan-message" role="status">승인 범위와 읽기 상태를 불러오는 중이에요.</p> : scopes.isError ? <div className="card secret-scan-message" role="alert"><h2>{scopes.error instanceof ApiError && scopes.error.status === 403 ? '범위를 조회할 권한이 없어요' : scopes.error instanceof ApiError && scopes.error.status === 404 ? '연결을 찾을 수 없어요' : '승인 범위를 불러오지 못했어요'}</h2>{!(scopes.error instanceof ApiError && [403, 404].includes(scopes.error.status)) && <button className="btn outline" onClick={() => void scopes.refetch()}>다시 조회</button>}</div> : <section className="card list-card secret-history-list" aria-labelledby="scope-list-title" aria-busy={scopes.isFetching}><div className="card-head"><div><h2 id="scope-list-title">검사 대상별 읽기 결과</h2><p className="caption">{scopes.data.total}개 범위{scopes.data.asOf ? ` · 기준 ${scanDate(scopes.data.asOf)}` : ''}</p></div></div>
      {!items.length ? <p className="secret-scan-message">조건에 맞는 승인 범위가 없어요. 검사 성공이나 안전을 뜻하지 않아요.</p> : <div className="table-scroll" tabIndex={0} role="region" aria-label="검사 대상별 읽기 결과"><table className="secret-coverage-table"><thead><tr><th scope="col">승인 범위</th><th scope="col">현재 확인 상태</th><th scope="col">최근 시도</th><th scope="col">마지막 완전 성공</th><th scope="col">누락·다음 검사</th></tr></thead><tbody>{items.map((scope) => {
        const coverage = scope.coverage
        return <tr id={`scope-${scope.scopeId}`} tabIndex={-1} key={scope.scopeId}><td><strong>{scope.safeDisplayAlias ?? `범위 #${scope.scopeId}`}</strong><span className="asset">{scopeTypeLabel(scope.contentType)}{scope.region ? ` · ${scope.region}` : ''}</span>{['NOTION_PAGE_CONTENT', 'NOTION_PAGE_BLOCKS'].includes(scope.contentType) && <span className="asset">현재 페이지 텍스트 · 하위 페이지·외부 본문은 별도 대상</span>}<span className="asset">승인 버전 {scope.scopeRevision ?? '미기록'} · {originLabel[scope.origin] ?? '출처 미확인'}</span>{(scope.origin === 'UNCLASSIFIED' || scope.classificationStatus === 'NEEDS_REVIEW') && <span className="asset">출처·정책 확인 항목 있음</span>}<span className="asset"><Link to={withSecretOrigin(`/secrets/connections/${connectionId}/scopes/${scope.scopeId}`, params)} className="secret-scope-settings-link">출처·보관 규칙 확인</Link></span><SecretScopeAliasForm key={`${scope.scopeId}:${scope.scopeRevision}:${scope.aliasVersion}`} scope={scope} disabled={scopes.isPlaceholderData || scopes.isFetching} onReload={() => void scopes.refetch()} /><span className="asset"><Link to={withSecretOrigin(`/secrets/connections/${connectionId}/scopes/${scope.scopeId}?settings=validation`, params)}>키 유효성 검증 설정</Link></span></td><td><strong>{coverage ? freshnessLabel[coverage.freshness] ?? '확인 불가' : '확인 불가'}</strong>{coverage?.isPaused && <span className="asset">일시중지</span>}{coverage?.isRunning && <span className="asset">검사 진행 중 · 기존 누락은 유지</span>}</td><td><AttemptLink attempt={coverage?.lastAttempt} origin={origin} /></td><td><AttemptLink attempt={coverage?.lastSuccessfulScan} origin={origin} /></td><td>{coverage?.gapReasonCodes?.length ? <ul className="secret-coverage-reasons">{coverage.gapReasonCodes.map((code) => <li key={code}>{scanReason(code)}</li>)}</ul> : <span>{coverage?.freshness === 'CURRENT' ? '현재 확인된 검사 누락 없음' : '누락 근거 미확인'}</span>}<span className="asset">다음 예정 {coverage?.nextDueAt ? scanDate(coverage.nextDueAt) : '미확인'}</span>{coverage?.gapReasonCodes?.length > 0 && <details className="secret-scope-error-info"><summary>오류 정보</summary><ul>{coverage.gapReasonCodes.map((code) => <li key={code}><code>{code}</code></li>)}</ul>{coverage.lastAttempt && <p>최근 실행 SCAN-{coverage.lastAttempt.runId}</p>}</details>}</td></tr>
      })}</tbody></table></div>}
      <div className="table-foot secret-table-foot"><span>현재 {items.length}개 표시</span><div className="row"><button className="btn outline" disabled={page === 0} onClick={() => { const next = new URLSearchParams(params); next.set('page', String(page)); setParams(next) }}>이전</button><span>{page + 1} / {Math.max(1, Math.ceil(scopes.data.total / scopes.data.size))}</span><button className="btn outline" disabled={(page + 1) * scopes.data.size >= scopes.data.total || scopes.isPlaceholderData} onClick={() => { const next = new URLSearchParams(params); next.set('page', String(page + 2)); setParams(next) }}>다음</button></div></div>
    </section>}
  </>
}
