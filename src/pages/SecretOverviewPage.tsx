import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, Navigate } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { fetchSecretSummary, type CollectionProviderHealth, type WorkbenchFilters, type WorkbenchSummary, type WorkPreview } from '@/api/secretSummary'
import type { WorkbenchQueueItem } from '@/api/secretWorkbenchQueue'
import { useSecretListParams } from '@/lib/useSecretListParams'
import { PageHeader } from '@/components/PageHeader'
import { SecretCommonCauses } from '@/components/SecretCommonCauses'
import { SecretRiskDistribution } from '@/components/SecretRiskDistribution'
import { withSecretOrigin } from '@/lib/secretNavigation'
import { availableMetric, filterLabel, parseWorkbenchFilters, summaryReason, workbenchQueuePath, workbenchSearch, workbenchWhyLabel } from '@/lib/secretWorkbench'
import { blockerLabels, priorityLabels } from '@/lib/secretTaskGuidance'
import { setupReasonLabels } from '@/lib/secretScopeSetup'
import { isSecretSnapshotInvalidated } from '@/lib/secretSnapshotState'
import { secretSummaryKey, useSecretWorkbench } from '@/lib/useSecretWorkbench'
import { scanDate, scanPlatforms } from '@/lib/secretScan'
import './secret-scan.css'
import './secret-workbench.css'

const views = {
  review: { title: '확인 필요', description: '발견 위치를 검토하고 필요한 대응을 시작하세요.', bucket: 'REVIEW_REQUIRED', stages: '', metric: 'reviewRequiredLocations', unit: '곳' },
  response: { title: '대응 중', description: '담당자와 조치 진행 상황을 확인하세요.', bucket: 'ACTION_REQUIRED', stages: 'OPEN,IN_PROGRESS', metric: 'ongoingCases', unit: '건' },
  revalidation: { title: '확인 대기', description: '재검사 결과와 해결 조건을 확인하세요.', bucket: 'ACTION_REQUIRED', stages: 'REVALIDATION_PENDING', metric: 'revalidationPendingCases', unit: '건' },
} as const
type WorkView = keyof typeof views

const countText = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : '—'
const inventoryPath = (filters: WorkbenchFilters) => `/secrets/findings?${new URLSearchParams({ origin: filters.origin, source: filters.source, provider: filters.provider, environment: filters.environment })}`
function overviewSearch(filters: WorkbenchFilters, view: WorkView) {
  const result = workbenchSearch(filters)
  result.set('view', view)
  return result
}

function OverviewCards({ summary, view, onSelect }: { summary: WorkbenchSummary; view: WorkView; onSelect: (view: WorkView) => void }) {
  return <section className="secret-summary-cards" aria-label="보안 업무 선택">
    {(Object.entries(views) as [WorkView, typeof views[WorkView]][]).map(([key, config]) => {
      const metric = summary.metrics.find((item) => item.key === config.metric)
      const available = availableMetric(metric)
      return <button key={key} type="button"
        className={`secret-summary-card ${key}${view === key ? ' selected' : ''}${available && metric!.value! > 0 ? ' has-work' : ''}`}
        aria-pressed={view === key} aria-controls="secret-overview-work-list" onClick={() => onSelect(key)}>
        <span className="secret-summary-title">{config.title}</span>
        <strong className="secret-summary-value">{available ? countText(metric!.value) : '—'}<small>{config.unit}</small></strong>
        <span className="secret-summary-description">{config.description}</span>
        <span className="secret-summary-action">
          {available ? view === key ? '선택한 업무' : '업무 보기' : summaryReason(metric?.status)}
          {view === key && <span aria-hidden="true">✓</span>}
        </span>
      </button>
    })}
  </section>
}

