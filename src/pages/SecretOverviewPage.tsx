import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { fetchSecretSummary, type WorkbenchFilters, type WorkbenchSummary, type WorkPreview, type OverviewScope } from '@/api/secretSummary'
import type { WorkbenchQueueItem } from '@/api/secretWorkbenchQueue'
import { PageHeader } from '@/components/PageHeader'
import { availableMetric, filterLabel, parseWorkbenchFilters, summaryReason, workbenchOptions, workbenchQueuePath, workbenchSearch, workbenchWhyLabel } from '@/lib/secretWorkbench'
import { actionLabels, blockerLabels, priorityLabels } from '@/lib/secretTaskGuidance'
import { setupReasonLabels } from '@/lib/secretScopeSetup'
import { isSecretSnapshotInvalidated } from '@/lib/secretSnapshotState'
import { secretSummaryKey, useSecretWorkbench } from '@/lib/useSecretWorkbench'
import { scanDate, scanReason, scopeTypeLabel } from '@/lib/secretScan'
import './secret-scan.css'
import './secret-workbench.css'

const countText = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : '—'
const views = { response: { label: '대응', bucket: 'ACTION_REQUIRED', stages: 'OPEN,IN_PROGRESS', metric: 'ongoingCases', unit: '건' }, decision: { label: '발견 검토', bucket: 'NEEDS_DECISION', stages: '', metric: 'needsDecisionLocations', unit: '곳' }, revalidation: { label: '재확인', bucket: 'ACTION_REQUIRED', stages: 'REVALIDATION_PENDING', metric: 'revalidationPendingCases', unit: '건' } } as const
function scopePath(item: OverviewScope) { return item.scopeId && item.connectionId ? `/secrets/connections/${item.connectionId}/scopes/${item.scopeId}` : null }
function workPath(item: WorkbenchQueueItem, filters: WorkbenchFilters, view: keyof typeof views, snapshotId: string) {
  const back = new URLSearchParams(workbenchQueuePath(filters, views[view].bucket, snapshotId, views[view].stages).split('?')[1])
  const context = new URLSearchParams({ origin: filters.origin, return: 'workbench', returnQuery: back.toString() })
  if (item.occurrenceId) context.set('occurrence', String(item.occurrenceId))
  if (item.caseId) return `/secrets/cases/${item.caseId}?${context}`
  const key = item.secretId ?? item.credentialSetId
  if (key && item.occurrenceId) { context.set('occurrence', String(item.occurrenceId)); return `/secrets/triage/${key}?${context}` }
  return null
}
function WorkList({ preview, view, filters, snapshotId, allEmpty = false }: { preview?: WorkPreview; view: keyof typeof views; filters: WorkbenchFilters; snapshotId: string; allEmpty?: boolean }) {
  if (!preview || preview.status !== 'AVAILABLE') return <div className="secret-overview-empty"><h3>업무 목록을 확인할 수 없어요</h3><p>{preview ? summaryReason(preview.status) : '이 응답에는 실제 업무 미리보기가 없어요.'}</p><Link className="btn outline" to={workbenchQueuePath(filters, views[view].bucket, snapshotId, views[view].stages)}>전체 목록 확인</Link></div>
  if (preview.snapshotId !== snapshotId) return <p className="notice">목록의 조회 기준이 달라요. 현황을 새로고침하세요.</p>
  if (!preview.items.length) return <div className="secret-overview-empty"><h3>{allEmpty ? '현재 조건에서 처리할 보안 업무가 없어요' : view === 'response' ? '현재 조건의 진행 중인 대응이 없어요' : view === 'decision' ? '현재 조건에서 검토할 발견 위치가 없어요' : '조치 후 재확인을 기다리는 건이 없어요'}</h3><p>마지막 검사와 누락 범위를 확인하세요.</p>{allEmpty && <div className="secret-overview-empty-links">{filters.origin === 'PRODUCTION' && <Link to={`/secrets?${workbenchSearch({ ...filters, origin: 'TEST', snapshotId: '' })}`}>시험 출처 확인 →</Link>}<Link to={`/secrets/findings?${new URLSearchParams({ origin: 'UNCLASSIFIED', source: filters.source, provider: filters.provider, environment: filters.environment })}`}>출처 미분류 키 확인 →</Link></div>}</div>
  return <div className="table-scroll"><table className="secret-overview-work-table"><thead><tr><th>대상</th><th>지금 확인할 이유</th><th>담당·확인 시각</th><th>다음 행동</th></tr></thead><tbody>{preview.items.map((item, index) => {
    const path = workPath(item, filters, view, snapshotId), guidance = item.taskGuidance
    const reasons = guidance?.priorityReasonCodes?.map((code) => priorityLabels[code]).filter(Boolean) ?? []
    const title = item.maskedLabel ?? (item.caseId ? `대응 #${item.caseId}` : `키 #${item.secretId ?? item.credentialSetId ?? '—'}`)
    const action = guidance ? actionLabels[guidance.nextActionCode] ?? '내용 확인' : '내용 확인'
    return <tr key={item.caseId ?? item.occurrenceId ?? index}><td>{path ? <Link to={path}>{title}</Link> : title}<span className="asset">{item.safeLocationLabel ?? item.source ?? '위치 정보 미제공'}</span></td><td>{reasons.length ? reasons.join(' · ') : workbenchWhyLabel(item.whyHereCode ?? item.whyHere)}{guidance && !guidance.canExecute && <span className="asset">{blockerLabels[guidance.blockedReasonCode ?? ''] ?? '담당자의 확인이 필요해요.'}</span>}</td><td>{item.assigneeDisplayName ?? item.assigneeTeam ?? (item.assigneeUserId ? `담당자 #${item.assigneeUserId}` : '담당 미지정')}<span className="asset">{scanDate(guidance?.evidenceObservedAt ?? item.evidenceObservedAt ?? item.lastSeenAt ?? item.updatedAt)}</span></td><td>{path ? <Link className="secret-overview-action" to={path}>{action} →</Link> : '연결 정보 확인 필요'}</td></tr>
  })}</tbody></table></div>
}
function ScopeRows({ items, health = false }: { items: OverviewScope[]; health?: boolean }) {
  return <ul className="secret-overview-scope-list">{items.map((item) => { const path = scopePath(item); return <li key={item.scopeId}><div>{path ? <Link to={path}>{item.safeDisplayAlias ?? `범위 #${item.scopeId}`}</Link> : <strong>범위 정보 확인 필요</strong>}<span>{scopeTypeLabel(item.contentType ?? '')}</span></div><p>{health ? item.coverage?.isPaused ? '검사 중지' : item.coverage?.isRunning ? '검사 진행 중' : item.coverage?.gapReasonCodes?.map(scanReason).join(' · ') || '현재 범위 검사 결과 확인' : item.setupReasonCodes?.map((code) => setupReasonLabels[code] ?? '설정 근거 확인').join(' · ') || '설정 근거 확인'}</p>{item.coverage?.lastAttempt && <small>최근 시도 {scanDate(item.coverage.lastAttempt.requestedAt)}</small>}{!health && item.taskGuidance && <p>{actionLabels[item.taskGuidance.nextActionCode] ?? '담당자 확인'}{!item.taskGuidance.canExecute && ` · ${blockerLabels[item.taskGuidance.blockedReasonCode ?? ''] ?? '담당자의 확인이 필요해요.'}`}</p>}</li> })}</ul>
}
function CollectionHealth({ summary, filters }: { summary: WorkbenchSummary; filters: WorkbenchFilters }) {
  const health = summary.collectionHealth
  return <section className="card secret-overview-health"><div className="secret-overview-section-title"><div><h2>검사 상태</h2><p>현재 출처의 승인 범위에서 확인한 결과예요.</p></div><Link to="/secrets/connections">연결·범위 보기 →</Link></div>{!health || health.status !== 'AVAILABLE' ? <p className="secret-overview-muted">{health ? summaryReason(health.status) : '검사 상태의 집계 근거가 제공되지 않았어요.'}</p> : <><div className="secret-overview-health-counts">{Object.entries({ success: '성공', partial: '일부 실패', failed: '실패', notRun: '검사 전', running: '진행 중', paused: '중지', incomplete: '완전성 미확인' }).map(([key, label]) => <span key={key}><strong>{countText(health.counts?.[key as keyof NonNullable<typeof health.counts>])}</strong>{label}</span>)}</div><dl className="secret-overview-health-times"><div><dt>승인 범위</dt><dd>{countText(health.approvedScopeCount)}개</dd></div><div><dt>최근 범위 검사</dt><dd>{scanDate(health.lastAttempt?.requestedAt)}</dd></div><div><dt>최근 범위 성공</dt><dd>{scanDate(health.lastScopeSuccess?.finishedAt)}</dd></div></dl>{health.lastCompleteSuccess && <p className="caption">선택 범위 전체 성공 {scanDate(health.lastCompleteSuccess.finishedAt)}</p>}{health.notApplicableFilters?.some((key) => key === 'assignee' ? !!filters.assignee : key === 'provider' ? filters.provider !== 'ALL' : key === 'environment' ? filters.environment !== 'ALL' : false) && <p className="caption">발급자·환경·담당자 조건은 검사 범위 집계에 적용하지 않아요.</p>}{health.items?.length > 0 && <ScopeRows items={health.items.slice(0, 5)} health />}<Link className="secret-overview-action" to={workbenchQueuePath(filters, 'COVERAGE_GAPS', summary.snapshotId)}>누락 원인·복구 확인 →</Link></>}</section>
}
function SetupBacklog({ summary }: { summary: WorkbenchSummary }) {
  const setup = summary.setupSummary
  if (!setup || setup.status !== 'AVAILABLE') return <details className="secret-overview-setup"><summary>운영 설정</summary><p>{setup ? summaryReason(setup.status) : '설정 잔여의 원인별 정보가 제공되지 않았어요.'}</p><Link to="/secrets/connections">연결 관리에서 확인</Link></details>
  const groups = [{ key: 'selected', label: '선택한 출처의 설정 보완', count: setup.selectedOriginScopeCount, items: setup.items, reasons: setup.selectedReasonCounts }, { key: 'unclassified', label: '출처가 미분류인 범위', count: setup.unclassifiedScopeCount, items: setup.unclassifiedItems, reasons: setup.unclassifiedReasonCounts }, { key: 'paused', label: '중지된 연결의 설정 잔여', count: setup.pausedScopeCount, items: setup.pausedItems, reasons: setup.pausedReasonCounts }]
  return <section className="secret-overview-setup" aria-label="운영 설정 잔여"><h2>운영 설정</h2><p className="caption">출처·보관 정책·검토 상태를 각각 확인하세요. 중지된 연결은 따로 표시해요.</p>{groups.map((group) => <details key={group.key}><summary>{group.label}<span>{countText(group.count)}개 범위</span></summary>{group.key !== 'selected' && setup.globalGroupsIgnoreOrigin && <p className="caption">출처 필터와 관계없는 허용 범위예요. 소스·연결 조건은 유지해요.</p>}{Object.entries(group.reasons ?? {}).filter(([, count]) => count > 0).length > 0 && <p className="caption">{Object.entries(group.reasons ?? {}).filter(([, count]) => count > 0).map(([code, count]) => `${setupReasonLabels[code] ?? '설정 근거 확인'} ${count}`).join(' · ')} · 사유는 중복될 수 있어요.</p>}{group.items?.length ? <ScopeRows items={group.items} /> : <p className="caption">표시할 잔여 범위가 없어요.</p>}<Link to="/secrets/connections">연결 관리에서 전체 확인 →</Link></details>)}</section>
}
export function SecretOverviewPage() {
  const [params, setParams] = useSearchParams(), client = useQueryClient()
  const { filters, valid } = parseWorkbenchFilters(params)
  const [view, setView] = useState<keyof typeof views>('response'), [refreshing, setRefreshing] = useState(false), [refreshError, setRefreshError] = useState(false)
  const legacyRun = params.get('run'), invalidated = isSecretSnapshotInvalidated(filters.snapshotId), query = useSecretWorkbench(filters, valid && !legacyRun)
  useEffect(() => {
    if (!query.isSuccess || filters.snapshotId || invalidated) return
    const next = { ...filters, snapshotId: query.data.snapshotId }; client.setQueryData(secretSummaryKey(next), query.data); setParams(workbenchSearch(next), { replace: true })
  }, [query.isSuccess, query.data, filters, invalidated, client, setParams])
  const change = (key: string, value: string) => { setRefreshError(false); setParams(workbenchSearch({ ...filters, [key]: value, snapshotId: '' })) }
  const refresh = async () => {
    setRefreshing(true); setRefreshError(false)
    const clean = { ...filters, snapshotId: '' }
    try { const data = await client.fetchQuery({ queryKey: secretSummaryKey(clean), queryFn: () => fetchSecretSummary(clean), staleTime: 0 }); const next = { ...clean, snapshotId: data.snapshotId }; client.setQueryData(secretSummaryKey(next), data); setParams(workbenchSearch(next), { replace: true }) } catch { setRefreshError(true) } finally { setRefreshing(false) }
  }
  if (legacyRun && /^[1-9]\d*$/.test(legacyRun)) return <Navigate replace to={`/secrets/history/${legacyRun}`} />
  const data = query.data, hasData = query.isSuccess && !invalidated && valid
  const preview = data?.workPreviews?.[view]
  const allWorkEmpty = data?.workPreviews && Object.values(data.workPreviews).every((item) => item.status === 'AVAILABLE' && item.total === 0)
  return <><PageHeader title="시크릿 현황" description="확인된 발견부터 실제 조치와 재확인까지 진행하세요." actions={<><Link className="btn outline" to="/secrets/findings">키·노출 위치</Link><Link className="btn primary" to="/secrets/history?request=scan">스캔 요청</Link></>} />
    <section className="secret-overview-controls" aria-label="현황 조회 조건">{(['origin', 'source', 'environment'] as const).map((key) => <label key={key}>{key === 'origin' ? '출처' : filterLabel(key)}<select className="select" value={filters[key]} disabled={refreshing} onChange={(event) => change(key, event.target.value)}>{Object.entries(workbenchOptions[key]).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>)}<details><summary>추가 조건</summary><div>{(['provider', 'assignee'] as const).map((key) => <label key={key}>{filterLabel(key)}<select className="select" value={filters[key]} onChange={(event) => change(key, event.target.value)}>{Object.entries(workbenchOptions[key]).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>)}{filters.connectionId && <button className="btn outline" onClick={() => setParams(workbenchSearch({ ...filters, connectionId: null, snapshotId: '' }))}>연결 #{filters.connectionId} 조건 해제</button>}</div></details><button className="btn outline" disabled={refreshing || !valid} onClick={() => void refresh()}>{refreshing ? '갱신 중…' : '새로고침'}</button></section>
    {filters.origin === 'TEST' && <p className="secret-overview-origin-status"><strong>시험 출처</strong> 합성 여부와 실제 키 가능성은 별도 근거로 확인해요. <button className="btn outline" onClick={() => change('origin', 'PRODUCTION')}>운영 보기</button></p>}
    {refreshError && <p className="notice error" role="alert">새 현황을 불러오지 못했어요. 표시된 기준시각의 결과를 유지해요.</p>}
    {!valid ? <p className="notice error" role="alert">현황 조회 조건을 확인해 주세요. <Link to="/secrets">조건 초기화</Link></p> : invalidated ? <section className="card secret-overview-empty"><h2>조회 근거가 변경됐어요</h2><button className="btn primary" onClick={() => void refresh()}>새 기준으로 조회</button></section> : query.isPending ? <p className="card secret-scan-message" role="status">현황을 불러오는 중이에요.</p> : query.isError ? <section className="card secret-overview-empty" role="alert"><h2>{query.error instanceof ApiError && [404, 409].includes(query.error.status) ? '조회 기준을 다시 확인해 주세요' : '현황을 불러오지 못했어요'}</h2><p>조회하지 못한 업무와 검사 상태는 0으로 표시하지 않아요.</p><button className="btn outline" onClick={() => void refresh()}>다시 조회</button></section> : hasData && data ? <>
      <div className="secret-overview-asof"><span>기준 {scanDate(data.asOf)}</span><span>{data.restrictedCoverage ? '열람 가능한 범위' : '승인된 범위'}</span></div>
      <div className="secret-overview-layout"><section className="card secret-overview-work"><div className="secret-overview-section-title"><div><h2>지금 처리할 업무</h2><p>확인된 이유와 담당자를 보고 다음 작업으로 이어가세요.</p></div><Link to={workbenchQueuePath(filters, views[view].bucket, data.snapshotId, views[view].stages)}>전체 목록 →</Link></div><nav className="secret-overview-work-tabs" aria-label="보안 업무">{Object.entries(views).map(([key, config]) => { const item = data.workPreviews?.[key as keyof typeof views], metric = data.metrics.find((entry) => entry.key === config.metric); return <button key={key} className={view === key ? 'active' : ''} aria-pressed={view === key} onClick={() => setView(key as keyof typeof views)}>{config.label}<span>{item?.status === 'AVAILABLE' ? countText(item.total) : availableMetric(metric) ? countText(metric?.value) : '—'}{config.unit}</span></button> })}</nav><WorkList preview={preview} view={view} filters={filters} snapshotId={data.snapshotId} allEmpty={!!allWorkEmpty} />{data.caseSummary.severityStatus === 'AVAILABLE' && typeof data.caseSummary.notApplicableCaseCount === 'number' && Number.isSafeInteger(data.caseSummary.notApplicableCaseCount) && data.caseSummary.notApplicableCaseCount > 0 && <p className="caption">심각도 평가 대상 외 {data.caseSummary.notApplicableCaseCount}건 · 등급별 건수와 별도로 집계해요.</p>}{data.metrics.some((metric) => metric.key === 'needsCaseLinkLocations' && availableMetric(metric) && metric.value! > 0) && <Link className="secret-overview-integrity" to={workbenchQueuePath(filters, 'NEEDS_CASE_LINK', data.snapshotId)}>노출이 확인됐지만 대응 연결이 필요한 위치 확인 →</Link>}</section><CollectionHealth summary={data} filters={filters} /></div>
      {data.crossEnvironmentAlerts.status === 'AVAILABLE' && data.crossEnvironmentAlerts.value != null && data.crossEnvironmentAlerts.value > 0 && <section className="secret-overview-security-alert"><strong>시험 출처: 실키 여부 확인 {data.crossEnvironmentAlerts.value}건</strong><Link to="/secrets/triage/alerts">경고 확인 →</Link></section>}
      <SetupBacklog summary={data} />
      <footer className="secret-overview-footer"><Link to="/secrets/findings">전체 키·발견 위치</Link>{data.normalInventory.status === 'AVAILABLE' && data.normalInventory.value != null && <Link to={workbenchQueuePath(filters, 'NORMAL_INVENTORY', data.snapshotId)}>보관·메타데이터·폐기 이력 {countText(data.normalInventory.value)}개 키</Link>}<Link to="/secrets/history">스캔 이력</Link></footer>
    </> : null}
  </>
}
