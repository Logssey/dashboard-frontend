import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { fetchSecretSummary, type WorkbenchFilters, type WorkbenchMetric, type WorkbenchSummary } from '@/api/secretSummary'
import { PageHeader } from '@/components/PageHeader'
import { Icon } from '@/components/Icon'
import { availableMetric, filterLabel, metricQueuePath, parseWorkbenchFilters, summaryReason, workbenchMetricLabels, workbenchOptions, workbenchQueuePath, workbenchSearch } from '@/lib/secretWorkbench'
import { isSecretSnapshotInvalidated } from '@/lib/secretSnapshotState'
import { secretSummaryKey, useSecretWorkbench } from '@/lib/useSecretWorkbench'
import { scanDate } from '@/lib/secretScan'
import './secret-workbench.css'
import './secret-scan.css'

function WorkCard({ metric, filters, snapshotId }: { metric: WorkbenchMetric | undefined; filters: WorkbenchFilters; snapshotId: string }) {
  if (!metric || !workbenchMetricLabels[metric.key]) return null
  const config = workbenchMetricLabels[metric.key]
  const available = availableMetric(metric)
  const content = <><span className="secret-workbench-card-title">{config.title}</span><strong>{available ? metric.value : '—'}<small>{config.unit}</small></strong><span className="caption">{available ? config.description : summaryReason(metric.status)}</span>{metric.notApplicableFilters.length > 0 && <span className="caption">{metric.notApplicableFilters.map(filterLabel).join('·')} 조건은 적용하지 않아요.</span>}{available && <span className="secret-workbench-card-action">{metric.value === 0 ? '목록 확인' : '해야 할 일 확인'} <Icon name="chevron" /></span>}</>
  return available ? <Link className={`card secret-workbench-card ${metric.key}`} to={metricQueuePath(metric, filters, snapshotId)}>{content}</Link> : <div className="card secret-workbench-card unavailable">{content}</div>
}
function ResponseDistribution({ summary, filters }: { summary: WorkbenchSummary; filters: WorkbenchFilters }) {
  const data = summary.caseSummary
  const stages = [{ code: 'OPEN', label: '신규 및 분석', color: 'blue' }, { code: 'IN_PROGRESS', label: '조치 중', color: 'violet' }, { code: 'REVALIDATION_PENDING', label: '재검사 대기', color: 'amber' }, { code: 'RESOLVED', label: '해결', color: 'green' }]
  const available = data.status === 'AVAILABLE' && data.actionCounts !== null
  const maximum = Math.max(1, ...stages.map((stage) => data.actionCounts?.[stage.code] ?? 0))
  const exceptionCount = data.actionCounts?.RISK_ACCEPTED
  return <section className="card secret-workbench-distribution"><div className="secret-workbench-section-head"><div><h2>조치는 어디까지 진행됐나요?</h2><p className="caption">같은 출처의 현재 대응 건을 단계별로 보여줘요.</p></div><span className="caption">대응 건 기준</span></div>{!available ? <p className="secret-scan-message">{summaryReason(data.status)}</p> : <ol className="secret-workbench-stages">{stages.map((stage, index) => { const count = data.actionCounts?.[stage.code]; const hasValue = typeof count === 'number' && count >= 0; return <li key={stage.code} className={stage.color}><span className="secret-workbench-stage-number">0{index + 1}</span><strong className="secret-workbench-stage-label">{stage.label}</strong><div className="secret-workbench-stage-track" aria-hidden="true"><span style={{ height: hasValue ? `${count / maximum * 100}%` : '0' }} /></div>{hasValue ? <Link to={workbenchQueuePath(filters, 'CURRENT_CASES', summary.snapshotId, stage.code)} aria-label={`${stage.label} 대응 건 ${count}건 보기`}><strong>{count}</strong><small>건</small></Link> : <span>미제공</span>}</li> })}</ol>}<div className="secret-workbench-distribution-foot"><p className="caption">현재 단계별 건수예요. 처리율이나 단계 전환율을 뜻하지 않아요.</p>{available && typeof exceptionCount === 'number' && <Link to={workbenchQueuePath(filters, 'CURRENT_CASES', summary.snapshotId, 'RISK_ACCEPTED')}>위험 수용 {exceptionCount}건 · 해결과 별도</Link>}</div>{data.severityStatus !== 'AVAILABLE' ? <p className="notice">심각도는 미평가 상태예요. 평가 근거가 없으므로 높음·낮음으로 나누지 않아요.</p> : null}</section>
}