function workPath(item: WorkbenchQueueItem, filters: WorkbenchFilters, view: WorkView, snapshotId: string) {
  const back = workbenchQueuePath(filters, views[view].bucket, snapshotId, views[view].stages).split('?')[1]
  const context = new URLSearchParams({ origin: filters.origin, return: 'workbench', returnQuery: back })
  if (item.occurrenceId) context.set('occurrence', String(item.occurrenceId))
  const key = item.secretId ?? item.credentialSetId
  if (view === 'review' && key) return `/secrets/${key}?${context}`
  if (item.caseId) return `/secrets/cases/${item.caseId}?${context}`
  return key ? `/secrets/${key}?${context}` : null
}

function EmptyWork({ summary, filters, view }: { summary: WorkbenchSummary; filters: WorkbenchFilters; view: WorkView }) {
  const health = summary.collectionHealth
  const filtered = filters.source !== 'ALL' || filters.provider !== 'ALL' || filters.environment !== 'ALL' || !!filters.connectionId || !!filters.assignee
  if (health?.status === 'AVAILABLE' && health.configuredConnectionCount === 0) {
    return <div className="secret-overview-empty">
      <h3>{filtered ? '선택한 조건에 검사 연결이 없어요' : '검사할 연결을 등록하세요'}</h3>
      <p>{filtered ? '소스·연결 조건을 확인하거나 연결 관리에서 대상을 설정하세요.' : 'GitHub·AWS·Notion 연결과 검사 대상을 설정하면 발견 결과를 확인할 수 있어요.'}</p>
      <div className="secret-overview-empty-links">
        {filtered && <Link to={`/secrets?${overviewSearch({ ...filters, source: 'ALL', provider: 'ALL', environment: 'ALL', connectionId: null, assignee: '', snapshotId: '' }, view)}`}>조건 초기화</Link>}
        <Link to={withSecretOrigin('/secrets/connections', filters.origin)}>연결 관리</Link>
      </div>
    </div>
  }
  if (health?.status === 'AVAILABLE' && health.approvedScopeCount === 0) {
    return <div className="secret-overview-empty">
      <h3>등록된 검사 대상이 없어요</h3>
      <p>연결 관리에서 검사할 저장소·페이지·자원을 등록하세요.</p>
      <div className="secret-overview-empty-links">
        <Link to={withSecretOrigin('/secrets/connections', filters.origin)}>검사 대상 확인</Link>
      </div>
    </div>
  }
  if (health?.status === 'AVAILABLE' && health.counts && health.approvedScopeCount! > 0 && health.counts.notRun === health.approvedScopeCount) {
    return <div className="secret-overview-empty">
      <h3>현재 검사 대상을 확인하세요</h3>
      <p>미검사·건너뛴 대상의 검사 이력을 확인하고 검사를 요청하세요.</p>
      <Link className="btn outline" to={withSecretOrigin('/secrets/history?request=scan', filters.origin)}>검사 요청</Link>
    </div>
  }
  const title = filtered ? '선택한 조건에 맞는 업무가 없어요' : view === 'review' ? '현재 확인할 발견이 없어요' : view === 'response' ? '진행 중인 대응이 없어요' : '재검사를 기다리는 대응이 없어요'
  return <div className="secret-overview-empty">
    <h3>{title}</h3>
    <p>{filtered ? '조회 조건을 조정하거나 키·발견 위치 목록을 확인하세요.' : '최근 검사 결과와 키·발견 위치를 확인할 수 있어요.'}</p>
    <div className="secret-overview-empty-links">
      {filtered && <Link to={`/secrets?${overviewSearch({ ...filters, source: 'ALL', provider: 'ALL', environment: 'ALL', connectionId: null, assignee: '', snapshotId: '' }, view)}`}>조건 초기화</Link>}
      <Link to={inventoryPath(filters)}>키·발견 위치 보기</Link>
      <Link to={withSecretOrigin('/secrets/history', filters.origin)}>검사 이력</Link>
    </div>
  </div>
}

