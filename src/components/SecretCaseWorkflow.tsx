import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import {
  recordSecretCaseAction, reviewSecretCase, startSecretCase, updateSecretCaseChecklist,
  type SecretActionType, type SecretCaseDetail, type SecretChecklistCode, type SecretReviewDecision,
} from '@/api/secretCases'

type WorkflowCommand =
  | { kind: 'review'; decision: SecretReviewDecision }
  | { kind: 'start' }
  | { kind: 'checklist'; itemId: number; completed: boolean; guideVersion: 'S2_V1'; evidenceRef: string | null }
  | { kind: 'action'; actionType: SecretActionType; occurrenceId: number; performedAt: string; evidenceRef: string }

type Feedback = { kind: 'success' | 'error'; message: string }

const checklistLabels: Record<SecretChecklistCode, string> = {
  IDENTIFY_OWNER: '키·자산 소유자 확인',
  ROTATE_OR_REVOKE: '키 교체 또는 폐기',
  REMOVE_EXPOSURE: '노출된 위치에서 제거',
  CHECK_ACCESS_LOGS: '사용 흔적·접근 로그 확인',
}

const actionLabels: Record<SecretActionType, string> = {
  ROTATED: '키 교체',
  REVOKED: '키 폐기',
  REMOVED_FROM_SOURCE: '노출 위치에서 제거',
  PERMISSION_REDUCED: '권한 축소',
}

const occurrenceStatusLabels = {
  OPEN: '대기', IN_PROGRESS: '조치 중', REVALIDATION_PENDING: '재검증 대기', RESOLVED: '해결',
} as const

const caseStageLabels = {
  OPEN: '신규 및 분석', IN_PROGRESS: '조치 중', REVALIDATION_PENDING: '재검증 대기', RESOLVED: '해결',
} as const

const evidencePattern = /^(TICKET|CHANGE):[A-Z]{2,10}-[1-9][0-9]{0,9}$/
const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul',
})

function displayDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : `${dateFormatter.format(date)} KST`
}

