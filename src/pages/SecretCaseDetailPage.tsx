import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { fetchSecretCase, fetchSecretCaseActivities, type SecretCaseDetail } from '@/api/secretCases'
import { SecretCaseAssignment, SecretCaseWorkflow } from '@/components/SecretCaseWorkflow'
import { SecretCaseGuide } from '@/components/SecretCaseGuide'
import { SecretCaseRevalidation } from '@/components/SecretCaseRevalidation'
import { SecretLifecycleEvidence } from '@/components/SecretLifecycleEvidence'
import { caseActionLabels, caseAssigneeLabel, caseReturnPath, caseStageLabels, locationNextAction, responseNextAction } from '@/lib/secretResponse'
import { presenceLabels } from '@/lib/secretInventory'
import { positiveId, scanDate } from '@/lib/secretScan'
import { useSecretReadRefresh } from '@/lib/useSecretReadRefresh'
import './secret-response.css'
import './secret-governance.css'
import './secret-scan.css'

function CaseRecords({ caseId }: { caseId: number }) {
  const [params, setParams] = useSearchParams()
  const page = (positiveId(params.get('activityPage')) ?? 1) - 1
  const records = useQuery({ queryKey: ['secret-case-activities', caseId, page], queryFn: () => fetchSecretCaseActivities(caseId, page), retry: false })
  const labels: Record<string, string> = { LOCATION_ASSIGNED: '위치 담당자 변경', COORDINATOR_ASSIGNED: '조정 담당자 변경', ACTION_RECORDED: '외부 조치 기록', ACTIONS_COMPLETED: '조치 기록 마침', CHECKLIST_CHANGED: '체크리스트 변경', REVALIDATION_REQUESTED: '재검사 요청', REVALIDATION_FINISHED: '재검사 완료', RESOLUTION_DECIDED: '해결 확인' }
  if (records.isPending) return <p role="status">활동 기록을 불러오는 중이에요.</p>
  if (records.isError) return <div role="alert"><p>활동 기록을 불러오지 못했어요.</p><button className="btn outline" onClick={() => void records.refetch()}>다시 조회</button></div>
  const goPage = (next: number) => { const search = new URLSearchParams(params); search.set('activityPage', String(next + 1)); setParams(search) }
  return <><h2>활동 기록</h2>{!records.data.historyComplete && <p className="notice">새 위치별 활동 기록을 표시해요. 이전 형식의 활동은 이 목록에 모두 포함되지 않을 수 있어요.</p>}{records.data.items.length === 0 ? <p className="secret-scan-message">표시할 활동이 없어요.</p> : <ol className="secret-response-records">{records.data.items.map((item) => <li key={item.activityId}><div><strong>{labels[item.type] ?? '대응 활동'}</strong><time>{scanDate(item.happenedAt)}</time></div><p>{item.occurrenceId ? `위치 #${item.occurrenceId}` : '건 조정'} · 사용자 #{item.actorUserId}</p>{item.actionType && <p>{caseActionLabels[item.actionType] ?? '외부 조치'} · 실제 수행 {scanDate(item.performedAt)}</p>}{item.evidenceRef && <p>근거 {item.evidenceRef}</p>}</li>)}</ol>}<div className="table-foot secret-table-foot"><span>활동 {records.data.total}건</span><div className="row"><button className="btn outline" disabled={page === 0} onClick={() => goPage(page - 1)}>이전</button><span>{page + 1} 페이지</span><button className="btn outline" disabled={(page + 1) * records.data.size >= records.data.total} onClick={() => goPage(page + 1)}>다음</button></div></div></>
}

function CaseWorkspace({ detail, onReload, disabled, onStale, refreshVersion, confirmLeave }: { detail: SecretCaseDetail; onReload: () => void; disabled: boolean; onStale: () => void; refreshVersion: number; confirmLeave: () => boolean }) {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'work'
  const selectedId = positiveId(params.get('occurrence'))
  const selected = detail.occurrences.find((item) => item.occurrenceId === selectedId)
  const select = (occurrenceId: number, nextTab = 'work') => { if (!confirmLeave()) return; const search = new URLSearchParams(params); search.set('occurrence', String(occurrenceId)); search.set('tab', nextTab); setParams(search) }
  const common = { detail, onReload, onStale, disabled }
  const tabs = { work: '현재 작업', locations: '위치별 현황', verification: '재검사·해결', history: '활동 기록' }
  return <><section className="card secret-scan-section"><div className="secret-response-section-heading"><div><span className="secret-response-eyebrow">{detail.caseOrigin === 'TEST' ? '시험 대응' : '운영 대응'}</span><h2>{detail.maskedLabel}</h2></div><span className="secret-response-stage">{caseStageLabels[detail.stage] ?? '상태 확인 필요'}</span></div><dl className="secret-scan-facts"><div><dt>현재 할 일</dt><dd>{responseNextAction(detail)}</dd></div><div><dt>조정 담당자</dt><dd>{caseAssigneeLabel(detail.assigneeDisplayName, detail.assigneeTeam, detail.assigneeUserId)}</dd></div><div><dt>허용된 대응 위치</dt><dd>{detail.visibleOccurrenceCount}곳</dd></div><div><dt>현재 정보 조회</dt><dd>{scanDate(detail.readAt)}</dd></div></dl>{detail.restrictedCoverage && <p className="notice">열람 가능한 위치만 표시해요. 전체 대응의 해결 판단에는 보안 조정자의 확인이 필요해요.</p>}{!detail.isCurrent && <p className="notice">종료·교정된 건의 이력이에요. 현재 작업은 별도 대응 건에서 확인하세요.</p>}<Link className="btn outline" to={`/secrets/${detail.secretId}?origin=${detail.caseOrigin}`}>키·발견 위치 비교</Link>{detail.capabilities.canAssign && <SecretCaseAssignment key={`coord:${detail.version}:${refreshVersion}`} {...common} />}</section>
    <nav className="secret-response-tabs" aria-label="대응 상세 구역">{Object.entries(tabs).map(([code, label]) => { const next = new URLSearchParams(params); next.set('tab', code); return <Link key={code} to={`?${next}`} aria-current={tab === code ? 'page' : undefined}>{label}</Link> })}</nav>
    {!Object.hasOwn(tabs, tab) ? <p className="notice error" role="alert">상세 구역 주소를 확인해 주세요.</p> : tab === 'history' ? <section className="card secret-scan-section"><CaseRecords caseId={detail.caseId} /></section> : tab === 'verification' ? <section className="card secret-scan-section"><h2>재검사·해결 근거</h2><SecretCaseRevalidation detail={detail} onReload={onReload} onStale={onStale} disabled={disabled} /><SecretLifecycleEvidence key={`lifecycle:${detail.version}:${refreshVersion}`} detail={detail} onReload={onReload} onStale={onStale} disabled={disabled} /></section> : tab === 'locations' ? <section className="card secret-scan-section"><h2>위치별 현황</h2><p className="caption">동일 키라도 담당자·조치·존재 여부는 위치마다 달라요.</p><div className="table-scroll" tabIndex={0} role="region" aria-label="대응 위치 현황"><table><thead><tr><th>위치</th><th>존재</th><th>조치 단계</th><th>담당자</th><th>다음 작업</th></tr></thead><tbody>{detail.occurrences.map((location) => <tr key={location.occurrenceId}><td><button className="finding-link" onClick={() => select(location.occurrenceId)}>{location.safeLocationLabel}</button><span className="asset">{location.source}</span></td><td>{presenceLabels[location.presence] ?? '확인 불가'}</td><td>{caseStageLabels[location.responseStatus] ?? '상태 확인 필요'}</td><td>{caseAssigneeLabel(location.assigneeDisplayName, location.assignedTeam, location.assignedUserId)}</td><td>{locationNextAction(location)}</td></tr>)}</tbody></table></div></section> : <section className="card secret-scan-section"><h2>현재 작업</h2><label className="secret-response-location-picker">작업할 위치<select className="select" value={selected?.occurrenceId ?? ''} onChange={(e) => select(Number(e.target.value))}><option value="">위치를 선택하세요</option>{detail.occurrences.map((location) => <option key={location.occurrenceId} value={location.occurrenceId}>{location.safeLocationLabel} · {locationNextAction(location)}</option>)}</select></label>{selectedId && !selected ? <p className="notice error" role="alert">선택한 위치가 현재 허용된 대응 위치에 없어요. 위치를 다시 선택해 주세요.</p> : !selected ? <p className="secret-scan-message">작업할 위치를 선택하면 담당자와 실제로 할 수 있는 작업을 보여줘요.</p> : <div key={`${selected.occurrenceId}:${detail.version}:${refreshVersion}`}><dl className="secret-scan-facts"><div><dt>다음 작업</dt><dd>{locationNextAction(selected)}</dd></div><div><dt>위치 담당자</dt><dd>{caseAssigneeLabel(selected.assigneeDisplayName, selected.assignedTeam, selected.assignedUserId)}</dd></div><div><dt>현재 존재</dt><dd>{presenceLabels[selected.presence] ?? '확인 불가'}</dd></div><div><dt>조치 주기</dt><dd>{selected.actionCycle}</dd></div></dl>{selected.canAssign && <SecretCaseAssignment {...common} occurrence={selected} />}<SecretCaseWorkflow {...common} occurrence={selected} /><details className="secret-response-disclosure"><summary>대응 가이드</summary><SecretCaseGuide detail={detail} /></details></div>}</section>}
  </>
}

export function SecretCaseDetailPage() {
  const { caseId: rawId } = useParams(), caseId = positiveId(rawId)
  const [params] = useSearchParams(), heading = useRef<HTMLHeadingElement>(null)
  const [stale, setStale] = useState(false), [refreshVersion, setRefreshVersion] = useState(0), [refreshing, setRefreshing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const detail = useQuery({ queryKey: ['secret-case', caseId], queryFn: () => fetchSecretCase(caseId!), enabled: caseId !== null, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false })
  const refresh = useSecretReadRefresh()
  useEffect(() => { heading.current?.focus(); window.scrollTo({ top: 0 }); setStale(false); setDirty(false) }, [caseId])
  useEffect(() => {
    if (!dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const beforeLink = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!anchor || !window.confirm('저장하지 않은 입력이 있어요. 이동하면 입력을 잃을 수 있어요. 계속할까요?')) {
        if (anchor) { event.preventDefault(); event.stopPropagation() }
      } else setDirty(false)
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', beforeLink, true)
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', beforeLink, true) }
  }, [dirty])
  const confirmLeave = () => { if (dirty && !window.confirm('저장하지 않은 입력이 있어요. 입력을 지우고 계속할까요?')) return false; setDirty(false); return true }
  const reload = () => { setDirty(false); setRefreshing(true); refresh(); void detail.refetch().then((result) => { if (result.isSuccess) { setStale(false); setRefreshVersion((current) => current + 1) } }).finally(() => setRefreshing(false)) }
  return <div onChangeCapture={(event) => { if (event.target instanceof Element && event.target.closest('.secret-governance-form')) setDirty(true) }}><Link className="secret-scan-back" to={caseReturnPath(params, caseId)}>← 대응 목록으로 돌아가기</Link><section className="page-head"><div><h1 ref={heading} tabIndex={-1}>CASE-{caseId ?? '—'}</h1><p className="subtitle">위치별 실제 조치와 그 이후의 확인 근거를 관리하세요.</p></div><button className="btn outline" disabled={refreshing} onClick={() => { if (confirmLeave()) reload() }}>최신 상태 조회</button></section>
    {stale && <p className="notice error" role="alert">담당자·권한 또는 근거가 바뀌었어요. <button className="btn outline" onClick={reload}>최신 상태 확인 후 계속</button></p>}
    {!caseId ? <p className="card secret-scan-message" role="alert">대응 건 주소가 올바르지 않아요.</p> : detail.isPending ? <p className="card secret-scan-message" role="status">현재 대응 근거를 불러오는 중이에요.</p> : detail.isError ? <section className="card secret-scan-message" role="alert"><p>{detail.error instanceof ApiError && [403, 404].includes(detail.error.status) ? '대응 건을 찾을 수 없거나 접근 권한이 없어요.' : '대응 건을 불러오지 못했어요.'}</p><button className="btn outline" onClick={reload}>다시 조회</button></section> : detail.data.caseId !== caseId ? <p className="notice error" role="alert">조회한 대응 건이 주소와 일치하지 않아요.</p> : <CaseWorkspace detail={detail.data} onReload={reload} onStale={() => setStale(true)} disabled={stale || refreshing} refreshVersion={refreshVersion} confirmLeave={confirmLeave} />}
  </div>
}
