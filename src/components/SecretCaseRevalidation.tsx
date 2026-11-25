import { useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { withSecretOrigin } from '@/lib/secretNavigation'
import { ApiError } from '@/api/client'
import type { SecretCaseDetail } from '@/api/secretCases'
import { fetchSecretCaseRevalidations, requestSecretCaseRevalidation, requestSecretCaseRevalidations, resumeSecretCase } from '@/api/secretCaseRevalidations'
import { idempotencyFor, safeMutationMessage } from '@/lib/secretEvidence'
import { revalidationBlockLabel } from '@/lib/secretResponse'
import { positiveId, scanDate, scanDetailPath, scanReason } from '@/lib/secretScan'

type Props = import('./SecretCaseClosure').ResponsePanelProps
const resultLabels: Record<string, string> = { MISSING: '재검사에서 미발견', PRESENT: '다시 발견됨', UNKNOWN: '판정 불가', PENDING: '검사 대기' }
const jobLabels: Record<string, string> = { PENDING: '대기 중', LEASED: '검사 중', SUCCEEDED: '실행 완료', FAILED: '실행 실패', CANCELLED: '취소' }
function BatchRevalidation({ detail, onReload, onStale, disabled, onBatchCompleted }: Props) {
  const [selected, setSelected] = useState<number[]>([])
  const key = useRef({ payload: '', key: '' })
  const eligible = detail.occurrences.filter((location) => location.canRequestRevalidation)
  const selectedLocations = eligible.filter((location) => selected.includes(location.occurrenceId))
  const request = useMutation({
    mutationFn: () => {
      const body = { expectedCaseVersion: detail.version, items: selectedLocations.map((location) => ({ occurrenceId: location.occurrenceId, expectedOccurrenceVersion: location.version })) }
      return requestSecretCaseRevalidations(detail.caseId, { ...body, idempotencyKey: idempotencyFor(key, body) })
    },
    onSuccess: (result) => { onBatchCompleted?.(result); onReload() },
    onError: (error) => { if (error instanceof ApiError && [403, 409].includes(error.status)) onStale() },
  })
  return <section className="secret-governance-form secret-case-batch-revalidation">
    <div className="row between"><h3>여러 위치 재검사</h3><button className="btn outline" disabled={disabled || request.isPending} onClick={() => setSelected(selectedLocations.length ? [] : eligible.slice(0, 100).map((location) => location.occurrenceId))}>{selectedLocations.length ? '선택 해제' : '가능한 위치 선택'}</button></div>
    <ul className="secret-case-batch-list">{eligible.map((location) => <li key={location.occurrenceId}><label className="secret-check-label"><input type="checkbox" checked={selected.includes(location.occurrenceId)} disabled={disabled || request.isPending || selected.length >= 100 && !selected.includes(location.occurrenceId)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, location.occurrenceId] : current.filter((id) => id !== location.occurrenceId))} /><span>{location.safeLocationLabel}<small className="asset">조치 완료 · 동일 승인 범위 재검사</small></span></label></li>)}</ul>
    <button className="btn primary" disabled={disabled || request.isPending || !selectedLocations.length} onClick={() => request.mutate()}>{request.isPending ? '검사 등록 중…' : `선택한 ${selectedLocations.length}곳 재검사`}</button>
    {eligible.length > 100 && <p className="caption">한 번에 100곳까지 선택할 수 있어요.</p>}
    {request.isError && <p className="notice error" role="alert">{safeMutationMessage(request.error)}</p>}
  </section>
}

