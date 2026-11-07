import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type { KeyLocation, SecretDetail } from '@/api/secrets'
import { fetchSecretUsage, fetchUsageRequest, type UsageObservation, type UsageRequest } from '@/api/secretUsage'
import { safeMutationMessage } from '@/lib/secretEvidence'
import { positiveId, scanDate } from '@/lib/secretScan'
import { activeUsageRequest, terminalUsageRequest, usageOperationLabel, usageActorLabel, usageBindingLabel, usageCoverageLabel, usageDecisionReasons, usageDecisions, usageObservationLabel, usageReason, usageRefLabel, usageRequestLabel, usageResultLabel, usageReviewLabel } from '@/lib/secretUsage'
import { SecretIamUsageMetadata } from './SecretIamUsageMetadata'
import { SecretUsageDecision, SecretUsageMaterialForm, SecretUsageRequestForm } from './SecretUsageForms'
import './secret-usage.css'

export function UsageRequestSummary({ request }: { request: UsageRequest }) {
  return <section className="secret-usage-summary" aria-label="사용 이력 조회 결과"><div className="secret-usage-summary-title"><h3>{usageRequestLabel(request.status)}</h3><span>{usageObservationLabel(request.observationStatus)}</span></div>
    {!request.currentApplicable && <p className="notice">이전 조회 조건의 기록이에요. 현재 키·승인 범위에 적용되는 자료는 다시 확인하세요.</p>}
    <dl className="secret-usage-facts"><div><dt>조회 기간</dt><dd>{scanDate(request.windowStart)} ~ {scanDate(request.windowEnd)}</dd></div><div><dt>조회 대상</dt><dd>{request.target.accountRef} · {request.target.region}</dd></div><div><dt>확인 범위</dt><dd>{usageCoverageLabel(request.coverageStatus)}</dd></div><div><dt>키 연결</dt><dd>{usageBindingLabel(request.bindingLevel)}</dd></div><div><dt>조회 이벤트</dt><dd>{Number.isSafeInteger(request.eventCount) && request.eventCount >= 0 ? `${request.eventCount}건` : '집계 미확인'}</dd></div><div><dt>마지막 처리 시각</dt><dd>{scanDate(request.completedAt ?? request.startedAt ?? request.requestedAt)}</dd></div></dl>
    {request.observationStatus === 'NOT_OBSERVED_IN_SCOPE' && <p className="caption">이 기간·계정·리전의 관리 이벤트에서 관측된 기록이 0건이에요. 범위 밖의 사용은 추가 자료가 필요해요.</p>}
    {request.coverageStatus === 'PARTIAL' && <p className="notice">읽은 자료는 보존했어요. 실패·누락 범위가 남아 있어 전체 사용 여부를 결론내릴 수 없어요.</p>}
    {request.bindingLevel === 'PRINCIPAL_ONLY' && <p className="caption">사용자·앱 수준의 자료예요. 같은 주체의 다른 키 기록일 수 있어요.</p>}
    {request.reasonCodes.length > 0 && <ul className="secret-safe-reasons">{[...new Set(request.reasonCodes.map(usageReason))].map((reason) => <li key={reason}>{reason}</li>)}</ul>}
    <p className="caption">CloudTrail 관리 이벤트 조회예요. S3 객체 읽기 같은 데이터 이벤트는 확인 범위 밖이에요.</p>
    {request.availableFrom && <p className="caption">조회 가능한 기록 시작 {scanDate(request.availableFrom)}</p>}
  </section>
}

