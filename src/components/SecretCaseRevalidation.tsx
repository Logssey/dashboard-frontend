import { useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api/client'
import type { SecretCaseDetail } from '@/api/secretCases'
import { fetchSecretCaseRevalidations, requestSecretCaseRevalidation, resumeSecretCase } from '@/api/secretCaseRevalidations'
import { idempotencyFor, safeMutationMessage } from '@/lib/secretEvidence'
import { positiveId, scanDate, scanDetailPath, scanReason } from '@/lib/secretScan'

interface Props { detail: SecretCaseDetail; onReload: () => void; onStale: () => void; disabled: boolean }
export function SecretCaseRevalidation({ detail, onReload, onStale, disabled }: Props) {
  const [selectedId, setSelectedId] = useState(''), [confirm, setConfirm] = useState(false)
  const requestKey = useRef({ payload: '', key: '' }), resumeKey = useRef({ payload: '', key: '' })
  const records = useQuery({ queryKey: ['secret-case-revalidations', detail.caseId], queryFn: () => fetchSecretCaseRevalidations(detail.caseId), retry: false, refetchOnWindowFocus: false })
  const location = detail.occurrences.find((entry) => entry.occurrenceId === positiveId(selectedId))
  const eligible = detail.occurrences.filter((entry) => entry.canRequestRevalidation || entry.canResume)
  const error = (error: Error) => { if (error instanceof ApiError && [403, 409].includes(error.status)) onStale() }
  const request = useMutation({ mutationFn: () => { const body = { occurrenceId: location!.occurrenceId, expectedCaseVersion: detail.version, expectedOccurrenceVersion: location!.version }; return requestSecretCaseRevalidation(detail.caseId, { ...body, idempotencyKey: idempotencyFor(requestKey, body) }) }, onSuccess: onReload, onError: error })
  const resume = useMutation({ mutationFn: () => { const body = { occurrenceId: location!.occurrenceId, expectedCaseVersion: detail.version, expectedOccurrenceVersion: location!.version, reasonCode: 'REVALIDATION_PRESENT' as const }; return resumeSecretCase(detail.caseId, { ...body, idempotencyKey: idempotencyFor(resumeKey, body) }) }, onSuccess: onReload, onError: error })
  const busy = disabled || request.isPending || resume.isPending
  const pending = records.data?.some((record) => record.occurrenceId === location?.occurrenceId && ['PENDING', 'LEASED'].includes(record.jobStatus))
  const labels = { MISSING: '재검사에서 미발견', PRESENT: '다시 발견됨', UNKNOWN: '판정 불가', PENDING: '검사 대기' }
  return <div><p className="notice">미발견은 검사한 위치의 현재 부재 근거예요. 키 폐기·교체 확인과 대응 건 해결은 별도로 판단해요.</p>
    {records.isPending ? <p role="status">재검사 기록 확인 중…</p> : records.isError ? <div role="alert"><p>재검사 기록을 불러오지 못했어요.</p><button className="btn outline" onClick={() => void records.refetch()}>다시 조회</button></div> : records.data.length === 0 ? <p className="caption">아직 위치별 재검사 기록이 없어요.</p> : <div className="table-scroll" tabIndex={0} role="region" aria-label="위치별 재검사 기록"><table><thead><tr><th>위치·실행</th><th>실행 상태</th><th>관측 결과</th><th>요청·완료</th></tr></thead><tbody>{records.data.map((record) => <tr key={record.revalidationId}><td>위치 #{record.occurrenceId}<span className="asset"><Link to={scanDetailPath(record.runId)}>SCAN-{record.runId}</Link></span></td><td>{({ PENDING: '대기 중', LEASED: '검사 중', SUCCEEDED: '실행 완료', FAILED: '실행 실패', CANCELLED: '취소' })[record.jobStatus] ?? '상태 미확인'}</td><td>{record.jobStatus === 'SUCCEEDED' ? labels[record.result] ?? '판정 불가' : ['PENDING', 'LEASED'].includes(record.jobStatus) ? '검사 진행 중' : '판정 불가'}{record.failureCode && <span className="asset">{scanReason(record.failureCode)}</span>}</td><td>{scanDate(record.requestedAt)}<span className="asset">완료 {scanDate(record.finishedAt)}</span></td></tr>)}</tbody></table></div>}
    {eligible.length > 0 ? <section className="secret-governance-form"><h3>위치별 후속 작업</h3><label>작업 위치<select className="select" value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setConfirm(false) }}><option value="">위치 선택</option>{eligible.map((entry) => <option key={entry.occurrenceId} value={entry.occurrenceId}>{entry.safeLocationLabel} · {entry.canResume ? '추가 조치' : '재검사'}</option>)}</select></label>{pending && <p className="notice">진행 중인 검사를 기다려 주세요.</p>}<label className="secret-check-label"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> 선택한 위치의 현재 상태와 이전 조치를 확인했어요.</label><div className="row">{location?.canRequestRevalidation && <button className="btn primary" disabled={!confirm || busy || records.isPending || records.isError || pending} onClick={() => request.mutate()}>이 위치 재검사 요청</button>}{location?.canResume && <button className="btn outline" disabled={!confirm || busy} onClick={() => resume.mutate()}>이 위치 추가 조치</button>}</div>{(request.isError || resume.isError) && <p className="notice error" role="alert">{safeMutationMessage(request.error ?? resume.error)}</p>}</section> : <p className="caption">현재 재검증 가능한 위치가 없어요.</p>}
  </div>
}
