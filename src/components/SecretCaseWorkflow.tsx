import { ActionAssigneeField } from './ActionAssigneeField'
import { SecretRecordReference } from '@/components/SecretRecordReference'
import { useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { assignSecretCase, assignSecretCaseToSelf, assignSecretLocation, completeSecretLocationActions, fetchSecretAssignees, recordSecretCaseAction, updateSecretCaseChecklist, type SecretActionType, type SecretAssignmentReason, type SecretCaseDetail, type SecretCaseOccurrence } from '@/api/secretCases'
import { idempotencyFor, safeMutationMessage } from '@/lib/secretEvidence'
import { caseActionLabels, caseAssigneeLabel, checklistLabels, validActionTime } from '@/lib/secretResponse'
import { kstInput, kstInputToUtc, scanDate } from '@/lib/secretScan'

interface CommonProps { detail: SecretCaseDetail; onReload: () => void; onStale: () => void; disabled: boolean; onCompleted?: (kind: string) => void }
export function SecretCaseAssignment({ detail, occurrence, onReload, onStale, disabled, onCompleted }: CommonProps & { occurrence?: SecretCaseOccurrence }) {
  const currentUser = occurrence ? occurrence.assignedUserId : detail.assigneeUserId
  const currentTeam = occurrence ? occurrence.assignedTeam : detail.assigneeTeam
  const [choice, setChoice] = useState<string | null>(null)
  const [reason, setReason] = useState<SecretAssignmentReason>(currentUser || currentTeam ? 'OWNERSHIP_CHANGE' : 'INITIAL_ASSIGNMENT')
  const [inherit, setInherit] = useState(detail.inheritUnassigned ?? true)
  const candidates = useQuery({ queryKey: ['secret-case-assignees', detail.caseId, occurrence?.occurrenceId], queryFn: () => fetchSecretAssignees(detail.caseId, occurrence?.occurrenceId), retry: false, refetchOnWindowFocus: false })
  const rows = candidates.data?.items ?? []
  const teams = [...new Set(rows.flatMap((person) => person.team ? [person.team] : []))]
  const currentChoice = currentUser ? `person:${rows.findIndex(person => person.userId === currentUser && person.team === currentTeam)}` : currentTeam ? `team:${teams.indexOf(currentTeam)}` : 'unassigned'
  const selection = choice ?? currentChoice
  const selectedPerson = selection.startsWith('person:') ? rows[Number(selection.slice(7))] : undefined
  const selectedTeam = selection.startsWith('team:') ? teams[Number(selection.slice(5))] : undefined
  const target = selectedPerson ? { team: selectedPerson.team, assigneeUserId: selectedPerson.userId } : selectedTeam ? { team: selectedTeam, assigneeUserId: null } : selection === 'unassigned' ? { team: null, assigneeUserId: null } : null
  const applyToUnassigned = !occurrence && detail.capabilities.canAssignUnassigned === true && inherit && selection !== 'unassigned'
  const unassigned = detail.occurrences.filter((item) => item.responseStatus !== 'RESOLVED' && !item.assignedTeam && !item.assignedUserId).length
  const changed = choice !== null && target !== null && (target.assigneeUserId !== currentUser || target.team !== currentTeam || applyToUnassigned && unassigned > 0)
  const failure = (error: Error) => { if (error instanceof ApiError && [403, 409].includes(error.status)) onStale() }
  const success = () => { onCompleted?.(occurrence ? 'LOCATION_ASSIGNED' : 'COORDINATOR_ASSIGNED'); onReload() }
  const mutation = useMutation({
    mutationFn: () => occurrence
      ? assignSecretLocation(detail.caseId, occurrence.occurrenceId, { ...target!, reasonCode: reason, expectedCaseVersion: detail.version, expectedOccurrenceVersion: occurrence.version })
      : assignSecretCase(detail.caseId, { ...target!, reasonCode: reason, expectedVersion: detail.version, ...(detail.capabilities.canAssignUnassigned ? { applyToUnassigned } : {}) }),
    onSuccess: success, onError: failure,
  })
  const self = useMutation({ mutationFn: () => assignSecretCaseToSelf(detail.caseId, { expectedVersion: detail.version, applyToUnassigned: detail.capabilities.canAssignUnassigned === true && inherit }), onSuccess: success, onError: failure })
  const busy = disabled || mutation.isPending || self.isPending
  return <section className="secret-case-assignment" id={occurrence ? "case-location-assignment" : "case-assignment"} tabIndex={-1}>
    {!occurrence && detail.capabilities.canAssignSelf && <div className="row"><button className="btn primary" disabled={busy} onClick={() => self.mutate()}>{self.isPending ? '배정 중…' : '내가 담당하기'}</button><span className="caption">현재 조치 가능한 위치를 함께 맡을 수 있어요.</span></div>}
    {!occurrence && detail.capabilities.canAssignUnassigned && unassigned > 0 && <label className="secret-check-label"><input type="checkbox" checked={inherit} onChange={(event) => setInherit(event.target.checked)} /> 미배정 조치 위치 {unassigned}곳에도 적용</label>}
    <div className="secret-governance-form">
      {candidates.isPending ? <p role="status">담당자 목록 확인 중…</p> : candidates.isError ? <div role="alert"><p>담당자를 불러오지 못했어요.</p><button className="btn outline" onClick={() => void candidates.refetch()}>다시 조회</button></div> : <>
        <ActionAssigneeField value={selection} disabled={busy} onChange={value => { setChoice(value); setReason(value === 'unassigned' ? 'UNASSIGNED' : currentUser || currentTeam ? 'OWNERSHIP_CHANGE' : 'INITIAL_ASSIGNMENT') }} options={[{value:'unassigned',label:'미지정'}, ...(currentUser && !rows.some(person => person.userId === currentUser && person.team === currentTeam) ? [{value:currentChoice,label:caseAssigneeLabel(occurrence?.assigneeDisplayName ?? detail.assigneeDisplayName,currentTeam,currentUser)}] : []), ...teams.map((team,index)=>({value:`team:${index}`,label:`${team} (팀)`})), ...rows.map((person,index)=>({value:`person:${index}`,label:caseAssigneeLabel(person.displayName,person.team,person.userId)}))]} />
        <p className="caption">변경한 담당자와 시각은 자동으로 기록돼요.</p>
        <button className="btn primary" disabled={busy || !changed || selection === 'unassigned' && reason !== 'UNASSIGNED' || selection !== 'unassigned' && reason === 'UNASSIGNED'} onClick={() => mutation.mutate()}>담당자 저장</button>
        {rows.length === 0 && <p className="caption">지정 가능한 조치 담당자가 없어요.</p>}
      </>}
    </div>
    {(mutation.isError || self.isError) && <p className="notice error" role="alert">{safeMutationMessage(mutation.error ?? self.error)}</p>}
  </section>
}

export function SecretCaseWorkflow({ detail, occurrence, onReload, onStale, disabled, onCompleted }: CommonProps & { occurrence: SecretCaseOccurrence }) {
  const [actionType, setActionType] = useState<SecretActionType | ''>('')
  const [performedAt, setPerformedAt] = useState(() => kstInput(new Date().toISOString())), [confirmAction, setConfirmAction] = useState(false)
  const actionKey = useRef({ payload: '', key: '' }), completeKey = useRef({ payload: '', key: '' })
  const failure = (error: Error) => { if (error instanceof ApiError && [403, 409].includes(error.status)) onStale() }
  const action = useMutation({
    mutationFn: (finish: boolean) => {
      const request = {
        actionType: actionType as SecretActionType,
        occurrenceId: occurrence.occurrenceId,
        performedAt: kstInputToUtc(performedAt)!,
        ...(finish ? { completeActions: true } : {}),
        expectedCaseVersion: detail.version,
        expectedOccurrenceVersion: occurrence.version,
      }
      return recordSecretCaseAction(detail.caseId, { ...request, idempotencyKey: idempotencyFor(actionKey, request) })
    },
    onSuccess: (_result, finish) => { onCompleted?.(finish ? 'ACTIONS_COMPLETED' : 'ACTION_RECORDED'); onReload() },
    onError: failure,
  })
  const complete = useMutation({ mutationFn: () => { const request = { expectedCaseVersion: detail.version, expectedOccurrenceVersion: occurrence.version }; return completeSecretLocationActions(detail.caseId, occurrence.occurrenceId, { ...request, idempotencyKey: idempotencyFor(completeKey, request) }) }, onSuccess: () => { onCompleted?.('ACTIONS_COMPLETED'); onReload() }, onError: failure })
  const checklist = useMutation({ mutationFn: (itemId: number) => { const item = detail.checklist.find((entry) => entry.itemId === itemId)!; return updateSecretCaseChecklist(detail.caseId, itemId, { completed: item.status !== 'DONE', guideVersion: item.guideVersion, evidenceRef: null, expectedCaseVersion: detail.version }) }, onSuccess: onReload, onError: failure })
  const busy = disabled || action.isPending || complete.isPending || checklist.isPending
  const ready = Boolean(actionType && occurrence.canRecordInternalAction && validActionTime(kstInputToUtc(performedAt)) && confirmAction)
  const items = detail.checklist.filter((item) => item.occurrenceId === occurrence.occurrenceId)
  return <div className="secret-response-location-work">
    {(action.isError || complete.isError || checklist.isError) && <p className="notice error" role="alert">{safeMutationMessage(action.error ?? complete.error ?? checklist.error)}</p>}
    {occurrence.canCompleteActions && <section className="secret-governance-form"><h3>조치 기록 마침</h3><p>마지막 실질 조치 {scanDate(occurrence.lastMaterialActionAt)}</p><button className="btn primary" disabled={busy || !occurrence.lastMaterialActionAt} onClick={() => complete.mutate()}>조치 기록 완료</button><p className="caption">다른 위치의 남은 조치와 대응 건의 해결은 별도로 확인해요.</p></section>}
    {occurrence.canRecordAction && <section className="secret-governance-form"><h3 id="case-action-form" tabIndex={-1}>수행한 조치 기록</h3><label>수행한 작업<select className="select" value={actionType} onChange={(e) => { setActionType(e.target.value as SecretActionType); setConfirmAction(false) }}><option value="">작업 선택</option>{Object.entries(caseActionLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label><label>실제 수행 시각 (KST)<input className="input" type="datetime-local" value={performedAt} onChange={(e) => setPerformedAt(e.target.value)} /></label><p className="caption">확인한 내용과 담당자, 시각은 내부 기록으로 저장해요.</p>{actionType === 'PERMISSION_REDUCED' && <p className="notice">권한 축소만으로 키 폐기나 노출 제거를 확인할 수 없어요.</p>}<label className="secret-check-label"><input type="checkbox" checked={confirmAction} onChange={(e) => setConfirmAction(e.target.checked)} /> 선택한 위치에서 실제로 수행한 작업이에요.</label><div className="row"><button className="btn primary" disabled={busy || !ready} onClick={() => action.mutate(occurrence.canRecordAndCompleteActions === true)}>{action.isPending ? '저장 중…' : occurrence.canRecordAndCompleteActions ? '조치 기록 완료' : '조치 기록 저장'}</button>{occurrence.canRecordAndCompleteActions && <button className="btn outline" disabled={busy || !ready} onClick={() => action.mutate(false)}>기록만 저장</button>}</div></section>}
    {items.length > 0 && <details className="secret-response-disclosure"><summary>보조 체크리스트 · {items.filter((item) => item.status === 'DONE').length}/{items.length}</summary><p className="caption">점검 누락을 줄이는 보조 기록이에요. 실제 조치·재검사를 대신하지 않아요.</p><ul className="secret-response-checklist">{items.map((item) => <li key={item.itemId}><div><strong>{checklistLabels[item.code] ?? '확인 항목'}</strong><span>{item.status === 'DONE' ? '기록 완료' : '미기록'}</span>{item.evidenceRef && <small><SecretRecordReference value={item.evidenceRef} /></small>}</div>{detail.isCurrent && detail.capabilities.canUpdateChecklist && (occurrence.canAssign || occurrence.canRecordAction || occurrence.canCompleteActions) && <div><button className="btn outline" disabled={busy} onClick={() => checklist.mutate(item.itemId)}>{item.status === 'DONE' ? '체크 해제' : '체크 기록'}</button></div>}</li>)}</ul></details>}
    {!occurrence.canRecordAction && !occurrence.canCompleteActions && occurrence.responseStatus !== 'RESOLVED' && <p className="caption">{occurrence.responseStatus === 'REVALIDATION_PENDING' ? '조치 기록을 완료했어요. 재검사 결과와 해결 조건을 확인하세요.' : '이 위치의 조치 기록을 변경할 권한이 없거나 현재 단계에서 변경할 수 없어요.'}</p>}
  </div>
}
