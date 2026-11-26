import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { fetchActionRecord, saveActionRecord, type ActionDetail, type ActionKind, type ActionStatus } from '@/api/actionRecords'
import { actionRecordError, actionStatusLabels } from '@/lib/actionRecords'
import { formatKst } from '@/lib/reach'
import { ActionAssigneeField } from './ActionAssigneeField'
import { ActionSection } from './ActionSection'
import { Link } from 'react-router-dom'
import { linkActionCheck } from '@/api/actionRecords'
import { verificationLabels } from '@/lib/actionRecords'

function ActionEditor({ kind, id, data, verification }: { kind: ActionKind; id: number; data: ActionDetail; verification?: ReactNode }) {
  const client = useQueryClient()
  const [assignee, setAssignee] = useState(data.record.assigneeUserId)
  const [status, setStatus] = useState(data.record.status)
  const [note, setNote] = useState(data.record.note)
  const [confirmed, setConfirmed] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [scanId, setScanId] = useState('')
  const link = useMutation({ mutationFn: () => linkActionCheck(kind,id,data.record.version,Number(scanId)),
    onSuccess: (result) => { client.setQueryData(['action-record',kind,id], result); void client.invalidateQueries({queryKey:['action-records']}) },
    onError: () => setFeedback('검사 결과를 연결하지 못했어요. 조치 이후의 같은 서비스 검사인지 확인하고 다시 조회하세요.') })
  const dirty = assignee !== data.record.assigneeUserId || status !== data.record.status || note !== data.record.note
  const invalid = actionRecordError(status, assignee, note, confirmed)
  const save = useMutation({
    mutationFn: () => saveActionRecord(kind, id, { assigneeUserId: assignee, status, note, version: data.record.version,
      sourceVersion: data.source.version, confirmed }),
    onSuccess: (result) => {
      client.setQueryData(['action-record', kind, id], result)
      void client.invalidateQueries({ queryKey: ['action-records'] })
      void client.invalidateQueries({ queryKey: ['iac', 'drifts'] })
    },
    onError: (error) => setFeedback(error instanceof ApiError && error.status === 409
      ? '다른 변경이 먼저 저장됐어요. 입력을 확인한 후 최신 기록을 다시 불러오세요.'
      : error instanceof ApiError && error.status === 403 ? '조치 기록을 변경할 권한이 없어요.' : '저장하지 못했어요. 입력은 유지되며 다시 시도할 수 있어요.'),
  })
  useEffect(() => {
    if (!dirty) return
    const index = window.history.state?.idx
    let restoring = false
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const back = (event: PopStateEvent) => {
      if (restoring) { restoring = false; return }
      const next = event.state?.idx
      if (!Number.isInteger(index) || !Number.isInteger(next) || index === next) return
      if (!window.confirm('저장하지 않은 조치 내용이 있어요. 이동할까요?')) {
        event.stopImmediatePropagation(); restoring = true; window.history.go(index - next)
      }
    }
    const click = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (link && link.getAttribute('target') !== '_blank' && !link.hasAttribute('download') && !window.confirm('저장하지 않은 조치 내용이 있어요. 이동할까요?')) {
        event.preventDefault(); event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', unload)
    window.addEventListener('popstate', back, true)
    document.addEventListener('click', click, true)
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener('popstate', back, true); document.removeEventListener('click', click, true) }
  }, [dirty])
  const reload = () => {
    if (!dirty || window.confirm('입력한 내용을 버리고 최신 기록을 불러올까요?')) void client.invalidateQueries({ queryKey: ['action-record', kind, id] })
  }
  return <div className="action-record-content">
    <p>{data.source.title}</p>
    {data.record.version > 0 && <p className="caption" role="status">저장된 기록 · {actionStatusLabels[data.record.status]} · 최근 저장 {formatKst(data.history[0]?.recordedAt)}</p>}
    <form onSubmit={(event) => { event.preventDefault(); if (!invalid && dirty && !save.isPending) { setFeedback(''); save.mutate() } }}>
      <fieldset disabled={save.isPending} className="action-fields">
        <ActionSection step={1}>
          <ActionAssigneeField value={assignee == null ? '' : String(assignee)} onChange={value => setAssignee(value ? Number(value) : null)} options={[{value:'',label:'미지정'}, ...data.assignees.map(person => ({value:String(person.userId),label:person.displayName}))]} />
        </ActionSection>
        <ActionSection step={2}>
          <label className="field">조치 진행 상태<select className="select" value={status} onChange={(event) => { setStatus(event.target.value as ActionStatus); setConfirmed(false) }}>
            {Object.entries(actionStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <p className="caption">조치 기록 완료는 수행 기록의 마감이에요. 위험 해소 여부는 아래 확인 결과에서 따로 확인하세요.</p>
        </ActionSection>
        <ActionSection step={3}>
          <label className="field">수행한 조치<textarea className="input" rows={4} maxLength={2000} value={note} onChange={(event) => { setNote(event.target.value); setConfirmed(false) }} placeholder="수정한 내용과 이후 확인할 내용을 적어 주세요." /></label>
          <p className="caption">{note.length.toLocaleString()} / 2,000자 · 작성자와 저장 시각은 자동으로 기록돼요. 키 원문이나 비밀번호는 입력하지 마세요.</p>
          {status === 'RECORDED' && dirty && <label className="action-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />기록한 조치를 실제로 수행했습니다.</label>}
          {dirty && invalid && <p className="caption">{invalid}</p>}
          <button type="submit" className="btn primary" disabled={!dirty || !!invalid || save.isPending}>{save.isPending ? '저장 중…' : '조치 기록 저장'}</button>
          {feedback && <p className="notice error" role="alert">{feedback}</p>}
          {save.error instanceof ApiError && save.error.status === 409 && <button type="button" className="btn outline" onClick={reload}>최신 기록 불러오기</button>}
        </ActionSection>
      </fieldset>
    </form>
    <ActionSection step={4}>
      <p><strong>{verificationLabels[data.verification?.status ?? 'PENDING']}</strong></p>
      <p>{data.verification?.message ?? '연결된 재검사 결과가 없어요.'}</p>
      {data.verification?.target && <p className="action-note">검사 대상: {data.verification.target}</p>}
      {data.verification?.checkId && <p>검사 #{data.verification.checkId} · {formatKst(data.verification.checkedAt)}</p>}
      {data.verification?.scope && <p className="caption">{data.verification.scope}</p>}
      {data.verification?.href && <Link className="finding-link" to={data.verification.href}>검사 결과 보기</Link>}
      {kind === 'IMAGE' && <div className="action-fields">
        <label className="field">조치 후 검사한 이미지<select className="select" value={scanId} onChange={e=>setScanId(e.target.value)} disabled={dirty || link.isPending}>
          <option value="">검사 결과 선택</option>
          {(data.checks ?? []).map(c=><option key={c.scanId} value={c.scanId}>검사 #{c.scanId} · {c.status==='SUCCEEDED'?'완료':c.status==='FAILED'?'실패':'진행 중'} · {formatKst(c.finishedAt)} · {c.target.slice(0,24)}</option>)}
        </select></label>
        <p className="caption">같은 서비스와 이미지 저장소에서 조치 이후 시작한 검사만 표시해요. 기록을 수정하면 결과를 다시 연결해야 해요.</p>
        <button className="btn outline" disabled={dirty || !scanId || link.isPending} onClick={()=>{setFeedback('');link.mutate()}}>검사 결과 연결</button>
        <Link className="finding-link" to="/vulnerabilities/scans">이미지 검사로 이동</Link>
      </div>}
      {kind !== 'IMAGE' && data.verification?.href !== '/iac/checks' && <Link className="finding-link" to="/iac/checks">인프라 검사로 이동</Link>}
      <p className="caption">조치 기록 저장은 검사를 실행하거나 검사 결과를 바꾸지 않아요.</p>
      <button className="btn outline" onClick={reload} disabled={save.isPending || link.isPending}>결과 새로고침</button>
      {verification && <details><summary>기존 취약점 판단과 검토 이력</summary>{verification}</details>}
    </ActionSection>
    <details className="action-history"><summary>조치 기록 {data.history.length}건{data.history.length === 50 ? ' (최근 50건)' : ''}</summary>
      {data.history.length === 0 ? <p className="caption">아직 저장된 조치 기록이 없어요.</p> : <ol>{data.history.map((item) => <li key={item.version}>
        <strong>{actionStatusLabels[item.status]}</strong><span className="caption"> · {item.actorName} · {formatKst(item.recordedAt)}</span>
        <p className="caption">담당자: {data.assignees.find((person) => person.userId === item.assigneeUserId)?.displayName ?? (item.assigneeUserId ? `사용자 #${item.assigneeUserId}` : '미지정')}</p>
        {item.note && <p className="action-note">{item.note}</p>}
      </li>)}</ol>}
    </details>
  </div>
}

export function ActionRecordPanel({ kind, id, verification }: { kind: ActionKind; id: number; verification?: ReactNode }) {
  const record = useQuery({ queryKey: ['action-record', kind, id], queryFn: () => fetchActionRecord(kind, id), retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false })
  return <section className="action-record-panel" aria-label="조치 관리">
    <h2>조치 관리</h2>
    {record.isPending ? <p role="status">조치 기록을 불러오는 중…</p> : record.isError ? <div role="alert"><p>조치 기록을 불러오지 못했어요.</p><button className="btn outline" onClick={() => void record.refetch()}>다시 불러오기</button></div>
      : <ActionEditor key={`${kind}:${id}:${record.data.record.version}:${record.data.source.version}`} kind={kind} id={id} data={record.data} verification={verification} />}
  </section>
}
