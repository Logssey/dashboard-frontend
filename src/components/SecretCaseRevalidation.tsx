import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import type { SecretCaseDetail } from '@/api/secretCases'
import {
  fetchSecretCaseRevalidations, requestSecretCaseRevalidation, resolveSecretCase, resumeSecretCase,
  type SecretCaseRevalidation as Revalidation,
} from '@/api/secretCaseRevalidations'

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul',
})
const terminalStatuses = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED'])

function displayDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : `${dateFormatter.format(date)} KST`
}

function resultLabel(item: Revalidation): string {
  if (item.jobStatus === 'PENDING') return '대기 중'
  if (item.jobStatus === 'LEASED') return '검사 중'
  if (item.jobStatus === 'FAILED') return '검사 실패'
  if (item.jobStatus === 'CANCELLED') return '검사 취소'
  if (item.result === 'MISSING') return '재검사에서 미발견'
  if (item.result === 'PRESENT') return '다시 발견됨'
  if (item.result === 'UNKNOWN') return '판정 불가'
  return '결과 확인 필요'
}

function safeFailureCode(code: string | null): string | null {
  return code && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : null
}

function latestRecords(items: Revalidation[]): Map<number, Revalidation> {
  const latest = new Map<number, Revalidation>()
  for (const item of items) {
    const current = latest.get(item.occurrenceId)
    if (!current || current.revalidationId < item.revalidationId) latest.set(item.occurrenceId, item)
  }
  return latest
}

interface Props {
  detail: SecretCaseDetail
  onUpdated: (updated: SecretCaseDetail) => void
  onRefresh: () => void
}