export function UsageObservationDetail({ observation, disabled, onUpdated, onStale }: { observation: UsageObservation; disabled: boolean; onUpdated: (notice: string) => void; onStale: () => void }) {
  const collectionScope = observation.sourceKind === 'PROVIDER' ? observation.collectionScope : null
  return <section className="secret-usage-observation" aria-label="선택한 사용 자료"><h3>{usageOperationLabel(observation.operationCode, observation.actionCode)} · {usageResultLabel(observation.actionResult)}</h3>
    {observation.currentApplicable === false && <p className="notice">키·원천 또는 승인 범위가 변경되기 전의 자료예요. 과거 기록으로 보존하며 현재 자료의 수용·변경은 할 수 없어요.</p>}
    <dl className="secret-usage-facts"><div><dt>자료 출처</dt><dd>{observation.sourceKind === 'MANUAL' ? '담당자 수동 자료' : '공급자 관측'}</dd></div><div><dt>검토 상태</dt><dd>{usageReviewLabel(observation.reviewStatus)}</dd></div><div><dt>키 연결</dt><dd>{usageBindingLabel(observation.bindingLevel)}</dd></div><div><dt>확인 범위</dt><dd>{usageCoverageLabel(observation.coverageStatus)}</dd></div><div><dt>행위 시각</dt><dd>{scanDate(observation.eventAt)}</dd></div><div><dt>자료 기간</dt><dd>{scanDate(observation.windowStart)} ~ {scanDate(observation.windowEnd)}</dd></div><div><dt>사용 분류</dt><dd>{usageActorLabel(observation.actorAttribution)}</dd></div><div><dt>연결 근거</dt><dd>{observation.sourceRef ? usageRefLabel(observation.sourceRef) : '공급자 조회 근거'}</dd></div><div><dt>대상 참조</dt><dd>{observation.targetRef ? usageRefLabel(observation.targetRef) : '등록된 조회 범위'}</dd></div></dl>
    {observation.bindingLevel !== 'EXACT_CREDENTIAL' && <p className="notice">이 키가 사용됐다고 확정할 연결 근거가 부족해요. 자료 수용 후에도 표시된 연결 수준을 확인하세요.</p>}
    <dl className="secret-usage-facts"><div><dt>관측 범위</dt><dd>{collectionScope ? `${collectionScope.accountRef} · ${collectionScope.region}` : observation.sourceKind === 'MANUAL' ? '수동 자료의 등록 대상 참조를 확인하세요.' : '관측 계정·리전 미기록'}</dd></div></dl>
    {observation.sourceKind === 'MANUAL' && <p className="caption">수용·거절·철회는 원자료에 별도 기록해요. 현재 노출 심각도와 사고 판단은 판단 근거에서 확인하세요.</p>}
    <SecretUsageDecision key={`${observation.observationId}:${observation.observationRevision}`} observation={observation} disabled={disabled} onUpdated={onUpdated} onStale={onStale} />
    <details className="secret-scan-technical"><summary>자료 검토 이력</summary>{observation.decisionHistory.length ? <ol>{observation.decisionHistory.map((item) => <li key={item.revision}><strong>{Object.hasOwn(usageDecisions, item.decision) ? usageDecisions[item.decision] : '검토 기록'}</strong><p>{Object.hasOwn(usageDecisionReasons, item.reasonCode) ? usageDecisionReasons[item.reasonCode] : '검토 사유 확인 필요'} · {scanDate(item.decidedAt)}</p></li>)}</ol> : <p>저장된 수동 검토 이력이 없어요.</p>}</details>
  </section>
}

