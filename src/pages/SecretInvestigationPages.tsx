import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { addInvestigationEvidence, assignInvestigation, closeInvestigation, fetchInvestigation, fetchInvestigations, type InvestigationDetail } from '@/api/secretInvestigations'
import { PageHeader } from '@/components/PageHeader'
import { assignmentReasonLabel, evidenceKindLabel, futureEvidenceDeadline, idempotencyFor, missingEvidenceLabel, safeMutationMessage, validEvidenceRef } from '@/lib/secretEvidence'
import { kstInput, kstInputToUtc, positiveId, scanDate, scanDetailPath } from '@/lib/secretScan'
import { useSecretReadRefresh } from '@/lib/useSecretReadRefresh'
import './secret-governance.css'
import './secret-scan.css'

export function SecretInvestigationListPage() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? 'OPEN', owner = params.get('owner') ?? 'ALL'
  const page = (positiveId(params.get('page')) ?? 1) - 1
  const valid = ['OPEN', 'OVERDUE', 'CLOSED', 'ALL'].includes(status) && ['ME', 'ALL'].includes(owner)
  const tasks = useQuery({ queryKey: ['secret-investigations', status, owner, page], queryFn: () => fetchInvestigations(status, owner, page), enabled: valid, retry: false })
  const change = (key: string, value: string) => { const next = new URLSearchParams(params); next.set(key, value); next.set('page', '1'); setParams(next) }
  return <><Link className="secret-scan-back" to="/secrets/triage">← 확인 대기열로 돌아가기</Link><PageHeader title="추가 조사" description="부족한 근거와 담당자·확인 기한을 관리하세요." /><div className="card secret-scan-filters"><label>상태<select className="select" value={status} onChange={(e) => change('status', e.target.value)}><option value="OPEN">진행 중</option><option value="OVERDUE">기한 지남</option><option value="CLOSED">종료됨</option><option value="ALL">전체</option></select></label><label>담당<select className="select" value={owner} onChange={(e) => change('owner', e.target.value)}><option value="ALL">전체 허용 과제</option><option value="ME">내 담당 과제</option></select></label></div>
    {!valid ? <p className="notice error" role="alert">조사 조회 조건을 확인해 주세요.</p> : tasks.isPending ? <p className="card secret-scan-message" role="status">조사 과제를 불러오는 중이에요.</p> : tasks.isError ? <div className="card secret-scan-message" role="alert"><p>{tasks.error instanceof ApiError && tasks.error.status === 403 ? '조사 과제를 조회할 권한이 없어요.' : '조사 과제를 불러오지 못했어요.'}</p><button className="btn outline" onClick={() => void tasks.refetch()}>다시 조회</button></div> : <section className="card secret-scan-section"><h2>조사 과제</h2>{!tasks.data.items.length ? <p className="secret-scan-message">조건에 맞는 조사 과제가 없어요.</p> : <div className="table-scroll" tabIndex={0} role="region" aria-label="추가 조사 과제"><table><thead><tr><th>과제</th><th>대상·부족 근거</th><th>담당자</th><th>확인 기한</th><th>상태</th></tr></thead><tbody>{tasks.data.items.map((task) => <tr key={task.taskId}><td><Link to={`/secrets/triage/investigations/${task.taskId}`}>조사 #{task.taskId}</Link></td><td>{missingEvidenceLabel(task.missingReasonCode)}<span className="asset">{task.occurrenceId ? `위치 #${task.occurrenceId}` : `범위 #${task.scopeId}`}</span></td><td>{task.assigneeDisplayName ?? (task.assigneeUserId ? `사용자 #${task.assigneeUserId}` : '담당 미정')}</td><td>{task.dueAt ? scanDate(task.dueAt) : '기한 미설정'}</td><td>{task.status === 'CLOSED' ? '종료됨' : task.status === 'OVERDUE' ? '기한 지남' : '진행 중'}</td></tr>)}</tbody></table></div>}<div className="table-foot secret-table-foot"><span>조사 과제 {tasks.data.total}건</span><div className="row"><button className="btn outline" disabled={page === 0} onClick={() => { const next = new URLSearchParams(params); next.set('page', String(page)); setParams(next) }}>이전</button><span>{page + 1}</span><button className="btn outline" disabled={(page + 1) * tasks.data.size >= tasks.data.total} onClick={() => { const next = new URLSearchParams(params); next.set('page', String(page + 2)); setParams(next) }}>다음</button></div></div></section>}
  </>
}

function InvestigationForms({ task, onReload }: { task: InvestigationDetail; onReload: () => void }) {
  const [assignee, setAssignee] = useState(task.assigneeUserId ? String(task.assigneeUserId) : '')
  const [due, setDue] = useState(kstInput(task.dueAt))
  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState('')
  const [kind, setKind] = useState('')
  const [observedAt, setObservedAt] = useState(() => kstInput(new Date().toISOString()))
  const [closure, setClosure] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const [stale, setStale] = useState(false)
  const assignmentKey = useRef({ payload: '', key: '' }), evidenceKey = useRef({ payload: '', key: '' }), closeKey = useRef({ payload: '', key: '' })
  const refresh = useSecretReadRefresh()
  const success = () => { refresh(); onReload() }
  const error = (error: Error) => { if (error instanceof ApiError && error.status === 409) setStale(true) }
  const assign = useMutation({ mutationFn: () => { const request = { assigneeUserId: positiveId(assignee), dueAt: due ? kstInputToUtc(due) : null, reasonCode: reason, expectedVersion: task.version }; return assignInvestigation(task.taskId, { ...request, idempotencyKey: idempotencyFor(assignmentKey, request) }) }, onSuccess: success, onError: error })
  const add = useMutation({ mutationFn: () => { const request = { evidenceRef: evidence, evidenceKind: kind, observedAt: kstInputToUtc(observedAt), expectedVersion: task.version }; return addInvestigationEvidence(task.taskId, { ...request, idempotencyKey: idempotencyFor(evidenceKey, request) }) }, onSuccess: success, onError: error })
  const close = useMutation({ mutationFn: () => { const [type, rawId] = closure.split(':'); const request = { expectedVersion: task.version, resolvingDecisionId: type === 'decision' ? positiveId(rawId) : null, restoredRunScopeId: type === 'scope' ? positiveId(rawId) : null }; return closeInvestigation(task.taskId, { ...request, idempotencyKey: idempotencyFor(closeKey, request) }) }, onSuccess: success, onError: error })
  const busy = assign.isPending || add.isPending || close.isPending
  const eligibleAssignee = task.eligibleAssignees?.some((person) => String(person.userId) === assignee)
  const deadlineValid = due ? futureEvidenceDeadline(kstInputToUtc(due)) : reason === 'UNASSIGNED'
  const assignmentReady = task.allowedAssignmentReasonCodes?.includes(reason) && deadlineValid && (reason === 'UNASSIGNED' || eligibleAssignee)
  const evidenceReady = validEvidenceRef(evidence) && task.allowedEvidenceKinds?.includes(kind) && observedAt !== ''
  const closureReady = task.eligibleClosureEvidence?.decisions?.some((entry) => `decision:${entry.decisionId}` === closure) || task.eligibleClosureEvidence?.runScopes?.some((entry) => `scope:${entry.runScopeId}` === closure)
  return <>
    {stale && <p className="notice error" role="alert">조사 근거가 바뀌었어요. <button className="btn outline" onClick={onReload}>최신 조사 근거 다시 확인</button></p>}
    {(assign.isError || add.isError || close.isError) && <p className="notice error" role="alert">{safeMutationMessage(assign.error ?? add.error ?? close.error)}</p>}
    {task.capabilities?.canAssign && <section className="card secret-governance-form"><h2>담당자·기한 지정</h2><label>조사 담당자<select className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">담당자 선택</option>{task.eligibleAssignees?.map((person) => <option key={person.userId} value={person.userId}>{person.displayName}</option>)}</select></label><label>확인 기한 (KST)<input className="input" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></label><label>변경 사유<select className="select" value={reason} onChange={(e) => { setReason(e.target.value); if (e.target.value === 'UNASSIGNED') setAssignee('') }}><option value="">사유 선택</option>{task.allowedAssignmentReasonCodes?.map((code) => <option key={code} value={code}>{assignmentReasonLabel(code)}</option>)}</select></label><button className="btn primary" disabled={!assignmentReady || busy || stale} onClick={() => assign.mutate()}>담당·기한 저장</button></section>}
    {task.capabilities?.canAddEvidence && <section className="card secret-governance-form"><h2>조사 근거 추가</h2><label>근거 종류<select className="select" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">근거 종류 선택</option>{task.allowedEvidenceKinds?.map((code) => <option key={code} value={code}>{evidenceKindLabel(code)}</option>)}</select></label><label>안전한 근거 참조<input className="input" value={evidence} placeholder="TICKET:SEC-123" autoComplete="off" maxLength={80} onChange={(e) => setEvidence(e.target.value)} /><small>키·파일 경로·자유 URL은 입력하지 마세요.</small></label><label>근거 확인 시각 (KST)<input className="input" type="datetime-local" value={observedAt} onChange={(e) => setObservedAt(e.target.value)} /></label><button className="btn primary" disabled={!evidenceReady || busy || stale} onClick={() => add.mutate()}>근거 추가</button><p className="caption">자료를 추가해도 보관·노출 판단은 자동으로 바뀌지 않아요.</p></section>}
    {task.capabilities?.canClose && <section className="card secret-governance-form"><h2>조사 종료</h2><label>확인된 후속 결과<select className="select" value={closure} onChange={(e) => { setClosure(e.target.value); setConfirmClose(false) }}><option value="">종료 근거 선택</option>{task.eligibleClosureEvidence?.decisions?.map((entry) => <option key={`decision:${entry.decisionId}`} value={`decision:${entry.decisionId}`}>판정 #{entry.decisionId} · {entry.decision === 'ABNORMAL' ? '노출 확인' : entry.decision === 'NORMAL' ? '보관 허용' : '오탐 교정'}</option>)}{task.eligibleClosureEvidence?.runScopes?.map((entry) => <option key={`scope:${entry.runScopeId}`} value={`scope:${entry.runScopeId}`}>복구 검사 SCAN-{entry.runId} · 범위 #{entry.runScopeId}</option>)}</select></label><label className="secret-check-label"><input type="checkbox" checked={confirmClose} onChange={(e) => setConfirmClose(e.target.checked)} /> 선택한 결과가 이 조사 과제의 부족 근거를 해소함을 확인했어요.</label><button className="btn outline" disabled={!closureReady || !confirmClose || stale || busy} onClick={() => close.mutate()}>조사 종료</button><p className="caption">조사 종료는 대응 건의 해결을 의미하지 않아요.</p></section>}
  </>
}

export function SecretInvestigationDetailPage() {
  const { taskId: rawId } = useParams(), taskId = positiveId(rawId)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const task = useQuery({ queryKey: ['secret-investigation', taskId], queryFn: () => fetchInvestigation(taskId!), enabled: taskId != null, retry: false, refetchOnWindowFocus: false })
  useEffect(() => { heading.current?.focus(); window.scrollTo({ top: 0 }) }, [taskId])
  const reload = () => { void task.refetch().then(() => setRefreshVersion((value) => value + 1)) }
  return <><Link className="secret-scan-back" to="/secrets/triage/investigations">← 조사 목록으로 돌아가기</Link><section className="page-head"><div><h1 ref={heading} tabIndex={-1}>조사 #{taskId ?? '—'}</h1><p className="subtitle">부족한 근거를 보완하고 후속 결과를 확인하세요.</p></div></section>
    {!taskId ? <p className="card secret-scan-message" role="alert">조사 주소가 올바르지 않아요.</p> : task.isPending ? <p className="card secret-scan-message" role="status">조사 근거를 불러오는 중이에요.</p> : task.isError ? <div className="card secret-scan-message" role="alert"><p>{task.error instanceof ApiError && task.error.status === 403 ? '조사 근거를 조회할 권한이 없어요.' : task.error instanceof ApiError && task.error.status === 404 ? '조사 과제를 찾을 수 없어요.' : '조사 과제를 불러오지 못했어요.'}</p><button className="btn outline" onClick={reload}>다시 조회</button></div> : <>
      <section className="card secret-scan-section"><h2>{missingEvidenceLabel(task.data.missingReasonCode)}</h2><dl className="secret-scan-facts"><div><dt>확인 대상</dt><dd>{task.data.occurrenceId ? `위치 #${task.data.occurrenceId}` : `승인 범위 #${task.data.scopeId}`}</dd></div><div><dt>담당자</dt><dd>{task.data.assigneeDisplayName ?? (task.data.assigneeUserId ? `사용자 #${task.data.assigneeUserId}` : '담당 미정')}</dd></div><div><dt>확인 기한</dt><dd>{task.data.dueAt ? scanDate(task.data.dueAt) : '기한 미설정'}</dd></div><div><dt>조사 상태</dt><dd>{task.data.status === 'CLOSED' ? '종료됨' : '진행 중'}</dd></div></dl>{task.data.credentialSetId && task.data.occurrenceId ? <Link className="btn outline" to={`/secrets/triage/${task.data.credentialSetId}?occurrence=${task.data.occurrenceId}`}>위치 근거 확인</Link> : task.data.connectionId ? <Link className="btn outline" to={`/secrets/connections/${task.data.connectionId}/scopes?scopeId=${task.data.scopeId}`}>대상 범위 확인</Link> : null}{!task.data.dueAt && <p className="caption">기한이 없어 기한 초과 집계에 포함하지 않아요.</p>}</section>
      <InvestigationForms key={`${task.data.version}:${refreshVersion}`} task={task.data} onReload={reload} />
      <details className="card secret-scan-technical"><summary>조사 활동 기록</summary>{task.data.activities?.length ? <ol className="secret-investigation-history">{task.data.activities.map((activity) => <li key={activity.historyId}><strong>{activity.eventType === 'CLOSED' ? '조사 종료' : activity.eventType === 'EVIDENCE_ADDED' ? '근거 추가' : activity.eventType === 'ASSIGNED' ? '담당·기한 변경' : '조사 기록'}</strong><span>{scanDate(activity.createdAt)} · {activity.actorDisplayName ?? '담당자 정보 없음'}</span>{activity.evidenceRef && <span>{activity.evidenceRef}</span>}</li>)}</ol> : <p className="caption">표시할 활동 기록이 없어요.</p>}</details>
      {task.data.eligibleClosureEvidence?.runScopes?.length > 0 && <p className="caption">복구 실행: {task.data.eligibleClosureEvidence.runScopes.map((run) => <Link key={run.runScopeId} to={scanDetailPath(run.runId)}>SCAN-{run.runId} </Link>)}</p>}
    </>}
  </>
}