function WorkList({ preview, summary, view, filters }: { preview?: WorkPreview; summary: WorkbenchSummary; view: WorkView; filters: WorkbenchFilters }) {
  if (!preview || preview.status !== 'AVAILABLE') return <div className="secret-overview-empty" role="status"><h3>업무 목록을 확인할 수 없어요</h3><p>{summaryReason(preview?.status)}</p></div>
  if (preview.snapshotId !== summary.snapshotId) return <p className="notice" role="status">목록의 기준시각이 달라요. 현황을 새로고침하세요.</p>
  if (!preview.items.length) return <EmptyWork summary={summary} filters={filters} view={view} />
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={`${views[view].title} 업무 목록`}>
    <table className="secret-overview-work-table">
      <thead><tr><th>대상</th><th>확인할 이유</th><th>담당자</th><th>다음 행동</th></tr></thead>
      <tbody>{preview.items.slice(0, 3).map((item, index) => {
        const path = workPath(item, filters, view, summary.snapshotId)
        const guidance = item.taskGuidance
        const reasons = guidance?.priorityReasonCodes?.map((code) => priorityLabels[code]).filter(Boolean) ?? []
        const caseLinkRequired = (item.whyHereCode ?? item.whyHere) === 'CASE_LINK_REQUIRED'
        const title = item.maskedLabel ?? (item.caseId ? `대응 #${item.caseId}` : `키 #${item.secretId ?? item.credentialSetId ?? '—'}`)
        const action = guidance?.canExecute === false ? '내용 확인' : view === 'review' ? '키 상세 보기' : '조치 관리 열기'
        return <tr key={view === 'review' ? item.occurrenceId ?? index : item.caseId ?? item.occurrenceId ?? index}>
          <td>
            {path ? <Link to={path}>{title}</Link> : title}
            <span className="asset">{item.safeLocationLabel ?? (item.caseId ? `대응 위치 ${countText(item.visibleOccurrenceCount)}곳` : item.source ?? '발견 위치 확인 필요')}</span>
            {view === 'review' && <span className="secret-overview-review-kind">{caseLinkRequired ? '대응 생성 필요' : '검토 필요'}</span>}
          </td>
          <td>
            {reasons.length ? reasons.join(' · ') : workbenchWhyLabel(item.whyHereCode ?? item.whyHere)}
            {guidance && !guidance.canExecute && <span className="asset">{blockerLabels[guidance.blockedReasonCode ?? ''] ?? '담당자의 확인이 필요해요.'}</span>}
          </td>
          <td>{item.assigneeDisplayName ?? item.assigneeTeam ?? (item.assigneeUserId ? `담당자 #${item.assigneeUserId}` : '미지정')}<span className="asset">{scanDate(guidance?.evidenceObservedAt ?? item.evidenceObservedAt ?? item.lastSeenAt ?? item.updatedAt)}</span></td>
          <td>{path ? <Link className="secret-overview-action" to={path}>{action}</Link> : '연결 정보 확인 필요'}{guidance?.canExecute && <span className="asset">현재 계정으로 처리 가능</span>}</td>
        </tr>
      })}</tbody>
    </table>
  </div>
}

function SetupBacklog({ summary, origin }: { summary: WorkbenchSummary; origin: string }) {
  const setup = summary.setupSummary
  if (!setup || setup.status !== 'AVAILABLE') return null
  const groups = [
    { key: 'selected', label: '검사 대상 설정 보완', count: setup.selectedOriginScopeCount, reasons: setup.selectedReasonCounts },
    { key: 'unclassified', label: '추가 설정 검토', count: setup.unclassifiedScopeCount, reasons: setup.unclassifiedReasonCounts },
    { key: 'paused', label: '중지된 연결의 설정 보완', count: setup.pausedScopeCount, reasons: setup.pausedReasonCounts },
  ]
  return <details className="secret-overview-setup">
    <summary>검사 대상 설정</summary>
    <ul>{groups.map((group) => <li key={group.key}>
      <span>{group.label}</span><strong>{countText(group.count)}개</strong>
      {group.count! > 0 && <p>{Object.entries(group.reasons ?? {}).filter(([, count]) => count > 0).map(([code, count]) => `${setupReasonLabels[code] ?? '설정 확인'} ${count}`).join(' · ')}</p>}
    </li>)}</ul>
    {setup.globalGroupsIgnoreOrigin && <p>현재 열람 가능한 연결의 설정을 확인하세요.</p>}
    <Link to={withSecretOrigin('/secrets/connections', origin)}>연결·검사 대상 설정</Link>
  </details>
}