export function SecretCaseRevalidation({ detail, onUpdated, onRefresh }: Props) {
  const queryClient = useQueryClient()
  const [requestOccurrenceId, setRequestOccurrenceId] = useState<number | null>(null)
  const [resumeOccurrenceId, setResumeOccurrenceId] = useState<number | null>(null)
  const [resolveConfirmed, setResolveConfirmed] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const attemptKeys = useRef(new Map<number, string>())
  const seenTerminalIds = useRef(new Set<number>())

  const history = useQuery({
    queryKey: ['secret-case-revalidations', detail.caseId],
    queryFn: () => fetchSecretCaseRevalidations(detail.caseId),
    refetchInterval: (query) => query.state.data
      && [...latestRecords(query.state.data).values()].some((item) => !terminalStatuses.has(item.jobStatus)) ? 4_000 : false,
  })

  useEffect(() => {
    const newTerminal = history.data?.filter((item) => terminalStatuses.has(item.jobStatus)
      && !seenTerminalIds.current.has(item.revalidationId)) ?? []
    if (newTerminal.length === 0) return
    newTerminal.forEach((item) => seenTerminalIds.current.add(item.revalidationId))
    onRefresh()
  }, [history.data, onRefresh])

  const latestByOccurrence = latestRecords(history.data ?? [])
  const pendingOccurrences = (detail.occurrences ?? []).filter((item) => item.responseStatus === 'REVALIDATION_PENDING')
  const availableForRequest = pendingOccurrences.filter((item) => {
    if (!item.canRequestRevalidation) return false
    const latest = latestByOccurrence.get(item.occurrenceId)
    return !latest || terminalStatuses.has(latest.jobStatus)
  })
  const requestTargetId = availableForRequest.some((item) => item.occurrenceId === requestOccurrenceId)
    ? requestOccurrenceId : availableForRequest[0]?.occurrenceId ?? null
  const waitingForRunningScan = pendingOccurrences.some((item) => {
    const latest = latestByOccurrence.get(item.occurrenceId)
    return latest && !terminalStatuses.has(latest.jobStatus)
  })
  const presentOccurrences = pendingOccurrences.filter((item) => {
    const latest = latestByOccurrence.get(item.occurrenceId)
    return item.canResume && latest?.jobStatus === 'SUCCEEDED' && latest.result === 'PRESENT'
  })
  const resumeTargetId = presentOccurrences.some((item) => item.occurrenceId === resumeOccurrenceId)
    ? resumeOccurrenceId : presentOccurrences[0]?.occurrenceId ?? null

  const refreshAfterConflict = () => {
    onRefresh()
    void history.refetch()
    setResolveConfirmed(false)
  }

  const request = useMutation({
    mutationFn: (occurrenceId: number) => {
      let idempotencyKey = attemptKeys.current.get(occurrenceId)
      if (!idempotencyKey) {
        if (!globalThis.crypto?.randomUUID) throw new Error('Secure random UUID is unavailable')
        idempotencyKey = globalThis.crypto.randomUUID()
        attemptKeys.current.set(occurrenceId, idempotencyKey)
      }
      return requestSecretCaseRevalidation(detail.caseId, { occurrenceId, expectedVersion: detail.version, idempotencyKey })
    },
    onSuccess: (created, occurrenceId) => {
      attemptKeys.current.delete(occurrenceId)
      setFeedback({ kind: 'success', message: `발견 위치 #${created.occurrenceId} 재검증 작업이 등록됐어요. 검사 결과와 해결 여부는 별도로 확인해 주세요.` })
      void queryClient.invalidateQueries({ queryKey: ['secret-case-revalidations', detail.caseId] })
      onRefresh()
    },
    onError: (error, occurrenceId) => {
      if (error instanceof ApiError && error.status === 409) {
        attemptKeys.current.delete(occurrenceId)
        setFeedback({ kind: 'error', message: '대응 건이 먼저 변경됐어요. 최신 상태를 확인한 뒤 다시 요청해 주세요.' })
        refreshAfterConflict()
      } else if (error instanceof ApiError && error.status === 403) {
        setFeedback({ kind: 'error', message: '재검증 요청 권한이 없거나 현재 담당자가 아니에요.' })
        refreshAfterConflict()
      } else {
        setFeedback({ kind: 'error', message: '재검증 요청 상태를 확인하지 못했어요. 같은 버튼으로 다시 시도하면 동일한 요청 번호를 사용해 중복 등록을 막아요.' })
      }
    },
  })

  const resolve = useMutation({
    mutationFn: () => resolveSecretCase(detail.caseId, detail.version),
    onSuccess: (updated) => {
      onUpdated(updated)
      setResolveConfirmed(false)
      setFeedback({ kind: 'success', message: '보안 담당자가 재검증 근거를 확인하고 대응 건을 해결 처리했어요.' })
      void history.refetch()
    },
    onError: (error) => {
      setFeedback({ kind: 'error', message: error instanceof ApiError && error.status === 409
        ? '다른 변경이 먼저 저장됐어요. 최신 재검증 결과를 확인해 주세요.'
        : error instanceof ApiError && error.status === 403
          ? '해결 처리는 이 건의 보안 담당자 권한이 필요해요.'
          : '해결 처리를 저장하지 못했어요. 재검증 결과를 확인해 주세요.' })
      if (error instanceof ApiError && (error.status === 409 || error.status === 403)) refreshAfterConflict()
    },
  })

  const resume = useMutation({
    mutationFn: (occurrenceId: number) => resumeSecretCase(detail.caseId, occurrenceId, detail.version),
    onSuccess: (updated) => {
      onUpdated(updated)
      setResumeOccurrenceId(null)
      setFeedback({ kind: 'success', message: '다시 발견된 위치를 조치 중으로 돌렸어요. 외부에서 추가 조치한 뒤 새 근거를 기록해 주세요.' })
      void history.refetch()
    },
    onError: (error) => {
      setFeedback({ kind: 'error', message: error instanceof ApiError && error.status === 409
        ? '다른 변경이 먼저 저장됐어요. 최신 재검증 결과를 확인해 주세요.'
        : error instanceof ApiError && error.status === 403
          ? '재조치는 이 건에 지정된 담당자만 시작할 수 있어요.'
          : '재조치 상태를 저장하지 못했어요. 재검증 결과를 확인해 주세요.' })
      if (error instanceof ApiError && (error.status === 409 || error.status === 403)) refreshAfterConflict()
    },
  })

  const capabilities = detail.capabilities
  return <section className="secret-case-revalidation" aria-labelledby="secret-case-revalidation-title">
    <h3 id="secret-case-revalidation-title">재검증과 해결</h3>
    <p className="caption">외부 조치를 기록한 발견 위치를 다시 검사해요. 검사 작업 성공은 키 미발견이나 대응 건 해결을 뜻하지 않아요.</p>

    {capabilities?.canRequestRevalidation && <div className="secret-case-revalidation-controls">
      <label className="field" htmlFor="secret-case-revalidation-occurrence">재검증할 발견 위치
        <select className="select" id="secret-case-revalidation-occurrence" value={requestTargetId ?? ''} onChange={(event) => setRequestOccurrenceId(Number(event.target.value))} disabled={request.isPending || availableForRequest.length === 0}>
          {availableForRequest.length === 0 && <option value="">{waitingForRunningScan ? '진행 중인 검사를 기다려 주세요' : '현재 재검증 가능한 위치가 없어요'}</option>}
          {availableForRequest.map((item) => <option value={item.occurrenceId} key={item.occurrenceId}>발견 위치 #{item.occurrenceId}</option>)}
        </select>
      </label>
      <button className="btn primary" type="button" disabled={requestTargetId === null || request.isPending || !history.isSuccess} onClick={() => requestTargetId !== null && request.mutate(requestTargetId)}>{request.isPending ? '등록 중…' : '재검증 요청'}</button>
    </div>}

    {history.isPending ? <p className="caption">재검증 이력을 불러오는 중이에요.</p>
      : history.isError ? <p className="notice error" role="alert">재검증 이력을 불러오지 못했어요. <button className="btn outline" type="button" onClick={() => void history.refetch()}>다시 조회</button></p>
        : history.data.length === 0 ? <p className="notice">아직 재검증 기록이 없어요.</p>
          : <div className="secret-case-revalidation-history">
            <h4>재검증 이력</h4>
            <ol>{history.data.map((item) => <li key={item.revalidationId}>
              <div className="secret-case-revalidation-history-heading">
                <strong>발견 위치 #{item.occurrenceId} · {resultLabel(item)}</strong>
                <span>재검증 #{item.revalidationId}</span>
              </div>
              <span>요청 {displayDate(item.requestedAt)} · 종료 {displayDate(item.finishedAt)}</span>
              {item.runId > 0 && <span>스캔 실행 #{item.runId}</span>}
              {safeFailureCode(item.failureCode) && <span>실패 사유 코드: {safeFailureCode(item.failureCode)}</span>}
            </li>)}</ol>
          </div>}

    {capabilities?.canResolve && <div className="secret-case-revalidation-decision">
      <h4>해결 처리 · 보안 담당자</h4>
      <p className="caption">모든 대상의 조치 후 재검증에서 키가 발견되지 않은 근거를 확인한 뒤 해결해요.</p>
      <label className="secret-case-workflow-confirm"><input type="checkbox" checked={resolveConfirmed} onChange={(event) => setResolveConfirmed(event.target.checked)} /> 최신 재검증 결과를 확인했고 대응 건을 해결하겠어요.</label>
      <button className="btn primary" type="button" disabled={!resolveConfirmed || resolve.isPending || !history.isSuccess} onClick={() => resolve.mutate()}>{resolve.isPending ? '처리 중…' : '대응 건 해결'}</button>
    </div>}

    {capabilities?.canResume && resumeTargetId !== null && <div className="secret-case-revalidation-decision">
      <h4>다시 발견된 키 · 조치 담당자</h4>
      <p className="caption">재검증에서 다시 발견된 위치는 해결할 수 없어요. 조치 중으로 되돌려 추가 조치를 기록해 주세요.</p>
      <label className="field" htmlFor="secret-case-resume-occurrence">재조치할 발견 위치
        <select className="select" id="secret-case-resume-occurrence" value={resumeTargetId} onChange={(event) => setResumeOccurrenceId(Number(event.target.value))}>
          {presentOccurrences.map((item) => <option value={item.occurrenceId} key={item.occurrenceId}>발견 위치 #{item.occurrenceId}</option>)}
        </select>
      </label>
      <button className="btn outline" type="button" disabled={resume.isPending} onClick={() => resume.mutate(resumeTargetId)}>{resume.isPending ? '처리 중…' : '추가 조치 시작'}</button>
    </div>}

    {feedback && <p className={`notice ${feedback.kind === 'error' ? 'error' : ''}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.message}</p>}
  </section>
}