function localDateTime(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

const localDateTimeNow = () => localDateTime(new Date())

function operationName(command: WorkflowCommand): string {
  switch (command.kind) {
    case 'review': return '검토 결과'
    case 'start': return '조치 시작'
    case 'checklist': return '체크리스트'
    case 'action': return '외부 조치 기록'
  }
}

interface Props {
  detail: SecretCaseDetail
  onUpdated: (updated: SecretCaseDetail) => void
  onConflict: () => void
}

export function SecretCaseWorkflow({ detail, onUpdated, onConflict }: Props) {
  const [decision, setDecision] = useState<SecretReviewDecision | ''>('')
  const [reviewConfirmed, setReviewConfirmed] = useState(false)
  const [evidenceByItem, setEvidenceByItem] = useState<Record<number, string>>({})
  const [actionType, setActionType] = useState<SecretActionType | ''>('')
  const [actionOccurrenceId, setActionOccurrenceId] = useState<number | null>(null)
  const [performedAt, setPerformedAt] = useState(localDateTimeNow)
  const [actionEvidence, setActionEvidence] = useState('')
  const [actionConfirmed, setActionConfirmed] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const change = useMutation({
    mutationFn: (command: WorkflowCommand) => {
      const caseId = detail.caseId
      const expectedVersion = detail.version
      switch (command.kind) {
        case 'review': return reviewSecretCase(caseId, {
          decision: command.decision,
          reasonCode: command.decision === 'CONFIRMED' ? 'EVIDENCE_CONFIRMED' : 'INSUFFICIENT_EVIDENCE',
          expectedVersion,
        })
        case 'start': return startSecretCase(caseId, expectedVersion)
        case 'checklist': return updateSecretCaseChecklist(caseId, command.itemId, {
          completed: command.completed, guideVersion: command.guideVersion,
          evidenceRef: command.evidenceRef, expectedVersion,
        })
        case 'action': return recordSecretCaseAction(caseId, {
          actionType: command.actionType, occurrenceId: command.occurrenceId,
          performedAt: command.performedAt, evidenceRef: command.evidenceRef, expectedVersion,
        })
      }
    },
    onSuccess: (updated, command) => {
      onUpdated(updated)
      setFeedback({ kind: 'success', message: `${operationName(command)}이(가) 저장됐어요.` })
      if (command.kind === 'review') { setDecision(''); setReviewConfirmed(false) }
      if (command.kind === 'checklist') setEvidenceByItem((current) => ({ ...current, [command.itemId]: '' }))
      if (command.kind === 'action') {
        setActionType(''); setActionOccurrenceId(null); setActionEvidence(''); setActionConfirmed(false)
        setPerformedAt(localDateTimeNow())
      }
    },
    onError: (error, command) => {
      if (error instanceof ApiError && error.status === 409) {
        setFeedback({ kind: 'error', message: '다른 변경이 먼저 저장됐어요. 최신 상태를 불러와 확인한 뒤 다시 시도해 주세요.' })
        setReviewConfirmed(false)
        setActionConfirmed(false)
        setEvidenceByItem({})
        onConflict()
      } else if (error instanceof ApiError && error.status === 403) {
        setFeedback({ kind: 'error', message: `${operationName(command)} 권한이 없거나 현재 담당자가 아니에요. 새로고침 후 권한과 담당자를 확인해 주세요.` })
        onConflict()
      } else {
        setFeedback({ kind: 'error', message: `${operationName(command)}을(를) 저장하지 못했어요. 입력한 내용과 대응 상태를 확인해 주세요.` })
      }
    },
  })

  const submitAction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const date = new Date(performedAt)
    const evidenceRef = actionEvidence.trim().toUpperCase()
    if (!actionType || actionTargetId === null || !actionConfirmed || !evidencePattern.test(evidenceRef)
      || Number.isNaN(date.getTime()) || date.getTime() > Date.now()
      || date.getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000) return
    change.mutate({ kind: 'action', actionType, occurrenceId: actionTargetId, performedAt: date.toISOString(), evidenceRef })
  }

  const reviewStatus = detail.reviewStatus === 'REVIEWED' ? '검토 완료' : '검토 전'
  const capabilities = detail.capabilities
  const canReview = capabilities?.canReview ?? false
  const canStart = capabilities?.canStart ?? false
  const canUpdateChecklist = capabilities?.canUpdateChecklist ?? false
  const canRecordAction = capabilities?.canRecordAction ?? false
  const actionableOccurrences = (detail.occurrences ?? []).filter((item) => item.responseStatus === 'OPEN' || item.responseStatus === 'IN_PROGRESS')
  const actionTargetId = actionableOccurrences.some((item) => item.occurrenceId === actionOccurrenceId)
    ? actionOccurrenceId : actionableOccurrences[0]?.occurrenceId ?? null
  const actionDate = new Date(performedAt)
  const actionReady = Boolean(actionType && actionTargetId !== null && actionConfirmed && evidencePattern.test(actionEvidence.trim().toUpperCase())
    && !Number.isNaN(actionDate.getTime()) && actionDate.getTime() <= Date.now()
    && actionDate.getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000)

  return <div className="secret-case-workflow">
    <section className="secret-case-workflow-section" aria-labelledby="secret-case-review-title">
      <div className="secret-case-workflow-heading">
        <h3 id="secret-case-review-title">보안 검토</h3>
        <span className={`secret-case-review-status ${detail.reviewStatus?.toLowerCase() ?? 'unreviewed'}`}>{reviewStatus}</span>
      </div>
      <p className="caption">보안 담당자가 노출 근거를 검토하고 조치가 필요한지 기록해요. 키 원문은 입력하지 않아요.</p>
      {canReview && <div className="secret-case-workflow-form">
        <label className="field" htmlFor="secret-case-review-decision">검토 결과
          <select className="select" id="secret-case-review-decision" value={decision} onChange={(event) => {
            setDecision(event.target.value as SecretReviewDecision | '')
            setReviewConfirmed(false)
          }}>
            <option value="">결과 선택</option>
            <option value="CONFIRMED">노출 근거 확인 · 조치 진행</option>
            <option value="NEEDS_MORE_INFO">추가 확인 필요 · 검토 유지</option>
          </select>
        </label>
        <label className="secret-case-workflow-confirm"><input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} /> 발견 위치와 판정 근거를 확인했어요.</label>
        <button className="btn primary" type="button" disabled={!decision || !reviewConfirmed || change.isPending} onClick={() => change.mutate({ kind: 'review', decision: decision as SecretReviewDecision })}>
          {change.isPending && change.variables?.kind === 'review' ? '저장 중…' : '검토 결과 저장'}
        </button>
      </div>}
      {!canReview && detail.reviewStatus !== 'REVIEWED' && <p className="notice">보안 담당자의 검토가 아직 필요해요.</p>}
      {(detail.reviews ?? []).length > 0 && <ol className="secret-case-workflow-history">
        {detail.reviews.map((review) => <li key={review.reviewId}>
          <strong>{review.decision === 'CONFIRMED' ? '노출 근거 확인' : '추가 확인 필요'}</strong>
          <span>사유: {review.reasonCode === 'EVIDENCE_CONFIRMED' ? '발견 근거 확인' : '근거 부족'}</span>
          <span>{review.reviewedByName || `사용자 #${review.reviewedByUserId}`} · {displayDate(review.reviewedAt)}</span>
        </li>)}
      </ol>}
    </section>

    <section className="secret-case-workflow-section" aria-labelledby="secret-case-checklist-title">
      <div className="secret-case-workflow-heading">
        <h3 id="secret-case-checklist-title">조치 체크리스트</h3>
        <span className="caption">{(detail.checklist ?? []).filter((item) => item.status === 'DONE').length} / {(detail.checklist ?? []).length} 완료</span>
      </div>
      <p className="caption">실제 작업을 마친 뒤 외부 티켓 또는 변경 요청 번호를 근거로 남겨요. 키 값·비밀번호는 입력하지 마세요.</p>
      {canStart && <button className="btn primary secret-case-start" type="button" disabled={change.isPending} onClick={() => change.mutate({ kind: 'start' })}>
        {change.isPending && change.variables?.kind === 'start' ? '시작 중…' : '조치 시작'}
      </button>}
      {!canStart && detail.stage === 'OPEN' && <p className="notice">보안 검토가 끝나고 담당자로 지정되면 조치를 시작할 수 있어요.</p>}
      {(detail.checklist ?? []).length === 0 ? <p className="notice">체크리스트 항목이 없어요. 최신 대응 건을 다시 조회해 주세요.</p>
        : <ol className="secret-case-checklist">
          {detail.checklist.map((item) => {
            const evidenceRef = evidenceByItem[item.itemId] ?? ''
            const isDone = item.status === 'DONE'
            return <li key={item.itemId}>
              <div className="secret-case-checklist-heading">
                <strong>{checklistLabels[item.itemCode] ?? '확인 항목'}</strong>
                <span className={`secret-case-checklist-status ${isDone ? 'done' : ''}`}>{isDone ? '완료' : '대기'}</span>
              </div>
              {isDone && <p className="caption">근거 {item.evidenceRef || '—'} · 사용자 #{item.completedByUserId ?? '—'} · {displayDate(item.completedAt)}</p>}
              {canUpdateChecklist && <div className="secret-case-checklist-controls">
                {!isDone && <label className="field" htmlFor={`secret-case-checklist-${item.itemId}`}>근거 번호
                  <input id={`secret-case-checklist-${item.itemId}`} className="input" type="text" autoComplete="off" maxLength={28} placeholder="TICKET:SEC-123" value={evidenceRef} onChange={(event) => setEvidenceByItem((current) => ({ ...current, [item.itemId]: event.target.value.toUpperCase() }))} />
                </label>}
                <button className="btn outline" type="button" disabled={change.isPending || (!isDone && !evidencePattern.test(evidenceRef.trim()))} onClick={() => change.mutate({
                  kind: 'checklist', itemId: item.itemId, completed: !isDone,
                  guideVersion: item.guideVersion, evidenceRef: isDone ? null : evidenceRef.trim(),
                })}>{isDone ? '완료 취소' : '완료 기록'}</button>
              </div>}
            </li>
          })}
        </ol>}
      {(detail.checklistHistory ?? []).length > 0 && <details className="secret-case-workflow-history-detail">
        <summary>체크리스트 변경 이력 {detail.checklistHistory.length}건</summary>
        <ol className="secret-case-workflow-history">
          {detail.checklistHistory.map((change) => {
            const item = detail.checklist.find((candidate) => candidate.itemId === change.itemId)
            return <li key={`${change.itemId}-${change.caseVersion}`}>
              <strong>{item ? checklistLabels[item.itemCode] : `항목 #${change.itemId}`} · {change.toStatus === 'DONE' ? '완료' : '완료 취소'}</strong>
              <span>{change.evidenceRef ? `근거 ${change.evidenceRef} · ` : ''}사용자 #{change.changedByUserId} · {displayDate(change.changedAt)}</span>
            </li>
          })}
        </ol>
      </details>}
    </section>

    <section className="secret-case-workflow-section" aria-labelledby="secret-case-action-title">
      <h3 id="secret-case-action-title">외부 조치 기록</h3>
      <p className="caption">키 교체·폐기 등의 실제 조치는 외부 서비스에서 수행하고, 여기에는 수행 사실과 티켓 번호만 기록해요. 조치한 발견 위치는 재검증 대기가 돼요.</p>
      {(detail.occurrences ?? []).length > 0 && <ul className="secret-case-occurrence-list" aria-label="대응 건의 발견 위치별 상태">
        {detail.occurrences.map((item) => <li key={item.occurrenceId}>발견 위치 #{item.occurrenceId} · {occurrenceStatusLabels[item.responseStatus] ?? '상태 확인 필요'}</li>)}
      </ul>}
      {canRecordAction && <form className="secret-case-workflow-form" onSubmit={submitAction}>
        <label className="field" htmlFor="secret-case-action-occurrence">조치한 발견 위치
          <select className="select" id="secret-case-action-occurrence" value={actionTargetId ?? ''} onChange={(event) => setActionOccurrenceId(Number(event.target.value))} required>
            {actionableOccurrences.length === 0 && <option value="">조치 가능한 위치 없음</option>}
            {actionableOccurrences.map((item) => <option value={item.occurrenceId} key={item.occurrenceId}>발견 위치 #{item.occurrenceId} · {occurrenceStatusLabels[item.responseStatus]}</option>)}
          </select>
        </label>
        <label className="field" htmlFor="secret-case-action-type">조치 종류
          <select className="select" id="secret-case-action-type" value={actionType} onChange={(event) => setActionType(event.target.value as SecretActionType | '')} required>
            <option value="">종류 선택</option>
            {(Object.keys(actionLabels) as SecretActionType[]).map((type) => <option value={type} key={type}>{actionLabels[type]}</option>)}
          </select>
        </label>
        <label className="field" htmlFor="secret-case-action-performed-at">실제 조치 시각
          <input id="secret-case-action-performed-at" className="input" type="datetime-local" value={performedAt} onChange={(event) => setPerformedAt(event.target.value)} required />
        </label>
        <label className="field" htmlFor="secret-case-action-evidence">외부 근거 번호
          <input id="secret-case-action-evidence" className="input" type="text" autoComplete="off" maxLength={28} placeholder="TICKET:SEC-123 또는 CHANGE:OPS-42" value={actionEvidence} onChange={(event) => setActionEvidence(event.target.value.toUpperCase())} required />
        </label>
        <p className="caption">형식: TICKET:SEC-123 또는 CHANGE:OPS-42 · 실제 조치 시각은 최근 30일 이내로 입력해 주세요.</p>
        <label className="secret-case-workflow-confirm"><input type="checkbox" checked={actionConfirmed} onChange={(event) => setActionConfirmed(event.target.checked)} /> 외부에서 조치를 마쳤고 위 시각과 근거가 맞아요.</label>
        <button className="btn primary" type="submit" disabled={!actionReady || change.isPending}>{change.isPending && change.variables?.kind === 'action' ? '기록 중…' : '외부 조치 기록'}</button>
      </form>}
      {!canRecordAction && <p className="notice">{
        detail.stage === 'REVALIDATION_PENDING' ? '외부 조치가 기록되어 재검증을 기다리고 있어요.'
          : detail.stage === 'RESOLVED' ? '해결된 대응 건이에요. 조치 기록을 조회할 수 있어요.'
            : detail.reviewStatus !== 'REVIEWED' ? '보안 검토가 끝나면 담당자가 외부 조치를 기록할 수 있어요.'
              : '지정된 담당자만 외부 조치를 기록할 수 있어요.'
      }</p>}
      {(detail.actions ?? []).length > 0 && <ol className="secret-case-workflow-history">
        {detail.actions.map((action) => <li key={action.actionId}>
          <strong>{actionLabels[action.actionType] ?? '외부 조치'} · 발견 위치 #{action.occurrenceId}</strong>
          <span>수행 {displayDate(action.performedAt)} · 기록 {displayDate(action.recordedAt)}</span>
          <span>근거 {action.evidenceRef} · 기록자 {action.recordedByName || `사용자 #${action.recordedByUserId}`}</span>
        </li>)}
      </ol>}
      {(detail.stageHistory ?? []).length > 0 && <details className="secret-case-workflow-history-detail">
        <summary>대응 단계 변경 이력 {detail.stageHistory.length}건</summary>
        <ol className="secret-case-workflow-history">
          {detail.stageHistory.map((change) => <li key={change.caseVersion}>
            <strong>{caseStageLabels[change.fromStatus]} → {caseStageLabels[change.toStatus]}</strong>
            <span>{change.reasonCode === 'RESPONSE_STARTED' ? '조치 시작' : change.reasonCode === 'EXTERNAL_ACTION_RECORDED' ? '외부 조치 기록' : '단계 변경'} · 사용자 #{change.actorUserId} · {displayDate(change.changedAt)}</span>
          </li>)}
        </ol>
      </details>}
    </section>
    {feedback && <p className={`notice ${feedback.kind === 'error' ? 'error' : ''}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.message}</p>}
  </div>
}