export function SecretCaseRevalidation(props: Props) {
  const { detail, onReload, onStale, disabled, onCompleted } = props
  const [params] = useSearchParams()
  const [selectedId, setSelectedId] = useState(params.get('occurrence') ?? ''), [recordPage, setRecordPage] = useState(0)
  const requestKey = useRef({ payload: '', key: '' }), resumeKey = useRef({ payload: '', key: '' })
  const records = useQuery({ queryKey: ['secret-case-revalidations', detail.caseId], queryFn: () => fetchSecretCaseRevalidations(detail.caseId), retry: false, refetchOnWindowFocus: false, refetchInterval: (query) => query.state.data?.some((record) => ['PENDING', 'LEASED'].includes(record.jobStatus)) ? 5000 : false })
  const location = detail.occurrences.find((entry) => entry.occurrenceId === positiveId(selectedId))
  const eligible = detail.occurrences.filter((entry) => entry.canRequestRevalidation || entry.canResume)
  const error = (error: Error) => { if (error instanceof ApiError && [403, 409].includes(error.status)) onStale() }
  const success = () => onReload()
  const request = useMutation({ mutationFn: () => { const body = { occurrenceId: location!.occurrenceId, expectedCaseVersion: detail.version, expectedOccurrenceVersion: location!.version }; return requestSecretCaseRevalidation(detail.caseId, { ...body, idempotencyKey: idempotencyFor(requestKey, body) }) }, onSuccess: (result) => { onCompleted?.('REVALIDATION_REQUESTED', result.runId, result.canViewRun); success() }, onError: error })
  const resume = useMutation({ mutationFn: () => { const body = { occurrenceId: location!.occurrenceId, expectedCaseVersion: detail.version, expectedOccurrenceVersion: location!.version, reasonCode: 'REVALIDATION_PRESENT' as const }; return resumeSecretCase(detail.caseId, { ...body, idempotencyKey: idempotencyFor(resumeKey, body) }) }, onSuccess: () => { onCompleted?.('ACTION_RESUMED'); success() }, onError: error })
  const busy = disabled || request.isPending || resume.isPending
  const pending = records.data?.some((record) => record.occurrenceId === location?.occurrenceId && ['PENDING', 'LEASED'].includes(record.jobStatus))
  return <div>{detail.capabilities.canBatchRevalidate && <BatchRevalidation {...props} />}<p className="caption">미발견은 검사한 위치의 현재 부재 근거예요. 키 폐기·교체 확인과 대응 건 해결은 별도로 판단해요.</p>
    <div className="table-scroll" tabIndex={0} role="region" aria-label="현재 위치별 재검사 근거"><table className="secret-response-adaptive-table"><thead><tr><th>대응 위치</th><th>현재 부재 근거</th><th>최근 재검사</th><th>필요한 확인</th></tr></thead><tbody>{detail.occurrences.map((entry) => <tr key={entry.occurrenceId}><td data-label="대응 위치">{entry.safeLocationLabel ?? `위치 #${entry.occurrenceId}`}</td><td data-label="현재 부재 근거">{entry.locationAbsenceCheck?.status === 'PASSED' ? '비교 가능한 조치 후 미발견' : '조치 후 부재 근거 확인 필요'}</td><td data-label="최근 재검사">{entry.recentRevalidation ? <>{entry.recentRevalidation.result === 'MISSING' && entry.locationAbsenceCheck?.status !== 'PASSED' ? '과거 미발견 · 현재 적용 재확인' : resultLabels[entry.recentRevalidation.result] ?? '판정 불가'}<span className="asset">{scanDate(entry.recentRevalidation.finishedAt ?? entry.recentRevalidation.requestedAt)}</span></> : '기록 없음'}</td><td data-label="필요한 확인">{entry.canResume ? '다시 발견됨 · 추가 조치 필요' : entry.canRequestRevalidation ? '같은 승인 범위의 재검사 가능' : revalidationBlockLabel(entry.revalidationBlockReasonCode)}</td></tr>)}</tbody></table></div>
    {eligible.length > 0 ? <details className="secret-response-disclosure" open={!detail.capabilities.canBatchRevalidate || !!location?.canResume}><summary>한 위치 재검사·추가 조치</summary><section className="secret-governance-form"><h3>위치별 후속 작업</h3><label>작업 위치<select className="select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">위치 선택</option>{eligible.map((entry) => <option key={entry.occurrenceId} value={entry.occurrenceId}>{entry.safeLocationLabel} · {entry.canResume ? '추가 조치' : '재검사'}</option>)}</select></label>{pending && <p className="notice">진행 중인 검사를 기다려 주세요.</p>}<div className="row">{location?.canRequestRevalidation && <button className="btn primary" disabled={busy || records.isPending || records.isError || pending} onClick={() => request.mutate()}>이 위치 재검사 요청</button>}{location?.canResume && <button className="btn outline" disabled={busy} onClick={() => resume.mutate()}>이 위치 추가 조치</button>}</div>{(request.isError || resume.isError) && <p className="notice error" role="alert">{safeMutationMessage(request.error ?? resume.error)}</p>}</section></details> : <p className="caption">현재 재검증 가능한 위치가 없어요.</p>}
    <details className="secret-response-disclosure"><summary>재검사 요청 기록</summary>{records.isPending ? <p role="status">재검사 기록 확인 중…</p> : records.isError ? <div role="alert"><p>재검사 기록을 불러오지 못했어요.</p><button className="btn outline" onClick={() => void records.refetch()}>다시 조회</button></div> : records.data.length === 0 ? <p className="caption">아직 위치별 재검사 기록이 없어요.</p> : <><p className="caption">과거 요청·결과를 보존해요. 현재 적용 가능성은 위의 위치별 근거를 확인하세요.</p><div className="table-scroll" tabIndex={0} role="region" aria-label="위치별 재검사 요청 기록"><table><thead><tr><th>위치·실행</th><th>실행 상태</th><th>기록된 관측</th><th>요청·완료</th></tr></thead><tbody>{records.data.slice(recordPage * 20, (recordPage + 1) * 20).map((record) => <tr key={record.revalidationId}><td>위치 #{record.occurrenceId}<span className="asset"><>{record.canViewRun === true ? <Link to={withSecretOrigin(scanDetailPath(record.runId), detail.caseOrigin)}>SCAN-{record.runId}</Link> : `SCAN-${record.runId}`}</></span></td><td>{jobLabels[record.jobStatus] ?? '상태 미확인'}</td><td>{record.jobStatus === 'SUCCEEDED' ? resultLabels[record.result] ?? '판정 불가' : ['PENDING', 'LEASED'].includes(record.jobStatus) ? '검사 진행 중' : '판정 불가'}{record.failureCode && <span className="asset">{scanReason(record.failureCode)}</span>}</td><td>{scanDate(record.requestedAt)}<span className="asset">완료 {scanDate(record.finishedAt)}</span></td></tr>)}</tbody></table></div><div className="table-foot secret-table-foot"><span>요청 {records.data.length}건</span><div className="row"><button className="btn outline" disabled={recordPage === 0} onClick={() => setRecordPage((page) => page - 1)}>이전</button><span>{recordPage + 1} 페이지</span><button className="btn outline" disabled={(recordPage + 1) * 20 >= records.data.length} onClick={() => setRecordPage((page) => page + 1)}>다음</button></div></div></>}</details>
  </div>
}
