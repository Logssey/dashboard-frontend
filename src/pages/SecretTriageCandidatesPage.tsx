import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { fetchWorkbenchQueue, type WorkbenchQueueItem } from '@/api/secretWorkbenchQueue'
import { SecretTaskGuidance } from '@/components/SecretTaskGuidance'
import { setupReasonLabels } from '@/lib/secretScopeSetup'
import { PageHeader } from '@/components/PageHeader'
import { componentStateLabel } from '@/lib/labels'
import { inventorySubtypeLabel, presenceLabels } from '@/lib/secretInventory'
import { caseAssigneeLabel, caseStageLabels } from '@/lib/secretResponse'
import { reviewDetailPath } from '@/lib/secretReview'
import { parseWorkbenchFilters, workbenchBuckets, workbenchOptions, workbenchSearch, workbenchWhyLabel } from '@/lib/secretWorkbench'
import { positiveId, scanDate, scanReason, scopeTypeLabel } from '@/lib/secretScan'
import { isSecretSnapshotInvalidated } from '@/lib/secretSnapshotState'
import './secret-review.css'
import './secret-scan.css'

function targetLink(item: WorkbenchQueueItem, unit: string, params: URLSearchParams): { href: string | null; title: string; action: string; focus: string } {
  const secretId = item.credentialSetId ?? item.secretId
  const returnQuery = params.toString()
  if (unit === 'Scope') return { href: item.connectionId && item.scopeId ? params.get('bucket') === 'COVERAGE_GAPS' ? `/secrets/connections/${item.connectionId}/scopes?scopeId=${item.scopeId}&return=workbench&returnQuery=${encodeURIComponent(returnQuery)}` : `/secrets/connections/${item.connectionId}/scopes/${item.scopeId}?return=workbench&returnQuery=${encodeURIComponent(returnQuery)}` : null, title: item.safeDisplayAlias ?? `범위 #${item.scopeId ?? '미확인'}`, action: '범위 근거 확인', focus: String(item.scopeId ?? '') }
  if (unit === 'ResponseCase') return { href: item.caseId ? `/secrets/cases/${item.caseId}?return=workbench&returnQuery=${encodeURIComponent(returnQuery)}` : null, title: `CASE-${item.caseId ?? '미확인'}`, action: '대응 건 확인', focus: String(item.caseId ?? '') }
  return { href: secretId ? item.occurrenceId ? reviewDetailPath(secretId, item.occurrenceId, params) : `/secrets/${secretId}?origin=${params.get('origin') ?? 'PRODUCTION'}&return=workbench&returnQuery=${encodeURIComponent(returnQuery)}` : null, title: item.maskedLabel ?? (secretId ? `키 #${secretId}` : '대상 미확인'), action: item.occurrenceId ? '위치 근거 확인' : '키 상세', focus: item.occurrenceId ? `${secretId}:${item.occurrenceId}` : String(secretId ?? '') }
}
export function SecretTriageCandidatesPage() {
  const [params, setParams] = useSearchParams(), client = useQueryClient()
  const { filters, valid: filtersValid } = parseWorkbenchFilters(params)
  const bucket = params.get('bucket') ?? 'NEEDS_DECISION', stages = params.get('stages') ?? ''
  const page = (positiveId(params.get('page')) ?? 1) - 1
  const [refreshVersion, setRefreshVersion] = useState(0), restored = useRef('')
  const invalidated = isSecretSnapshotInvalidated(filters.snapshotId)
  const valid = filtersValid && Object.hasOwn(workbenchBuckets, bucket) && page <= 1_000_000 && (!stages || (['ACTION_REQUIRED', 'CURRENT_CASES'].includes(bucket) && stages.split(',').every((stage) => Object.hasOwn(caseStageLabels, stage) || stage === 'RISK_ACCEPTED')))
  const key = ['secret-review-queue', filters, bucket, stages, page, refreshVersion]
  const queue = useQuery({ queryKey: key, queryFn: () => fetchWorkbenchQueue(filters, bucket, stages, page), enabled: valid && !invalidated, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false })
  useEffect(() => {
    if (!queue.isSuccess || queue.isFetching || filters.snapshotId || !queue.data.snapshotId) return
    const nextFilters = { ...filters, snapshotId: queue.data.snapshotId }
    client.setQueryData(['secret-review-queue', nextFilters, bucket, stages, page, refreshVersion], queue.data)
    const next = workbenchSearch(nextFilters); next.set('bucket', bucket); next.set('page', String(page + 1)); if (stages) next.set('stages', stages)
    setParams(next, { replace: true })
  }, [queue.isSuccess, queue.isFetching, queue.data, filters, bucket, stages, page, refreshVersion, client, setParams])
  useEffect(() => {
    const focus = params.get('focus'); if (!queue.isSuccess || !focus || !/^[1-9]\d*(?::[1-9]\d*)?$/.test(focus) || restored.current === focus) return
    const link = document.getElementById(`review-link-${focus.replace(':', '-')}`)
    if (link) { link.focus({ preventScroll: true }); link.scrollIntoView({ block: 'center' }); restored.current = focus }
  }, [queue.isSuccess, queue.data, params])
  const change = (name: string, value: string) => { const next = new URLSearchParams(params); next.set(name, value); next.delete('snapshotId'); next.delete('focus'); next.set('page', '1'); if (name === 'bucket') next.delete('stages'); setParams(next) }
  const refresh = () => { const next = new URLSearchParams(params); next.delete('snapshotId'); next.delete('focus'); next.set('page', '1'); setRefreshVersion((value) => value + 1); setParams(next) }
  const selection = workbenchBuckets[bucket]
  const origin = filters.origin
  const overviewParams = workbenchSearch(filters)
  return <><Link className="secret-scan-back" to={`/secrets?${overviewParams}`}>← 같은 기준의 현황</Link><PageHeader title="확인 대기열" description="같은 기준시각의 대상과 다음 작업을 확인하세요." actions={<><Link className="btn outline" to="/secrets/triage/investigations">추가 조사</Link><Link className="btn outline" to="/secrets/triage/alerts">실키 경고</Link></>} />
    <section className="card secret-scan-filters"><label>할 일<select className="select" value={bucket} onChange={(e) => change('bucket', e.target.value)}>{Object.entries(workbenchBuckets).map(([code, config]) => <option key={code} value={code}>{config.label}</option>)}</select></label>{(['origin', 'source', 'provider', 'environment', 'assignee'] as const).map((name) => <label key={name}>{({ origin: '출처', source: '소스', provider: '발급자', environment: '환경', assignee: '담당' })[name]}<select className="select" value={filters[name]} onChange={(e) => change(name, e.target.value)}>{Object.entries(workbenchOptions[name]).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>)}<button className="btn outline" disabled={queue.isFetching} onClick={refresh}>새 기준으로 조회</button></section>
    {origin === 'TEST' && <p className="notice">시험 출처예요. 실제 키 가능성은 별도 경고·조사에서 확인하세요.</p>}
    {['COVERAGE_GAPS', 'UNCLASSIFIED'].includes(bucket) && (filters.provider !== 'ALL' || filters.environment !== 'ALL' || filters.assignee) && <p className="notice">이 승인 범위 목록에는 발급자·환경·담당자 조건을 적용하지 않아요. 소스·연결 범위는 유지해요.</p>}
    <section className="card secret-scan-section"><h2>{selection?.label ?? '확인 대기열'}{stages ? ` · ${stages.split(',').map((stage) => caseStageLabels[stage] ?? '위험 수용').join('·')}` : ''}</h2>{!valid ? <p className="notice error" role="alert">대기열 조회 조건을 확인해 주세요.</p> : invalidated ? <div className="secret-scan-message" role="status"><p>조회 근거가 변경됐어요. 최신 기준으로 확인해 주세요.</p><button className="btn primary" onClick={refresh}>새 기준으로 조회</button></div> : queue.isPending ? <p className="secret-scan-message" role="status">확인할 항목을 불러오는 중이에요.</p> : queue.isError ? <div className="secret-scan-message notice error" role="alert"><p>{queue.error instanceof ApiError && queue.error.status === 403 ? '이 대기열을 조회할 권한이 없어요.' : queue.error instanceof ApiError && [404, 409].includes(queue.error.status) && filters.snapshotId ? '조회 기준이 만료되거나 달라졌어요.' : '확인 대기열을 불러오지 못했어요.'}</p><button className="btn outline" onClick={() => filters.snapshotId ? refresh() : void queue.refetch()}>{filters.snapshotId ? '새 기준으로 조회' : '다시 조회'}</button></div> : <>
      <p className="caption">단위: {selection.unit} · 기준시각 {scanDate(queue.data.asOf)}</p>{queue.data.restrictedCoverage && <p className="notice">열람 가능한 대상만 표시해요. 권한 밖의 대상 수를 포함하지 않아요.</p>}{queue.data.partialCoverage === true && <p className="notice">확인하지 못한 검사 범위가 있어요.</p>}
      {!queue.data.items.length ? <p className="secret-scan-message">조건에 맞는 항목이 없어요.</p> : <div className="table-scroll" tabIndex={0} role="region" aria-label="업무별 확인 대기열"><table><thead><tr><th>대상</th><th>확인할 점</th><th>현재 상태</th><th>다음 행동</th></tr></thead><tbody>{queue.data.items.map((item, index) => {
        const target = targetLink(item, queue.data.unit, params)
        const missing = bucket === 'COVERAGE_GAPS' ? scanReason(item.coverage?.gapReasonCodes?.[0]) : bucket === 'UNCLASSIFIED' ? item.setupReasonCodes?.map((code) => setupReasonLabels[code] ?? '추가 확인').join(' · ') || '범위 설정 필요' : workbenchWhyLabel(item.whyHereCode ?? item.whyHere)
        return <tr key={`${queue.data.unit}:${target.focus || index}`}><td>{target.href ? <Link id={`review-link-${target.focus.replace(':', '-')}`} to={target.href}>{target.title}</Link> : <span>{target.title}</span>}{item.maskedLabel && queue.data.unit === 'ResponseCase' && <span className="asset">{item.maskedLabel}</span>}{item.safeLocationLabel && <span className="asset">{item.safeLocationLabel}</span>}</td><td>{missing}{item.inventorySubtype && <span className="asset">{inventorySubtypeLabel(item.inventorySubtype)}</span>}</td><td>{queue.data.unit === 'ResponseCase' ? <>{caseStageLabels[item.stage ?? ''] ?? (item.stage === 'RISK_ACCEPTED' ? '위험 수용' : '상태 확인 필요')}<span className="asset">{caseAssigneeLabel(item.assigneeDisplayName, item.assigneeTeam, item.assigneeUserId)}</span></> : queue.data.unit === 'Scope' ? <>{scopeTypeLabel(item.contentType ?? '')}<span className="asset">{item.coverage?.lastSuccessfulScan?.finishedAt ? `마지막 성공 ${scanDate(item.coverage.lastSuccessfulScan.finishedAt)}` : '현재 범위의 성공 검사 확인 필요'}</span></> : <>{item.componentState ? componentStateLabel[item.componentState as keyof typeof componentStateLabel] : '구성 정보 미제공'}{item.presence && <span className="asset">{presenceLabels[item.presence] ?? '현재 확인 불가'}</span>}</>}</td><td>{item.taskGuidance && <SecretTaskGuidance guidance={item.taskGuidance} compact />}{target.href ? <Link className="secret-history-detail-button" to={target.href}>{target.action}</Link> : '연결 정보 확인 필요'}</td></tr>
      })}</tbody></table></div>}
      <div className="table-foot secret-table-foot"><span>{queue.data.total}{queue.data.unit === 'Occurrence' ? '곳' : queue.data.unit === 'Scope' ? '개 범위' : queue.data.unit === 'CredentialSet' ? '개 키' : '건'}</span><div className="row"><button className="btn outline" disabled={page === 0} onClick={() => { const next = new URLSearchParams(params); next.set('page', String(page)); setParams(next) }}>이전</button><span>{page + 1} 페이지</span><button className="btn outline" disabled={(page + 1) * queue.data.size >= queue.data.total} onClick={() => { const next = new URLSearchParams(params); next.set('page', String(page + 2)); setParams(next) }}>다음</button></div></div>
    </>}</section>
  </>
}