export function SecretOverviewPage() {
  const [params, setParams] = useSearchParams()
  const { filters, valid } = parseWorkbenchFilters(params)
  const legacyRun = params.get('run'), client = useQueryClient()
  const invalidated = isSecretSnapshotInvalidated(filters.snapshotId)
  const summary = useSecretWorkbench(filters, valid && !legacyRun)
  const [refreshing, setRefreshing] = useState(false), [refreshError, setRefreshError] = useState(false)
  useEffect(() => {
    if (!summary.isSuccess || filters.snapshotId || invalidated) return
    const nextFilters = { ...filters, snapshotId: summary.data.snapshotId }
    client.setQueryData(secretSummaryKey(nextFilters), summary.data)
    setParams(workbenchSearch(nextFilters), { replace: true })
  }, [summary.isSuccess, summary.data, filters, invalidated, client, setParams])
  const change = (key: string, value: string) => { setRefreshError(false); setParams(workbenchSearch({ ...filters, [key]: value, snapshotId: '' })) }
  const refresh = async () => {
    setRefreshing(true); setRefreshError(false)
    const clean = { ...filters, snapshotId: '' }
    try {
      const data = await client.fetchQuery({ queryKey: secretSummaryKey(clean), queryFn: () => fetchSecretSummary(clean), staleTime: 0 })
      const nextFilters = { ...clean, snapshotId: data.snapshotId }
      client.setQueryData(secretSummaryKey(nextFilters), data)
      setParams(workbenchSearch(nextFilters), { replace: true })
    } catch { setRefreshError(true) } finally { setRefreshing(false) }
  }
  if (legacyRun && /^[1-9]\d*$/.test(legacyRun)) return <Navigate replace to={`/secrets/history/${legacyRun}`} />
  const data = summary.data
  const metrics = data?.metrics ?? []
  const hasData = summary.isSuccess && !invalidated && valid
  const alerts = data?.crossEnvironmentAlerts
  const inventoryAvailable = data?.normalInventory.status === 'AVAILABLE' && data.normalInventory.value !== null
  return <><PageHeader title="시크릿 현황" description="확인할 위치, 진행 중인 대응, 검사 누락을 구분해 살펴보세요." actions={<Link className="btn outline" to="/secrets/findings"><Icon name="list" />키 인벤토리</Link>} />
    <section className="card secret-scan-filters" aria-label="현황 조회 조건">{(['origin', 'source', 'provider', 'environment', 'assignee'] as const).map((key) => <label key={key}>{key === 'origin' ? '출처' : filterLabel(key)}<select className="select" value={filters[key]} disabled={refreshing} onChange={(e) => change(key, e.target.value)}>{Object.entries(workbenchOptions[key]).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>)}{filters.connectionId && <span className="secret-workbench-connection-filter">연결 #{filters.connectionId}<button className="btn outline" onClick={() => setParams(workbenchSearch({ ...filters, connectionId: null, snapshotId: '' }))}>조건 해제</button></span>}<button className="btn outline" disabled={refreshing || !valid} onClick={() => void refresh()}>{refreshing ? '현재 기준 확인 중…' : '현황 새로고침'}</button></section>
    {filters.origin === 'TEST' && <p className="notice">시험 출처를 보고 있어요. <button className="btn outline" onClick={() => change('origin', 'PRODUCTION')}>운영 보기</button> 합성 여부와 실키 가능성은 별도 근거로 확인해요.</p>}
    {refreshError && <p className="notice error" role="alert">새 현황을 불러오지 못했어요. 표시된 기준시각의 결과를 유지해요.</p>}
    {!valid ? <p className="notice error" role="alert">현황 조회 조건을 확인해 주세요. <Link to="/secrets">조건 초기화</Link></p> : invalidated ? <section className="card secret-scan-message" role="status"><h2>조회 근거가 변경됐어요</h2><p>최신 기준으로 확인해야 현재 할 일을 보여줄 수 있어요.</p><button className="btn primary" disabled={refreshing} onClick={() => void refresh()}>새 기준으로 조회</button></section> : summary.isPending ? <p className="card secret-scan-message" role="status">현황을 불러오는 중이에요.</p> : summary.isError ? <section className="card secret-scan-message" role="alert"><h2>{summary.error instanceof ApiError && [404, 409].includes(summary.error.status) && filters.snapshotId ? '조회 기준이 만료되거나 달라졌어요' : '현황을 불러오지 못했어요'}</h2><p>조회하지 못한 지표를 0으로 표시하지 않아요.</p><button className="btn outline" onClick={() => void refresh()}>새 기준으로 조회</button></section> : hasData && data ? <>
      <div className="secret-workbench-asof"><span>기준시각 {scanDate(data.asOf)}</span><span>{data.restrictedCoverage ? '열람 가능한 범위 기준' : '승인된 범위 기준'}</span></div>
      {data.partialCoverage === true && <p className="notice">확인하지 못한 검사 범위가 있어요. 마지막 성공과 최근 실패를 함께 확인하세요.</p>}
      <div className="secret-workbench-primary-cards">{['needsDecisionLocations', 'ongoingCases', 'revalidationPendingCases', 'coverageGapScopes'].map((key) => <WorkCard key={key} metric={metrics.find((metric) => metric.key === key)} filters={filters} snapshotId={data.snapshotId} />)}</div>
      <div className="secret-workbench-secondary-cards">{['needsCaseLinkLocations', 'unclassifiedScopes'].map((key) => <WorkCard key={key} metric={metrics.find((metric) => metric.key === key)} filters={filters} snapshotId={data.snapshotId} />)}<section className="card secret-workbench-card"><span className="secret-workbench-card-title">인벤토리</span><strong>{inventoryAvailable ? data.normalInventory.value : '—'}<small>개 키</small></strong><p className="caption">허용 보관 키와 접근키 정보예요. 노출 건수에 더하지 않아요.</p>{inventoryAvailable ? <Link className="secret-workbench-card-action" to={workbenchQueuePath(filters, 'NORMAL_INVENTORY', data.snapshotId)}>인벤토리 근거 확인 <Icon name="chevron" /></Link> : <p className="caption">{summaryReason(data.normalInventory.status)}</p>}</section></div>
      <ResponseDistribution summary={data} filters={filters} />
      {alerts?.status === 'AVAILABLE' && alerts.value !== null && alerts.value > 0 && <section className="card secret-workbench-alert"><div><h2>시험 출처에서 실제 키 가능성 확인</h2><p>{alerts.value}개 경고가 남아 있어요. 운영 대응 건수와 별도로 확인하세요.</p></div><Link className="btn outline" to="/secrets/triage/alerts">실키 경고 확인</Link>{alerts.items.length > 0 && <ul>{alerts.items.map((alert) => <li key={alert.alertId}><Link to={`/secrets/triage/alerts/${alert.alertId}`}>경고 #{alert.alertId} · {alert.status === 'CONFIRMED_REAL' ? '실키 확인' : '실키 가능성 확인 필요'}</Link></li>)}</ul>}</section>}
      <p className="secret-workbench-unit-note">키·위치·대응 건·검사 범위는 서로 다른 단위예요. 전체 위험 수로 합산하지 않아요.</p>
    </> : null}
  </>
}