function ProviderHealth({ item, origin }: { item: CollectionProviderHealth; origin: string }) {
  const counts = item.counts
  const source = scanPlatforms[item.source as keyof typeof scanPlatforms] ?? '검사 원천'
  const gaps = typeof item.gapScopeCount === 'number' && item.gapScopeCount > 0
  const history = withSecretOrigin(`/secrets/history?provider=${encodeURIComponent(item.source)}`, origin)
  return <li className="secret-overview-provider">
    <div className="secret-overview-provider-head">
      <strong>{source}</strong>
      <span>{item.approvedScopeCount === 0 ? '검사 대상 없음' : <>검사 성공 <strong>{countText(counts?.success)}</strong> / {countText(item.approvedScopeCount)}개 대상</>}</span>
    </div>
    {item.approvedScopeCount !== null && item.approvedScopeCount > 0 && <>
      <p className="secret-overview-provider-details">
        {gaps && <span className="needs-attention">누락·지연 {item.gapScopeCount}개</span>}
        {counts && counts.partial + counts.failed + counts.incomplete > 0 && <span>실패·일부 미확인 {counts.partial + counts.failed + counts.incomplete}개</span>}
        {!!counts?.notRun && <span>미검사·건너뜀 {counts.notRun}개</span>}
        {!!counts?.paused && <span>중지 {counts.paused}개</span>}
        {!!counts?.running && <span>진행 중 {counts.running}개</span>}
      </p>
    </>}
    <div className="secret-overview-provider-last">
      <span>{item.approvedScopeCount === 0 ? '검사 대상의 출처를 확인하세요.' : item.lastAttempt?.requestedAt ? `최근 시도 ${scanDate(item.lastAttempt.requestedAt)}` : '검사 기록 없음'}</span>
      {item.lastAttempt?.runId ? <Link to={withSecretOrigin(`/secrets/history/${item.lastAttempt.runId}`, origin)}>실행 상세</Link> : <Link to={item.approvedScopeCount === 0 ? withSecretOrigin('/secrets/connections', origin) : history}>{item.approvedScopeCount === 0 ? '대상 확인' : '검사 이력'}</Link>}
    </div>
  </li>
}

