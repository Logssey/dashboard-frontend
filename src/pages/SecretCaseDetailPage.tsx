import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import type { SecretBatchRevalidation } from '@/api/secretCaseRevalidations'
import { responseRefreshInterval, revalidationBlockLabel } from '@/lib/secretResponse'
import { ApiError } from '@/api/client'
import { fetchSecretCase, fetchSecretCaseActivities, type SecretCaseDetail } from '@/api/secretCases'
import { SecretRemediationSummary } from '@/components/SecretRemediationSummary'
import { SecretTaskGuidance } from '@/components/SecretTaskGuidance'
import { SecretCaseAssignment, SecretCaseWorkflow } from '@/components/SecretCaseWorkflow'
import { SecretExplanation } from '@/components/SecretExplanation'
import { SecretCaseVerification } from '@/components/SecretCaseVerification'
import { SecretCaseStatus } from '@/components/SecretCaseStatus'
import { SecretSourceCoordinates } from '@/components/SecretDiscoveryContext'
import { caseActionLabels, caseAssigneeLabel, caseReturnPath, caseStageLabels, locationNextAction, responseNextAction, recommendedCaseLocation, suggestedCaseTab } from '@/lib/secretResponse'
import { presenceLabels } from '@/lib/secretInventory'
import { positiveId, scanDate, scanDetailPath } from '@/lib/secretScan'
import { useSecretReadRefresh } from '@/lib/useSecretReadRefresh'
import './secret-response.css'
import './secret-governance.css'
import './secret-scan.css'
import './secret-case-workspace.css'

