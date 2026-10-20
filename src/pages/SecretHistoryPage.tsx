import { useEffect, useRef, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { fetchSecretRuns, requestSecretScan, type RunFilters } from '@/api/secretRuns'
import { fetchSecretConnections } from '@/api/secrets'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { PageHeader } from '@/components/PageHeader'
import { hasScopeAggregation, kstInput, kstInputToUtc, parseRunFilters, positiveId, runFilterSearch, scanDate, scanDetailPath, scanDuration, scanPlatforms, scanReason, scanStatus, scanStatuses, scanTypes, terminalRunStatuses } from '@/lib/secretScan'
import './secret-scan.css'

export function SecretHistoryPage() {
  const [params, setParams] = useSearchParams()
  const { filters, errors } = parseRunFilters(params)
  const legacyId = positiveId(params.get('run'))
  if (legacyId) return <Navigate replace to={scanDetailPath(legacyId, filters)} />
  return <HistoryList filters={filters} errors={errors} params={params} setParams={setParams} />
}

function HistoryList({ filters, errors, params, setParams }: {
  filters: RunFilters; errors: string[]; params: URLSearchParams; setParams: (params: URLSearchParams) => void
}) {
  const queryClient = useQueryClient()
  const [selection, setSelection] = useState<number | null>(null)
  const [confirm, setConfirm] = useState(false)
  const confirmationRef = useRef<HTMLHeadingElement>(null)
  const requestKey = useRef('')
  const restored = useRef('')
  const [from, setFrom] = useState(kstInput(params.get('from')))
  const [to, setTo] = useState(kstInput(params.get('to')))
  useEffect(() => { setFrom(kstInput(params.get('from'))); setTo(kstInput(params.get('to'))) }, [params])
  const history = useQuery({
    queryKey: ['secret-runs', filters], queryFn: () => fetchSecretRuns(filters), enabled: !errors.length,
    placeholderData: keepPreviousData,
    refetchInterval: (query) => query.state.error || !query.state.data?.items.some((item) => !terminalRunStatuses.has(item.status)) ? false : 5000,
  })
  const connections = useQuery({ queryKey: ['secret-connections'], queryFn: fetchSecretConnections })
  const available = connections.data?.items ?? []
  const selected = available.find((item) => item.connectionId === selection) ?? available[0]
  const start = useMutation({
    mutationFn: requestSecretScan,
    onSuccess: (accepted) => {
      setConfirm(false)
      void queryClient.invalidateQueries({ queryKey: ['secret-runs'] })
      setAcceptedId(accepted.runId)
    },
  })
  const [acceptedId, setAcceptedId] = useState<number | null>(null)
  const focusKey = `secret-history-focus:${runFilterSearch(filters)}`
  useEffect(() => {
    if (!history.isSuccess || history.isPlaceholderData) return
    let focus = positiveId(params.get('focus'))
    try { focus ??= positiveId(sessionStorage.getItem(focusKey)) } catch { /* Focus restoration must not block navigation. */ }
    if (!focus || restored.current === `${focusKey}:${focus}`) return
    const link = document.getElementById(`scan-link-${focus}`)
    if (link) {
      link.focus({ preventScroll: true }); link.scrollIntoView({ block: 'center' })
      restored.current = `${focusKey}:${focus}`
      try { sessionStorage.removeItem(focusKey) } catch { /* Storage can be disabled. */ }
    }
  }, [history.isSuccess, history.isPlaceholderData, history.data, params, focusKey])
  useEffect(() => { if (confirm) confirmationRef.current?.focus() }, [confirm])
  if (acceptedId) return <Navigate to={scanDetailPath(acceptedId, { ...filters, page: 0 })} />
  const change = (key: keyof RunFilters, value: string) => {
    const next = runFilterSearch({ ...filters, page: 0 })
    if (value) next.set(key, value); else next.delete(key)
    setParams(next)
  }
  const remember = (runId: number) => {
    try { sessionStorage.setItem(focusKey, String(runId)) } catch { /* Optional browser-only navigation context. */ }
  }
  const items = history.data?.items ?? []
  const pages = history.data ? Math.ceil(history.data.total / history.data.size) : 0
  return <>
    <PageHeader title="스캔 이력" description="언제 어디까지 검사했고, 어떤 범위가 누락됐는지 확인하세요." actions={
      <button className="btn primary" type="button" disabled={!selected || start.isPending} onClick={() => { requestKey.current = crypto.randomUUID(); start.reset(); setConfirm(true) }}><Icon name="search" /> 스캔 요청</button>
    } />
    <section className="card secret-scan-filters" aria-label="실행 이력 필터">
      <label>실행 유형<select className="select" value={filters.type} onChange={(e) => change('type', e.target.value)}>{Object.entries(scanTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>실행 상태<select className="select" value={filters.status} onChange={(e) => change('status', e.target.value)}><option value="">전체 상태</option>{Object.entries(scanStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>수집 플랫폼<select className="select" value={filters.provider} onChange={(e) => change('provider', e.target.value)}><option value="">전체 플랫폼</option>{Object.entries(scanPlatforms).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>연결<select className="select" value={filters.connectionId ?? ''} onChange={(e) => change('connectionId', e.target.value)}><option value="">전체 연결</option>{available.map((item) => <option key={item.connectionId} value={item.connectionId}>{item.displayName}</option>)}{filters.connectionId && !available.some((item) => item.connectionId === filters.connectionId) && <option value={filters.connectionId}>연결 #{filters.connectionId}</option>}</select></label>
      <form className="secret-scan-period" onSubmit={(e) => { e.preventDefault(); const next = runFilterSearch({ ...filters, page: 0 }); if (from) next.set('from', kstInputToUtc(from)); else next.delete('from'); if (to) next.set('to', kstInputToUtc(to)); else next.delete('to'); setParams(next) }}>
        <label>요청 시작 (KST)<input className="input" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>요청 종료 (KST·미포함)<input className="input" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button className="btn outline" type="submit">기간 적용</button>
      </form>
      <button className="btn outline" onClick={() => setParams(new URLSearchParams())}>필터 초기화</button>
    </section>
    {!!errors.length && <p className="notice error" role="alert">{errors.join(' ')} <button className="btn outline" onClick={() => setParams(new URLSearchParams())}>조건 초기화</button></p>}
    {connections.isError && <p className="notice error" role="alert">실행 가능한 연결 목록을 불러오지 못했어요. <button className="btn outline" onClick={() => void connections.refetch()}>다시 조회</button></p>}
    {confirm && <section className="card secret-scan-confirm" aria-labelledby="scan-confirm-title">
      <h2 id="scan-confirm-title" ref={confirmationRef} tabIndex={-1}>승인된 범위를 검사할까요?</h2>
      <label>검사할 연결<select className="select" value={selected?.connectionId ?? ''} disabled={start.isPending} onChange={(e) => { setSelection(Number(e.target.value)); requestKey.current = crypto.randomUUID(); start.reset() }}>{available.map((item) => <option key={item.connectionId} value={item.connectionId}>{item.displayName}</option>)}</select></label>
      <p>{selected ? `${selected.displayName} · 승인 범위 ${selected.approvedScopeCount}개` : '검사 가능한 연결이 없어요.'}</p>
      <p className="caption">작업을 등록하면 별도 워커가 실행해요. 6시간 정기 검사 일정은 유지돼요.</p>
      {start.isError && <p className="notice error" role="alert">{start.error instanceof ApiError && start.error.status === 409 ? '연결의 승인 범위와 진행 중인 작업을 확인해 주세요.' : start.error instanceof ApiError && start.error.status === 403 ? '이 연결을 실행할 권한이 없어요.' : '작업 등록 여부를 확인하지 못했어요. 같은 요청으로 다시 확인할 수 있어요.'}</p>}
      <div className="row"><button className="btn primary" disabled={!selected || start.isPending} onClick={() => selected && start.mutate({ connectionId: selected.connectionId, idempotencyKey: requestKey.current })}>{start.isPending ? '등록 중…' : '스캔 등록'}</button><button className="btn outline" disabled={start.isPending} onClick={() => { setConfirm(false); document.querySelector<HTMLButtonElement>('.page-head button')?.focus() }}>취소</button></div>
    </section>}
    <section className="card list-card secret-history-list" aria-labelledby="history-title" aria-busy={history.isFetching}>
      <div className="card-head"><div><h2 id="history-title">실행 기록</h2><p className="caption">요청 시각 최신순{history.data?.asOf ? ` · 기준 ${scanDate(history.data.asOf)}` : ''}</p></div></div>
      {errors.length ? null : history.isPending ? <p className="secret-scan-message" role="status">실행 이력을 불러오는 중이에요.</p> : history.isError ? <div className="secret-scan-message notice error" role="alert"><p>{history.error instanceof ApiError && history.error.status === 403 ? '이 실행 이력을 조회할 권한이 없어요.' : '실행 이력을 불러오지 못했어요.'}</p><button className="btn outline" onClick={() => void history.refetch()}>다시 조회</button></div> : items.length === 0 ? <EmptyState title="조건에 맞는 실행이 없어요" description="필터를 변경하거나 승인된 연결에 검사를 요청하세요." /> : <div className="table-scroll" tabIndex={0} role="region" aria-label="스캔 실행 기록. 좁은 화면에서는 가로로 스크롤하세요.">
        <table><thead><tr><th scope="col">실행</th><th scope="col">연결</th><th scope="col">실행 상태</th><th scope="col">범위 커버리지</th><th scope="col">수집 항목</th><th scope="col">시각</th><th scope="col">소요 시간</th><th scope="col">다음 행동</th></tr></thead><tbody>{items.map((item) => <tr key={item.runId}>
          <td><Link id={`scan-link-${item.runId}`} to={scanDetailPath(item.runId, filters)} onClick={() => remember(item.runId)}><strong>SCAN-{item.runId}</strong></Link><span className="asset">{scanTypes[item.triggerType] ?? '유형 미확인'}</span></td>
          <td>{scanPlatforms[item.provider] ?? '플랫폼 미확인'}<span className="asset">{item.safeDisplayAlias ?? item.displayName ?? `연결 #${item.connectionId}`}</span></td>
          <td><span className={`secret-run-badge ${item.status.toLowerCase()}`}>{scanStatus(item.status)}</span>{item.failureCode && <span className="asset">{scanReason(item.failureCode)}</span>}</td>
          <td>{hasScopeAggregation(item) ? <><strong>성공 {item.successfulScopeCount} / {item.scopeCount}</strong><span className="asset">부분 {item.scopeStatusCounts?.PARTIAL ?? '—'} · 실패 {item.scopeStatusCounts?.FAILED ?? '—'} · 건너뜀 {item.scopeStatusCounts?.SKIPPED ?? '—'}</span>{!terminalRunStatuses.has(item.status) && <span className="asset">대기 {item.scopeStatusCounts?.PENDING ?? '—'} · 진행 {item.scopeStatusCounts?.RUNNING ?? '—'}</span>}</> : '집계 확인 불가'}</td>
          <td>{item.collectedObjectCount != null && item.collectedObjectCount > 0 ? `${item.collectedObjectCount}개 확인` : hasScopeAggregation(item) && item.gapScopeCount === 0 && item.status === 'SUCCEEDED' && item.collectedObjectCount === 0 ? '0개 확인' : '확인 불가'}{(item.gapScopeCount ?? 0) > 0 && <span className="asset">일부 범위 미확인</span>}</td>
          <td>{scanDate(item.startedAt ?? item.requestedAt)}<span className="asset">{item.startedAt ? '시작' : '요청'}{item.finishedAt ? ` · 종료 ${scanDate(item.finishedAt)}` : ''}</span></td><td>{scanDuration(item.startedAt, item.finishedAt)}</td>
          <td><Link className="secret-history-detail-button" to={scanDetailPath(item.runId, filters)} onClick={() => remember(item.runId)}>상세 보기 <Icon name="chevron" /></Link></td>
        </tr>)}</tbody></table>
      </div>}
      {history.isSuccess && !errors.length && <div className="table-foot secret-table-foot"><span>조건에 맞는 전체 실행 {history.data.total}회 · 현재 {items.length}회 표시</span><div className="row"><button className="btn outline" disabled={filters.page === 0} onClick={() => setParams(runFilterSearch({ ...filters, page: filters.page - 1 }))}>이전</button><span>{filters.page + 1} / {Math.max(pages, 1)}</span><button className="btn outline" disabled={filters.page + 1 >= pages || history.isPlaceholderData} onClick={() => setParams(runFilterSearch({ ...filters, page: filters.page + 1 }))}>다음</button></div></div>}
    </section>
    <p className="secret-history-footnote"><Icon name="clock" /> 수집 완료와 키 유효성 검증은 별개예요. 단계별 적용 여부는 실행 상세에서 확인하세요.</p>
  </>
}