function CollectionHealth({ summary, filters }: { summary: WorkbenchSummary; filters: WorkbenchFilters }) {
  const health = summary.collectionHealth
  const available = health?.status === 'AVAILABLE'
  const gapMetric = summary.metrics.find((item) => item.key === 'coverageGapScopes')
  const gaps = availableMetric(gapMetric) && gapMetric!.value! > 0
  const ignoredFilters = health?.notApplicableFilters?.filter((key) => key === 'assignee' ? !!filters.assignee : key === 'provider' ? filters.provider !== 'ALL' : key === 'environment' && filters.environment !== 'ALL') ?? []
  return <section className="card secret-overview-health" aria-labelledby="secret-health-title">
    <div className="secret-overview-section-title"><div><h2 id="secret-health-title">최근 검사 상태</h2><p>현재 승인된 검사 대상 기준</p></div><Link to={withSecretOrigin('/secrets/history', filters.origin)}>검사 이력</Link></div>
    {!available || !health ? <p className="secret-overview-muted">{summaryReason(health?.status)}</p> : <>
      {health.configuredConnectionCount === 0 ? <div className="secret-overview-health-empty"><p>현재 조회 조건에서 확인할 연결이 없어요.</p><Link to={withSecretOrigin('/secrets/connections', filters.origin)}>연결 관리</Link></div>
        : health.providers?.length ? <ul className="secret-overview-providers">{health.providers.map((item) => <ProviderHealth key={item.source} item={item} origin={filters.origin} />)}</ul>
        : health.approvedScopeCount === 0 ? <div className="secret-overview-health-empty"><p>등록된 검사 대상이 없어요.</p><Link to={withSecretOrigin('/secrets/connections', filters.origin)}>검사 대상 확인</Link></div>
        : <div className="secret-overview-health-empty"><p>검사 성공 {countText(health.counts?.success)} / {countText(health.approvedScopeCount)}개 대상</p><p>최근 시도 {health.lastAttempt?.requestedAt ? scanDate(health.lastAttempt.requestedAt) : '검사 기록 없음'}</p>{health.lastAttempt?.runId && <Link to={withSecretOrigin(`/secrets/history/${health.lastAttempt.runId}`, filters.origin)}>최근 실행 상세</Link>}</div>}
      {gaps && <div className="secret-overview-scan-warning"><strong>검사 누락·지연 {gapMetric!.value}개</strong><Link to={workbenchQueuePath(filters, 'COVERAGE_GAPS', summary.snapshotId)}>원인·복구 확인</Link></div>}
      {ignoredFilters.length > 0 && <p className="secret-overview-filter-note">{ignoredFilters.map(filterLabel).join('·')} 조건과 관계없이 검사 대상을 집계해요.</p>}
    </>}
    <SetupBacklog summary={summary} origin={filters.origin} />
  </section>
}

function overviewErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 403) return '시크릿을 조회할 권한이 없어요'
  if (error instanceof ApiError && [404, 409].includes(error.status)) return '조회 기준을 다시 확인해 주세요'
  return '현황을 불러오지 못했어요'
}