function CaseRecords({ caseId }: { caseId: number }) {
  const [params, setParams] = useSearchParams()
  const page = (positiveId(params.get('activityPage')) ?? 1) - 1
  const records = useQuery({ queryKey: ['secret-case-activities', caseId, page], queryFn: () => fetchSecretCaseActivities(caseId, page), retry: false })
  const labels: Record<string, string> = { LOCATION_ASSIGNED: '위치 담당자 변경', COORDINATOR_ASSIGNED: '조정 담당자 변경', ACTION_RECORDED: '외부 조치 기록', ACTIONS_COMPLETED: '조치 기록 마침', CHECKLIST_CHANGED: '체크리스트 변경', REVALIDATION_REQUESTED: '재검사 요청', REVALIDATION_FINISHED: '재검사 완료', RESOLUTION_DECIDED: '해결 확인', CASE_RESOLVED: '해결 확인 저장', CASE_DISMISSED: '교정 근거로 종료', EXCEPTION_APPROVED: '기간을 정한 위험 수용', EXCEPTION_REVOKED: '위험 수용 취소', TRANSFER_SUBMITTED: '이관·인수 근거 제출', TRANSFER_REVIEWED: '이관·인수 근거 검토', LIFECYCLE_SUBMITTED: '키 폐기·교체 근거 제출', LIFECYCLE_REVIEWED: '키 폐기·교체 근거 검토', REVALIDATION_RESUMED: '다시 발견된 위치의 추가 조치' }
  if (records.isPending) return <p role="status">활동 기록을 불러오는 중이에요.</p>
  if (records.isError) return <div role="alert"><p>활동 기록을 불러오지 못했어요.</p><button className="btn outline" onClick={() => void records.refetch()}>다시 조회</button></div>
  const goPage = (next: number) => { const search = new URLSearchParams(params); search.set('activityPage', String(next + 1)); setParams(search) }
  return <>{!records.data.historyComplete && <p className="notice">새 위치별 활동 기록을 표시해요. 이전 형식의 활동은 이 목록에 모두 포함되지 않을 수 있어요.</p>}{records.data.items.length === 0 ? <p className="secret-scan-message">표시할 활동이 없어요.</p> : <ol className="secret-response-records">{records.data.items.map((item) => <li key={item.activityId}><div><strong>{labels[item.type] ?? '대응 활동'}</strong><time>{scanDate(item.happenedAt)}</time></div><p>{item.occurrenceId ? `위치 #${item.occurrenceId}` : '건 조정'} · 사용자 #{item.actorUserId}</p>{item.actionType && <p>{caseActionLabels[item.actionType] ?? '외부 조치'} · 실제 수행 {scanDate(item.performedAt)}</p>}{item.evidenceRef && <p>근거 {item.evidenceRef}</p>}</li>)}</ol>}<div className="table-foot secret-table-foot"><span>활동 {records.data.total}건</span><div className="row"><button className="btn outline" disabled={page === 0} onClick={() => goPage(page - 1)}>이전</button><span>{page + 1} 페이지</span><button className="btn outline" disabled={(page + 1) * records.data.size >= records.data.total} onClick={() => goPage(page + 1)}>다음</button></div></div></>
}

function CaseWorkspace({ detail, onReload, disabled, onStale, refreshVersion, confirmLeave }: { detail: SecretCaseDetail; onReload: () => void; disabled: boolean; onStale: () => void; refreshVersion: number; confirmLeave: () => boolean }) {
  const [params, setParams] = useSearchParams()
  const route = useLocation()
  const tab = params.get('tab') ?? suggestedCaseTab(detail)
  const [receipt, setReceipt] = useState<{ kind: string; runId?: number; canViewRun?: boolean } | null>(null)
  const [batchReceipt, setBatchReceipt] = useState<SecretBatchRevalidation | null>(null)
  const selectedId = positiveId(params.get('occurrence'))
  const selected = params.has('occurrence') ? detail.occurrences.find((item) => item.occurrenceId === selectedId) : recommendedCaseLocation(detail)
  const presenceFilter = params.get('locationPresence') ?? ''
  const visibleLocations = detail.occurrences.filter((location) => !presenceFilter || location.requiredRemediation !== false
    && (location.remediationPresence ?? (location.presence === 'PRESENT' ? 'PRESENT' : location.locationAbsenceCheck?.status === 'PASSED' ? 'MISSING' : 'UNKNOWN')) === presenceFilter)
  const tabs = { work: '현재 작업', locations: '위치별 현황', verification: '재검사·해결', history: '활동 기록' }
  const common = { detail, onReload, onStale, disabled, onCompleted: completed, onBatchCompleted: setBatchReceipt }

  useEffect(() => {
    if (!params.has('occurrence') && selected) {
      const next = new URLSearchParams(params)
      next.set('occurrence', String(selected.occurrenceId))
      setParams(next, { replace: true })
    }
  }, [params, selected?.occurrenceId, setParams])
  useEffect(() => {
    const anchor = route.hash.slice(1)
    const target = document.getElementById(anchor.startsWith('case-') ? anchor : `case-${tab}-title`)
    target?.focus({ preventScroll: true })
    if (anchor.startsWith('case-')) target?.scrollIntoView({ block: 'center' })
  }, [tab, selectedId, params.get('check'), route.hash])

  function completed(kind: string, runId?: number, canViewRun?: boolean) {
    setReceipt({ kind, runId, canViewRun })
    if (kind === 'ACTIONS_COMPLETED') {
      const next = new URLSearchParams(params)
      next.set('tab', 'verification')
      next.set('check', 'locations')
      setParams(next)
    }
  }
  function select(occurrenceId: number, nextTab = 'work') {
    if (!confirmLeave()) return
    const next = new URLSearchParams(params)
    next.set('occurrence', String(occurrenceId))
    next.set('tab', nextTab)
    setParams(next)
  }
  function showLocations(presence: 'PRESENT' | 'MISSING' | 'UNKNOWN') {
    if (!confirmLeave()) return
    const next = new URLSearchParams(params)
    next.set('tab', 'locations')
    next.set('locationPresence', presence)
    setParams(next)
  }
  const receiptLabels: Record<string, string> = {
    LOCATION_ASSIGNED: '이 위치의 조치 담당자를 저장했어요.',
    COORDINATOR_ASSIGNED: '대응 담당자를 저장했어요.',
    ASSIGNED: '담당자를 저장했어요.',
    ACTIONS_COMPLETED: '조치 기록을 마쳤어요. 재검사를 진행하세요.',
    REVALIDATION_REQUESTED: '재검사를 등록했어요. 위치별 결과를 기다리고 있어요.',
    ACTION_RESUMED: '추가 조치를 시작할 수 있어요.',
    ACTION_RECORDED: '실제 조치를 기록했어요.',
  }

  return <>
    <section className="card secret-scan-section secret-case-workspace-summary">
      <div className="secret-response-section-heading"><h2>{detail.maskedLabel}</h2><SecretCaseStatus detail={detail} /></div>
      <ol className="secret-response-steps" aria-label="대응 진행 단계">{Object.entries(caseStageLabels).map(([code, label]) =>
        <li key={code} aria-current={detail.stage === code ? 'step' : undefined}>{label}</li>)}</ol>
      <p className="secret-case-next-work">{responseNextAction(detail)}</p>
      <p className="caption">이 대응의 열람 위치 {detail.visibleOccurrenceCount}곳 · 담당자 {caseAssigneeLabel(detail.assigneeDisplayName, detail.assigneeTeam, detail.assigneeUserId)}</p>
      {detail.responseProgress && <dl className="secret-case-response-progress" aria-label="열람 가능한 위치의 조치 진행"><div><dt>조치 기록</dt><dd>{detail.responseProgress.actionRecordedCount} / {detail.responseProgress.visibleLocationCount}곳</dd></div><div><dt>조치 완료</dt><dd>{detail.responseProgress.actionsCompletedCount}곳</dd></div><div><dt>재검사 대기</dt><dd>{detail.responseProgress.revalidationQueuedCount}곳</dd></div><div><dt>조치 후 미발견</dt><dd>{detail.responseProgress.postActionMissingCount}곳</dd></div></dl>}
      {detail.restrictedCoverage && <p className="caption">현재 사용자가 열람할 수 있는 위치를 표시해요.</p>}
      {!detail.isCurrent && <p className="caption">종료된 대응의 기록을 보고 있어요.</p>}
    </section>
    {(detail.capabilities.canAssign || detail.capabilities.canAssignSelf) && <SecretCaseAssignment key={`coord:${detail.version}:${refreshVersion}`} {...common} />}
    <SecretRemediationSummary data={detail.remediationSummary} onSelect={showLocations} />
    <SecretExplanation topic="CASE" id={detail.caseId} contextVersion={detail.version} />
    {receipt && <section className="secret-response-receipt" role="status">
      <strong>{receiptLabels[receipt.kind] ?? '작업 결과를 저장했어요.'}</strong>
      {receipt.kind === 'REVALIDATION_REQUESTED' && receipt.runId && receipt.canViewRun && <Link className="btn outline" to={scanDetailPath(receipt.runId)}>SCAN-{receipt.runId} 실행 상태</Link>}
    </section>}
    {batchReceipt && <section className="secret-response-receipt" role="status">
      <strong>재검사 {batchReceipt.acceptedCount}곳 등록 · {batchReceipt.failedCount}곳 등록 실패</strong>
      {batchReceipt.items.filter((item) => item.status === 'FAILED').map((item) => <p key={item.occurrenceId}>위치 #{item.occurrenceId} · {revalidationBlockLabel(item.reasonCode ?? item.errorCode)}</p>)}
      <button className="btn outline" onClick={() => setBatchReceipt(null)}>확인</button>
    </section>}
    <nav className="secret-response-tabs" aria-label="대응 상세 구역">{Object.entries(tabs).map(([code, label]) => {
      const next = new URLSearchParams(params)
      next.set('tab', code)
      return <Link key={code} to={`?${next}`} aria-current={tab === code ? 'page' : undefined}
>{label}</Link>
    })}</nav>
    {!Object.hasOwn(tabs, tab) ? <p className="notice error" role="alert">상세 구역 주소를 확인해 주세요.</p>
      : tab === 'history' ? <section className="card secret-scan-section"><h2 id="case-history-title" tabIndex={-1}>활동 기록</h2><CaseRecords caseId={detail.caseId} /></section>
        : tab === 'verification' ? <section className="card secret-scan-section"><h2 id="case-verification-title" tabIndex={-1}>재검사·해결 근거</h2><SecretCaseVerification {...common} refreshVersion={refreshVersion} /></section>
          : tab === 'locations' ? <section className="card secret-scan-section">
            <div className="row between"><h2 id="case-locations-title" tabIndex={-1}>위치별 현황</h2>{presenceFilter && <button className="btn outline" onClick={() => { const next = new URLSearchParams(params); next.delete('locationPresence'); setParams(next) }}>모든 대응 위치 보기</button>}</div>
            {!visibleLocations.length ? <p className="secret-scan-message">선택한 상태의 대응 위치가 없어요.</p> : <div className="secret-case-location-list">{visibleLocations.map((location) => <article key={location.occurrenceId}>
              <div><button className="finding-link" onClick={() => select(location.occurrenceId)}>{location.safeLocationLabel}</button><span className="asset">{location.source} · {presenceLabels[location.presence] ?? '확인 불가'}</span></div>
              <div><span>{caseStageLabels[location.responseStatus] ?? '상태 확인 필요'}</span><span className="asset">{caseAssigneeLabel(location.assigneeDisplayName, location.assignedTeam, location.assignedUserId)}</span></div>
              <button className="btn outline" onClick={() => select(location.occurrenceId)}>{locationNextAction(location)}</button>
            </article>)}</div>}
          </section>
            : <section className="card secret-scan-section">
              <h2 id="case-work-title" tabIndex={-1}>현재 작업</h2>
              <label className="secret-response-location-picker">작업할 위치<select className="select" value={selected?.occurrenceId ?? ''} onChange={(event) => select(Number(event.target.value))}><option value="">위치를 선택하세요</option>{detail.occurrences.map((location) => <option key={location.occurrenceId} value={location.occurrenceId}>{location.safeLocationLabel} · {locationNextAction(location)}</option>)}</select></label>
              {selectedId && !selected ? <p className="notice error" role="alert">선택한 위치를 현재 대응에서 조회할 수 없어요. 위치를 다시 선택하세요.</p>
                : !selected ? <p className="secret-scan-message">현재 열람 가능한 대응 위치가 없어요.</p>
                  : <div key={`${selected.occurrenceId}:${detail.version}:${refreshVersion}`}>
                    <SecretSourceCoordinates location={selected} />
                    <dl className="secret-scan-facts"><div><dt>다음 작업</dt><dd>{locationNextAction(selected)}</dd></div><div><dt>위치 담당자</dt><dd>{caseAssigneeLabel(selected.assigneeDisplayName, selected.assignedTeam, selected.assignedUserId)}</dd></div><div><dt>마지막 위치 검사</dt><dd>{presenceLabels[selected.presence] ?? '확인 불가'}</dd></div><div><dt>마지막 실제 조치</dt><dd>{selected.lastMaterialActionAt ? scanDate(selected.lastMaterialActionAt) : '아직 기록 없음'}</dd></div></dl>
                    {selected.canAssign && <SecretCaseAssignment {...common} occurrence={selected} />}
                    <SecretCaseWorkflow {...common} occurrence={selected} />
                    <details className="secret-response-disclosure"><summary>위치 기록·조치 주기</summary><p>위치 #{selected.occurrenceId} · 조치 주기 {selected.actionCycle}</p></details>
                  </div>}
            </section>}
    <details className="card secret-case-context"><summary>대응 담당자·관련 근거</summary>
      <SecretTaskGuidance guidance={detail.taskGuidance} />
      <Link className="btn outline" to={`/secrets/${detail.secretId}?origin=${detail.caseOrigin}`}>키 전체의 발견 위치 비교</Link>
      <p className="caption">현재 정보 조회 {scanDate(detail.readAt)}</p>
    </details>
  </>
}

export function SecretCaseDetailPage() {
  const { caseId: rawId } = useParams(), caseId = positiveId(rawId)
  const [params] = useSearchParams(), heading = useRef<HTMLHeadingElement>(null)
  const [stale, setStale] = useState(false), [refreshVersion, setRefreshVersion] = useState(0), [refreshing, setRefreshing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const detail = useQuery({ queryKey: ['secret-case', caseId], queryFn: () => fetchSecretCase(caseId!), enabled: caseId !== null, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
    refetchInterval: (query) => responseRefreshInterval(query.state.data, dirty, !!query.state.error),
  })
  const refresh = useSecretReadRefresh()
  useEffect(() => { heading.current?.focus(); window.scrollTo({ top: 0 }); setStale(false); setDirty(false) }, [caseId])
  useEffect(() => {
    if (!dirty) return
    const currentIndex = window.history.state?.idx
    let restoring = false
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const beforeLink = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (anchor?.getAttribute('target') === '_blank' || anchor?.hasAttribute('download') || anchor?.getAttribute('href') === window.location.href) return
      if (!anchor || !window.confirm('저장하지 않은 입력이 있어요. 이동하면 입력을 잃을 수 있어요. 계속할까요?')) {
        if (anchor) { event.preventDefault(); event.stopPropagation() }
      } else setDirty(false)
    }
    const beforePop = (event: PopStateEvent) => {
      if (restoring) { restoring = false; return }
      const nextIndex = event.state?.idx
      if (!Number.isInteger(currentIndex) || !Number.isInteger(nextIndex) || currentIndex === nextIndex) return
      if (window.confirm('저장하지 않은 입력이 있어요. 이동하면 입력을 잃을 수 있어요. 계속할까요?')) { setDirty(false); return }
      event.stopImmediatePropagation()
      restoring = true
      window.history.go(currentIndex - nextIndex)
    }
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('popstate', beforePop, true)
    document.addEventListener('click', beforeLink, true)
    return () => { window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('popstate', beforePop, true); document.removeEventListener('click', beforeLink, true) }
  }, [dirty])
  const confirmLeave = () => { if (dirty && !window.confirm('저장하지 않은 입력이 있어요. 입력을 지우고 계속할까요?')) return false; setDirty(false); return true }
  const reload = () => { setDirty(false); setRefreshing(true); refresh(); void detail.refetch().then((result) => { if (result.isSuccess) { setStale(false); setRefreshVersion((current) => current + 1) } }).finally(() => setRefreshing(false)) }
  return <div onChangeCapture={(event) => { if (event.target instanceof Element && event.target.closest('.secret-governance-form')) setDirty(true) }}><Link className="secret-scan-back" to={caseReturnPath(params, caseId)}>← 이전 목록·키로 돌아가기</Link><section className="page-head"><div><h1 ref={heading} tabIndex={-1}>CASE-{caseId ?? '—'}</h1><p className="subtitle">위치별 실제 조치와 그 이후의 확인 근거를 관리하세요.</p></div><button className="btn outline" disabled={refreshing} onClick={() => { if (confirmLeave()) reload() }}>최신 상태 조회</button></section>
    {stale && <p className="notice error" role="alert">담당자·권한 또는 근거가 바뀌었어요. <button className="btn outline" onClick={() => { if (confirmLeave()) reload() }}>최신 상태 확인 후 계속</button></p>}
    {!caseId ? <p className="card secret-scan-message" role="alert">대응 건 주소가 올바르지 않아요.</p> : detail.isPending ? <p className="card secret-scan-message" role="status">현재 대응 근거를 불러오는 중이에요.</p> : detail.isError ? <section className="card secret-scan-message" role="alert"><p>{detail.error instanceof ApiError && [403, 404].includes(detail.error.status) ? '대응 건을 찾을 수 없거나 접근 권한이 없어요.' : '대응 건을 불러오지 못했어요.'}</p><button className="btn outline" onClick={reload}>다시 조회</button></section> : detail.data.caseId !== caseId ? <p className="notice error" role="alert">조회한 대응 건이 주소와 일치하지 않아요.</p> : <CaseWorkspace key={`case:${detail.data.caseId}`} detail={detail.data} onReload={reload} onStale={() => setStale(true)} disabled={stale || refreshing} refreshVersion={refreshVersion} confirmLeave={confirmLeave} />}
  </div>
}