function UsageLocationContent({ secretId, location }: { secretId: number; location: KeyLocation }) {
  const [params, setParams] = useSearchParams(), client = useQueryClient()
  const occurrenceId = location.occurrenceId, page = positiveId(params.get('usagePage')) ?? 1
  const requestedView = params.get('usageView'), view = requestedView === 'request' || requestedView === 'material' ? requestedView : 'records'
  const selectedId = positiveId(params.get('usageObservation'))
  const [requestedId, setRequestedId] = useState<number | null>(null), [notice, setNotice] = useState(''), [stale, setStale] = useState(false)
  const processed = useRef(''), region = useRef<HTMLDivElement>(null), previousSelection = useRef<number | null>(null)
  const query = useQuery({ queryKey: ['secret-usage', secretId, occurrenceId, page], queryFn: () => fetchSecretUsage(secretId, occurrenceId, page), retry: false, refetchOnWindowFocus: false })
  const context = query.data
  const matched = context?.credentialId === secretId && context.occurrenceId === occurrenceId
  const requestId = requestedId ?? (matched ? context.latestRequest?.requestId : null) ?? null
  const progress = useQuery({ queryKey: ['secret-usage-request', secretId, occurrenceId, requestId], queryFn: () => fetchUsageRequest(requestId!), enabled: requestId != null, retry: false, refetchOnWindowFocus: false,
    refetchInterval: (item) => !item.state.error && (!item.state.data || activeUsageRequest(item.state.data.status)) ? 3000 : false })
  const progressMatched = progress.data?.credentialId === secretId && progress.data.occurrenceId === occurrenceId && progress.data.requestId === requestId
  const latest = progressMatched ? progress.data : matched ? context.latestRequest : null
  const busy = requestId != null && !latest || latest != null && !terminalUsageRequest(latest.status)
  const blocked = stale || query.isFetching || !!progress.error || !!progress.data && !progressMatched
  const changeView = (nextView: string) => { const next = new URLSearchParams(params); next.set('usageView', nextView); next.delete('usageObservation'); setParams(next) }
  const updated = (message: string) => { setNotice(message); void client.invalidateQueries({ queryKey: ['secret-usage', secretId, occurrenceId] }) }
  const reload = () => { setStale(false); void query.refetch(); if (requestId != null) void progress.refetch() }
  useEffect(() => {
    if (!progressMatched || !progress.data || !terminalUsageRequest(progress.data.status)) return
    const version = `${progress.data.requestId}:${progress.data.status}`
    if (processed.current === version) return
    processed.current = version
    if (requestedId === progress.data.requestId) setNotice('')
    void client.invalidateQueries({ queryKey: ['secret-usage', secretId, occurrenceId] })
  }, [progressMatched, progress.data, client, secretId, occurrenceId, requestedId])
  useEffect(() => {
    if (previousSelection.current != null && selectedId == null) {
      const button = region.current?.querySelector<HTMLButtonElement>(`[data-usage-observation="${previousSelection.current}"]`)
      if (button) button.focus()
      else region.current?.focus()
    }
    previousSelection.current = selectedId
  }, [selectedId])
  if (query.isPending) return <p role="status">이 위치의 사용 조회 조건과 자료를 불러오는 중이에요.</p>
  if (query.isError) return <div className="notice error" role="alert"><p>{safeMutationMessage(query.error)}</p><button className="btn outline" onClick={() => void query.refetch()}>사용 이력 다시 조회</button></div>
  if (!matched) return <p className="notice error" role="alert">선택한 키·위치와 다른 조회 자료예요. 위치와 현재 조건을 다시 확인하세요.</p>
  const observation = context.observations.items.find((item) => item.observationId === selectedId && item.credentialId === secretId && item.occurrenceId === occurrenceId)
  const iam = context.iamLastUsed
  const onRequested = (request: UsageRequest) => {
    if (request.credentialId !== secretId || request.occurrenceId !== occurrenceId) { setStale(true); return }
    setRequestedId(request.requestId)
    setNotice('사용 이력 조회 요청을 접수했어요. 이 화면에서 진행 상태를 확인하세요.')
  }
  return <div className="secret-usage-location" ref={region} tabIndex={-1}>
    <div className="secret-usage-tools"><button className="btn outline" disabled={query.isFetching} onClick={reload}>사용 조회 조건 새로고침</button></div>
    {iam ? <SecretIamUsageMetadata metadata={{ keyStatus: 'UNKNOWN', issuedAt: null, lastUsedAt: iam.lastUsedAt, lastUsedService: iam.service, lastUsedRegion: iam.region, observedAt: iam.observedAt }} /> : <p className="caption">현재 선택 위치에서 열람할 수 있는 IAM 최근 사용 메타데이터가 없어요.</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {stale && <p className="notice error" role="alert">현재 권한·자료 기준을 다시 확인해야 해요. <button className="btn outline" onClick={reload}>현재 조건 다시 조회</button></p>}
    {latest ? <UsageRequestSummary request={latest} /> : <p className="secret-usage-empty">{usageObservationLabel(context.observationStatus)}</p>}
    {progress.isError && <p className="notice error" role="alert">진행 상태를 읽지 못했어요. 새 요청 전에 <button className="btn outline" onClick={() => void progress.refetch()}>기존 요청 다시 확인</button>하세요.</p>}
    {!!progress.data && !progressMatched && <p className="notice error" role="alert">다른 키·위치의 요청 상태는 적용할 수 없어요. 현재 조건을 다시 조회하세요.</p>}
    {latest && !activeUsageRequest(latest.status) && !terminalUsageRequest(latest.status) && <p className="notice" role="alert">요청 종료 상태를 확인할 수 없어요. 기존 요청 상태를 다시 조회하세요.</p>}
    <div className="secret-usage-support">{context.support.status === 'UNSUPPORTED' && <p>이 키 유형의 자동 사용 조회를 지원하지 않아요. 확인한 관리 자료는 아래에서 제출할 수 있어요.</p>}{[...new Set([...context.support.reasonCodes, ...context.capabilities.blockedReasonCodes].map(usageReason))].map((reason) => <p className="caption" key={reason}>{reason}</p>)}</div>
    {context.capabilities.blockedReasonCodes.includes('FRESH_IDENTITY_VALIDATION_REQUIRED') && <button className="btn outline" onClick={() => { const next = new URLSearchParams(params); next.set('occurrence', String(occurrenceId)); next.set('validation', 'open'); setParams(next) }}>이 위치의 현재 인증 확인</button>}
    <nav className="secret-key-tabs" aria-label="사용 이력 작업">{[['records', '사용 자료'], ...(context.support.status !== 'UNSUPPORTED' ? [['request', 'AWS 조회 요청']] : []), ...(context.capabilities.canSubmit ? [['material', '자료 제출']] : [])].map(([mode, label]) => <button key={mode} className={!selectedId && view === mode ? 'active' : ''} aria-current={!selectedId && view === mode ? 'page' : undefined} onClick={() => changeView(mode)}>{label}</button>)}</nav>
    {selectedId ? <>
      <button className="btn outline" onClick={() => { const next = new URLSearchParams(params); next.delete('usageObservation'); setParams(next) }}>사용 자료 목록으로</button>
      {observation
        ? <UsageObservationDetail observation={observation} disabled={blocked} onUpdated={updated} onStale={() => setStale(true)} />
        : <p className="notice">선택한 자료가 현재 페이지나 허용 범위에 없어요. 목록에서 다시 선택하세요.</p>}
    </> : view === 'request' ? (
      context.support.status === 'UNSUPPORTED'
        ? <p className="notice">현재 발급자의 자동 조회를 지원하지 않아요. 사용 자료 탭에서 기록을 확인하세요.</p>
        : <SecretUsageRequestForm key={`${occurrenceId}:${context.credentialRevision}:${context.scopeRevision}`} context={context} disabled={blocked || !!busy} onRequested={onRequested} onStale={() => setStale(true)} />
    ) : view === 'material' ? (
      <SecretUsageMaterialForm location={location} key={`${occurrenceId}:${context.credentialRevision}:${context.scopeRevision}`} context={context} disabled={blocked} onUpdated={(message) => { updated(message); changeView('records') }} onStale={() => setStale(true)} />
    ) : <>
      {!context.observations.items.length ? <p className="secret-usage-empty">표시할 사용 자료가 없어요. 위의 조회 상태와 확인 범위를 함께 확인하세요.</p> : <div className="table-scroll" tabIndex={0} role="region" aria-label="사용 자료 목록"><table className="secret-usage-table"><thead><tr><th>행위·결과</th><th>자료 출처</th><th>키 연결·확인 범위</th><th>발생 시각</th><th>검토</th><th>상세</th></tr></thead><tbody>{context.observations.items.map((item) => <tr key={item.observationId}><td>{usageOperationLabel(item.operationCode, item.actionCode)}<small>{usageResultLabel(item.actionResult)}</small></td><td>{item.sourceKind === 'MANUAL' ? '수동 자료' : '공급자 관측'}{item.sourceKind === 'PROVIDER' && <small>{item.collectionScope?.region ?? '관측 리전 미기록'}</small>}</td><td>{usageBindingLabel(item.bindingLevel)}<small>{usageCoverageLabel(item.coverageStatus)}</small></td><td>{scanDate(item.eventAt)}</td><td>{usageReviewLabel(item.reviewStatus)}{item.currentApplicable === false && <small>이전 조건의 자료</small>}</td><td><button className="secret-history-detail-button" data-usage-observation={item.observationId} onClick={() => { const next = new URLSearchParams(params); next.set('usageObservation', String(item.observationId)); setParams(next) }}>자료 확인</button></td></tr>)}</tbody></table></div>}
      <div className="table-foot"><span>사용 자료 {context.observations.totalElements}건</span><div className="row"><button className="btn outline" disabled={page <= 1} onClick={() => { const next = new URLSearchParams(params); next.set('usagePage', String(page - 1)); setParams(next) }}>이전</button><span>{page}</span><button className="btn outline" disabled={page * context.observations.pageSize >= context.observations.totalElements} onClick={() => { const next = new URLSearchParams(params); next.set('usagePage', String(page + 1)); setParams(next) }}>다음</button></div></div>
    </>}
  </div>
}

export function SecretUsageHistory({ secretId, detail, locations }: { secretId: number; detail: SecretDetail; locations: KeyLocation[] }) {
  const [params, setParams] = useSearchParams()
  const selectedId = positiveId(params.get('occurrence')), location = locations.find((item) => item.occurrenceId === selectedId)
  return <section className="card secret-scan-section secret-usage"><div className="secret-usage-heading"><div><h2>사용 이력</h2><p className="caption">키가 실제로 사용된 자료의 기간·조회 범위·키 연결 근거를 확인하세요.</p></div></div>
    <label className="secret-usage-location-picker">확인할 발견 위치<select className="select" value={location?.occurrenceId ?? ''} onChange={(event) => { const next = new URLSearchParams(params); next.set('occurrence', event.target.value); next.set('locationPanel', 'closed'); next.delete('usagePage'); next.delete('usageObservation'); setParams(next) }}><option value="">발견 위치 선택</option>{locations.map((item) => <option key={item.occurrenceId} value={item.occurrenceId}>{item.safeLocationLabel}</option>)}</select></label>
    {location ? <UsageLocationContent key={`${secretId}:${location.occurrenceId}`} secretId={secretId} location={location} /> : <><SecretIamUsageMetadata metadata={detail.iamMetadata} /><p className="notice">사용 이력을 확인할 발견 위치를 선택하세요. 다른 위치의 기록을 임의로 합치지 않아요.</p></>}
  </section>
}