export function SecretOverviewPage() {
  const [params, setParams] = useSecretListParams(true)
  const client = useQueryClient()
  const { filters, valid } = parseWorkbenchFilters(params)
  const selectionKey = workbenchSearch(filters).toString()
  const rawView = params.get('view')
  const requestedView = rawView && Object.hasOwn(views, rawView) ? rawView as WorkView : null
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<{ selectionKey: string; message: string } | null>(null)
  const refreshMessage = refreshError?.selectionKey === selectionKey ? refreshError.message : null
  const legacyRun = params.get('run')
  const invalidated = isSecretSnapshotInvalidated(filters.snapshotId)
  const query = useSecretWorkbench(filters, valid && !legacyRun)
  const view = requestedView ?? 'review'
  useEffect(() => {
    if (!query.isSuccess || filters.snapshotId || invalidated) return
    const next = { ...filters, snapshotId: query.data.snapshotId }
    client.setQueryData(secretSummaryKey(next), query.data)
    setParams(overviewSearch(next, view), { replace: true })
  }, [query.isSuccess, query.data, filters, invalidated, client, setParams, view])

  const refresh = async () => {
    setRefreshing(true)
    setRefreshError(null)
    const clean = { ...filters, snapshotId: '' }
    try {
      const data = await client.fetchQuery({ queryKey: secretSummaryKey(clean), queryFn: () => fetchSecretSummary(clean), staleTime: 0 })
      const next = { ...clean, snapshotId: data.snapshotId }
      client.setQueryData(secretSummaryKey(next), data)
      setParams(overviewSearch(next, view), { replace: true })
    } catch (error) {
      setRefreshError({ selectionKey, message: overviewErrorMessage(error) })
    } finally {
      setRefreshing(false)
    }
  }
  if (legacyRun && /^[1-9]\d*$/.test(legacyRun)) return <Navigate replace to={withSecretOrigin(`/secrets/history/${legacyRun}`, params)} />
  const data = query.data
  const hasData = query.isSuccess && !invalidated && valid
  const preview = view === 'review' ? data?.workPreviews?.review : data?.workPreviews?.[view]
  const selectedMetric = data?.metrics.find((item) => item.key === views[view].metric)
  const canOpenList = availableMetric(selectedMetric)
  const listCount = preview?.status === 'AVAILABLE' ? countText(preview.total) : countText(selectedMetric?.value)

  return <>
    <PageHeader title="시크릿 현황" description="발견한 키를 확인하고 조치 결과까지 추적하세요." actions={<><button className="btn outline" disabled={refreshing || !valid} onClick={() => void refresh()}>{refreshing ? '갱신 중…' : '새로고침'}</button><Link className="btn outline" to={inventoryPath(filters)}>키·발견 위치</Link><Link className="btn primary" to={withSecretOrigin('/secrets/history?request=scan', filters.origin)}>검사 요청</Link></>} />
    {refreshMessage && !query.isError && <p className="notice error" role="alert">{refreshMessage}</p>}
    {!valid ? <p className="notice error" role="alert">현황 조회 조건을 확인해 주세요. <Link to="/secrets">조건 초기화</Link></p>
      : invalidated ? <section className="card secret-overview-empty"><h2>조회 기준이 변경됐어요</h2><button className="btn primary" onClick={() => void refresh()}>최신 현황 조회</button></section>
      : query.isPending ? <p className="card secret-scan-message" role="status">현황을 불러오는 중이에요.</p>
      : query.isError ? <section className="card secret-overview-empty" role="alert"><h2>{refreshMessage ?? overviewErrorMessage(query.error)}</h2><button className="btn outline" onClick={() => void refresh()}>다시 조회</button></section>
      : hasData && data ? <>
        <div className="secret-overview-asof"><span>기준 {scanDate(data.asOf)}</span><span>{data.restrictedCoverage ? '열람 가능한 범위' : '승인된 범위'}</span></div>
        <OverviewCards summary={data} view={view} onSelect={(next) => setParams(overviewSearch(filters, next))} />

        <div className="secret-overview-layout">
          <section id="secret-overview-work-list" className="card secret-overview-work" aria-labelledby="secret-work-title">
            <div className="secret-overview-section-title">
              <div><p className="secret-overview-work-label">팀의 할 일</p><h2 id="secret-work-title" aria-live="polite">{views[view].title}<span>{listCount}{views[view].unit}</span></h2></div>
              {canOpenList && <Link to={workbenchQueuePath(filters, views[view].bucket, data.snapshotId, views[view].stages)}>전체 목록</Link>}
            </div>
            {view === 'review' && filters.assignee && <p className="secret-overview-filter-note">확인 필요는 담당자 조건과 관계없이 열람 가능한 발견 위치를 집계해요.</p>}
            <WorkList preview={preview} summary={data} view={view} filters={filters} />
          </section>
          <CollectionHealth summary={data} filters={filters} />
        </div>
        {data.crossEnvironmentAlerts.status === 'AVAILABLE' && data.crossEnvironmentAlerts.value != null && data.crossEnvironmentAlerts.value > 0 && <section className="secret-overview-security-alert" aria-label="자격증명 여부 확인"><div><strong>자격증명 여부를 확인할 항목 {data.crossEnvironmentAlerts.value}건</strong><p>발견 위치와 실제 자격증명인지 확인한 근거를 검토하세요.</p></div><Link to="/secrets/triage/alerts">해당 항목 확인</Link></section>}
        <SecretCommonCauses summary={data} filters={filters} />
        <SecretRiskDistribution summary={data} filters={filters} />
        <footer className="secret-overview-footer"><Link to={inventoryPath(filters)}>키·발견 위치 목록</Link>{data.normalInventory.status === 'AVAILABLE' && data.normalInventory.value != null && <Link to={workbenchQueuePath(filters, 'NORMAL_INVENTORY', data.snapshotId)}>보관 승인·메타데이터·폐기 이력 {countText(data.normalInventory.value)}개 키</Link>}</footer>
      </> : null}
  </>
}
