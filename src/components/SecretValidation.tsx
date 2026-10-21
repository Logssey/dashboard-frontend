import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { withSecretOrigin } from '@/lib/secretNavigation'
import { ApiError } from '@/api/client'
import { fetchSecretValidation, fetchValidationHistory, fetchValidationRequest, requestSecretValidation, type ValidationAttempt } from '@/api/secretValidation'
import type { KeyLocation } from '@/api/secrets'
import { SecretSourceCoordinates } from './SecretDiscoveryContext'
import { activeRequest, completedRequest, requestStatusLabel, validationPresentation, validationReason } from '@/lib/secretValidation'
import { idempotencyFor, safeMutationMessage } from '@/lib/secretEvidence'
import { positiveId, scanDate } from '@/lib/secretScan'
import './secret-validation-risk.css'

const validationDate = (value?: string | null) => value ? scanDate(value) : '—'
const retry = (count: number, error: Error) => !(error instanceof ApiError && [400, 403, 404, 409, 422].includes(error.status)) && count < 1
export function ValidationTimes({ attempt, lastAuthenticatedAt }: { attempt: ValidationAttempt | null; lastAuthenticatedAt: string | null }) {
  return <dl className="secret-scan-facts"><div><dt>실제 확인 시각</dt><dd>{validationDate(attempt?.providerCheckedAt)}</dd></div><div><dt>최근 시도 시각</dt><dd>{validationDate(attempt?.completedAt)}</dd></div><div><dt>마지막 인증 성공</dt><dd>{validationDate(lastAuthenticatedAt)}</dd></div></dl>
}
interface ValidationCardProps { secretId: number; locations: KeyLocation[]; metadataOnly?: boolean }
export function SecretValidationCard(props: ValidationCardProps) {
  const [params] = useSearchParams()
  const selectedId = params.has('occurrence') ? positiveId(params.get('occurrence')) : params.has('validationOccurrence') ? positiveId(params.get('validationOccurrence')) : props.locations[0]?.occurrenceId ?? null
  // A confirmation and a polled request belong to one immutable location selection.
  return <LocationValidationCard key={`${props.secretId}:${selectedId ?? 'none'}`} {...props} selectedId={selectedId} />
}
function LocationValidationCard({ secretId, locations, metadataOnly = false, selectedId }: ValidationCardProps & { selectedId: number | null }) {
  const [params, setParams] = useSearchParams(), client = useQueryClient()
  const location = locations.find((item) => item.occurrenceId === selectedId)
  const [confirm, setConfirm] = useState(false), [requestId, setRequestId] = useState<number | null>(null)
  const processed = useRef<number | null>(null), requestKey = useRef({ payload: '', key: '' })
  const query = useQuery({ queryKey: ['secret-validation', secretId, selectedId], queryFn: () => fetchSecretValidation(secretId, selectedId), enabled: !!location && !metadataOnly, retry, refetchOnWindowFocus: false,
    refetchInterval: (item) => !item.state.error && activeRequest(item.state.data?.latestRequest?.status) ? 5000 : false })
  const progress = useQuery({ queryKey: ['secret-validation-request', requestId], queryFn: () => fetchValidationRequest(requestId!), enabled: requestId != null, retry,
    refetchInterval: (item) => !item.state.error && (!item.state.data || activeRequest(item.state.data.status)) ? 3000 : false })
  const mutation = useMutation({ mutationFn: () => {
    const payload = { occurrenceId: selectedId!, expectedContextVersion: query.data!.contextVersion }
    return requestSecretValidation(secretId, { ...payload, idempotencyKey: idempotencyFor(requestKey, payload) })
  }, onSuccess: (accepted) => { setConfirm(false); setRequestId(accepted.requestId); void query.refetch() } })
  useEffect(() => {
    if (!progress.data || !completedRequest(progress.data.status) || processed.current === progress.data.requestId) return
    processed.current = progress.data.requestId
    requestKey.current = { payload: '', key: '' }
    void client.invalidateQueries({ queryKey: ['secret-validation', secretId] }); void client.invalidateQueries({ queryKey: ['secret-validation-history', secretId] })
    void client.invalidateQueries({ queryKey: ['secret-detail', secretId] })
  }, [progress.data, client, secretId])
  const presentation = query.data ? validationPresentation(query.data) : null
  const pending = requestId != null && !completedRequest(progress.data?.status) || activeRequest(query.data?.latestRequest?.status)
  return <details className="card secret-validation-card" aria-labelledby="key-validation-title"><summary><strong id="key-validation-title">키 유효성</strong><span>{metadataOnly ? '값 인증 대상 아님' : presentation?.title ?? '확인 조건 조회'}</span><small>{query.data?.latestAttempt?.providerCheckedAt ? validationDate(query.data.latestAttempt.providerCheckedAt) : '공급자 확인 시각 —'}</small><span className="secret-validation-expand">확인·이력</span></summary><div className="secret-validation-expanded"><p className="caption">선택한 위치의 키로 공급자 인증 가능 여부를 확인해요.</p>
    {metadataOnly ? <p>메타데이터만 확인한 항목이에요. 값 인증은 수행하지 않아요.</p> : !locations.length ? <p>인증 확인에 사용할 열람 가능한 발견 위치를 먼저 불러와 주세요.</p> : <>
      <label>확인할 발견 위치<select className="select" value={selectedId ?? ''} onChange={(event) => { const next = new URLSearchParams(params); next.set('occurrence', event.target.value); next.delete('validationOccurrence'); next.set('locationPanel', 'closed'); setParams(next); setConfirm(false); setRequestId(null); mutation.reset() }}><option value="">위치 선택</option>{locations.map((item) => <option key={item.occurrenceId} value={item.occurrenceId}>{item.safeLocationLabel}</option>)}</select></label>
      {!location ? <p className="notice">선택한 위치가 현재 필터·페이지에 없어요. 열람 가능한 위치를 다시 선택하세요.</p> : query.isPending ? <p role="status">인증 확인 조건을 불러오는 중이에요.</p> : query.isError ? <div className="notice error" role="alert"><p>{safeMutationMessage(query.error)}</p><button className="btn outline" onClick={() => void query.refetch()}>확인 조건 다시 조회</button></div> : <>
        <h3>{presentation!.title}</h3><p>{presentation!.description}</p><ValidationTimes attempt={query.data.latestAttempt} lastAuthenticatedAt={query.data.lastAuthenticatedAt} />
        <p className="caption">다음 확인 기한 {query.data.nextDueAt ? validationDate(query.data.nextDueAt) : '예약 없음'}</p>
        {query.data.lastConclusiveValidation && query.data.latestAttempt?.result === 'UNKNOWN' && <p className="notice">이전 확정 결과: {query.data.lastConclusiveValidation.result === 'VALID' ? '유효' : '사용 불가'} · {validationDate(query.data.lastConclusiveValidation.providerCheckedAt)}. 현재는 확인 불가예요.</p>}
        {query.data.capabilities.blockedReasonCodes?.length > 0 && <ul className="secret-safe-reasons">{query.data.capabilities.blockedReasonCodes.map((code) => <li key={code}>{validationReason(code)}</li>)}</ul>}
        {!query.data.capabilities.canRequestValidation && <div className="row">{query.data.validationPolicy?.canConfigure ? <Link className="btn outline" to={withSecretOrigin(`/secrets/connections/${location.connectionId}/scopes/${location.scopeId}?settings=validation`, location.origin)}>검증 설정</Link> : location.taskGuidance?.relatedTaskId ? <Link className="btn outline" to={`/secrets/triage/investigations/${location.taskGuidance.relatedTaskId}`}>기존 담당 확인 요청</Link> : location.capabilities?.canViewCoverage ? <Link className="btn outline" to={withSecretOrigin(`/secrets/connections/${location.connectionId}/scopes/${location.scopeId}?settings=validation`, location.origin)}>보안 담당자에게 확인 요청</Link> : <p className="caption">이 위치의 보안 담당자에게 검증 허용·할당 확인을 요청하세요. 현재 사용자에게 추가 설정 권한을 부여하지 않아요.</p>}</div>}
        <div className="row"><button className="btn primary" disabled={!query.data.capabilities.canRequestValidation || !query.data.contextVersion || pending || mutation.isPending} onClick={() => setConfirm(true)}>유효성 확인</button><button className="btn outline" onClick={() => { const next = new URLSearchParams(params); next.set('tab', 'validation'); if (selectedId) next.set('occurrence', String(selectedId)); next.delete('validationOccurrence'); next.set('locationPanel', 'closed'); setParams(next) }}>검증 이력</button></div>
        {confirm && <div className="secret-command-confirm" role="group" aria-label="유효성 확인 요청"><h3>이 위치의 키 인증을 확인할까요?</h3><SecretSourceCoordinates location={location} /><p>인증 가능 여부만 확인하며 키를 변경하지 않습니다.</p><div className="row"><button className="btn primary" disabled={mutation.isPending || !query.data.capabilities.canRequestValidation} onClick={() => mutation.mutate()}>확인 요청</button><button className="btn outline" disabled={mutation.isPending} onClick={() => setConfirm(false)}>취소</button></div></div>}
        <details><summary>확인 방법과 범위</summary><p>{query.data.latestAttempt?.method ?? '실행 전'} · 검증기 {query.data.latestAttempt?.validatorVersion ?? '—'}</p><p>확인 기한은 공급자 토큰 만료일과 달라요.</p><p>조회 시각 {validationDate(query.data.readAt)}</p>{query.data.limitations?.map((code) => <p key={code}>{validationReason(code)}</p>)}</details>
      </>}
      {(progress.data || query.data?.latestRequest) && <p role="status">요청 #{progress.data?.requestId ?? query.data?.latestRequest?.requestId} · {requestStatusLabel((progress.data ?? query.data!.latestRequest)!.status)}{(progress.data?.failureCode || progress.data?.reasonCode) && ` · ${validationReason(progress.data.failureCode ?? progress.data.reasonCode)}`}</p>}
      {progress.isError && <p role="alert" className="notice error">진행 상태를 읽지 못했어요. 새 요청을 보내기 전에 <button className="btn outline" onClick={() => void progress.refetch()}>기존 요청 다시 확인</button></p>}
      {progress.data && !activeRequest(progress.data.status) && !completedRequest(progress.data.status) && <p role="alert">요청 종료 여부를 확인할 수 없어요. <button className="btn outline" onClick={() => void progress.refetch()}>기존 요청 상태 다시 조회</button></p>}
      {mutation.isError && <div className="notice error" role="alert"><p>{safeMutationMessage(mutation.error)}</p><button className="btn outline" onClick={() => { setConfirm(false); mutation.reset(); void query.refetch() }}>최신 확인 조건 다시 조회</button></div>}
    </>}
  </div></details>
}

export function SecretValidationHistory({ secretId }: { secretId: number }) {
  const [params, setParams] = useSearchParams(), page = (positiveId(params.get('validationPage')) ?? 1) - 1, occurrenceId = positiveId(params.get('occurrence')) ?? positiveId(params.get('validationOccurrence'))
  const history = useQuery({ queryKey: ['secret-validation-history', secretId, occurrenceId, page], queryFn: () => fetchValidationHistory(secretId, occurrenceId, page), retry, refetchOnWindowFocus: false })
  return <section className="card secret-scan-section"><h2>검증 이력</h2><p className="caption">인증 확인·위치 재검사의 목적과 실제 공급자 확인 시각을 구분해요.</p>{history.isPending ? <p role="status">검증 이력을 불러오는 중이에요.</p> : history.isError ? <p role="alert">{safeMutationMessage(history.error)} <button className="btn outline" onClick={() => void history.refetch()}>다시 조회</button></p> : <>
    {!history.data.items.length ? <p>이 범위에서 완료된 인증 확인 시도가 없어요. 위의 지원·설정·구성 조건을 확인하세요.</p> : <div className="table-scroll"><table><thead><tr><th>결과</th><th>목적·방법</th><th>실제 확인 시각</th><th>최근 시도 시각</th><th>설명</th></tr></thead><tbody>{history.data.items.map((attempt) => <tr key={attempt.attemptId}><td>{attempt.state === 'ABANDONED' ? '시도 중단 · 결론 없음' : attempt.result == null ? '완료 결과 없음' : attempt.result === 'VALID' ? '유효' : attempt.result === 'INVALID' ? '사용 불가' : attempt.result === 'UNKNOWN' ? '확인 불가' : '미검증'}{attempt.currentEligible === false && <span className="asset">현재 적용 불가 · 과거 기록</span>}</td><td>{attempt.purpose === 'LOCATION_RECHECK' ? '조치 후 위치 재검사' : attempt.purpose === 'CREDENTIAL_VALIDITY' ? '키 인증 확인' : attempt.purpose === 'COLLECTION_AND_DETECTION' ? '원천 검사 중 인증 확인' : '과거 목적 정보 미제공'}<span className="asset">{attempt.method ?? '공급자 미호출'} · {attempt.validatorVersion ?? '—'}</span></td><td>{validationDate(attempt.providerCheckedAt)}</td><td>{validationDate(attempt.completedAt)}</td><td>{validationReason(attempt.reasonCode)}</td></tr>)}</tbody></table></div>}
    <div className="table-foot"><button className="btn outline" disabled={page === 0} onClick={() => { const next = new URLSearchParams(params); next.set('validationPage', String(page)); setParams(next) }}>이전</button><span>{page + 1} / {Math.max(1, Math.ceil(history.data.total / history.data.size))}</span><button className="btn outline" disabled={(page + 1) * history.data.size >= history.data.total} onClick={() => { const next = new URLSearchParams(params); next.set('validationPage', String(page + 2)); setParams(next) }}>다음</button></div>
  </>}</section>
}
