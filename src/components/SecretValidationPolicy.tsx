import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { fetchValidationPolicy, updateValidationPolicy } from '@/api/secretValidation'
import { idempotencyFor, safeMutationMessage } from '@/lib/secretEvidence'
import { validationReason, validationIssuerLabels } from '@/lib/secretValidation'
import './secret-connection-validation.css'
import { useSecretReadRefresh } from '@/lib/useSecretReadRefresh'

export function SecretValidationPolicy({ scopeId }: { scopeId: number }) {
  const key = useRef({ payload: '', key: '' }), disclosure = useRef<HTMLDetailsElement>(null), [params] = useSearchParams(), client = useQueryClient()
  const refreshReads = useSecretReadRefresh()
  useEffect(() => { if (params.get('settings') !== 'validation') return; const frame = requestAnimationFrame(() => { if (disclosure.current) { disclosure.current.open = true; disclosure.current.focus(); disclosure.current.scrollIntoView({ block: 'center' }) } }); return () => cancelAnimationFrame(frame) }, [params])
  const query = useQuery({ queryKey: ['secret-validation-policy', scopeId], queryFn: () => fetchValidationPolicy(scopeId), retry: false, refetchOnWindowFocus: false })
  const mutation = useMutation({ mutationFn: () => {
    const payload = { expectedValidationApprovalRevision: query.data!.expectedValidationApprovalRevision, enabled: !query.data!.enabled, reasonCode: query.data!.enabled ? 'VALIDATION_DISABLED' : 'VALIDATION_APPROVED' }
    return updateValidationPolicy(scopeId, { ...payload, idempotencyKey: idempotencyFor(key, payload) })
  }, onSuccess: () => { refreshReads(); void query.refetch(); void client.invalidateQueries({ queryKey: ['secret-validation'] }); void client.invalidateQueries({ queryKey: ['secret-connection-validation-policy'] }) } })
  const stale = mutation.error instanceof ApiError && [403, 404, 409].includes(mutation.error.status)
  return <details ref={disclosure} tabIndex={-1} className="secret-scope-alias-editor"><summary>키 유효성 검증 설정</summary>{query.isPending ? <p role="status">검증 허용 상태를 불러오는 중이에요.</p> : query.isError ? <p role="alert">{safeMutationMessage(query.error)} <button className="btn outline" onClick={() => void query.refetch()}>다시 조회</button></p> : <>
    <p>이 범위의 인증 확인: <strong>{query.data.enabled ? '허용' : '꺼짐'}</strong></p><p className="caption">승인된 범위와 등록된 검증기만 허용해요. 수집 범위나 공급자 권한은 바뀌지 않아요.</p>
    {query.data.allowedIssuers && <p className="caption">이 연결에서 허용한 키 발급 서비스 {query.data.allowedIssuers.map((issuer) => validationIssuerLabels[issuer]).join(', ') || '없음'}</p>}
    {query.data.profileStatus !== 'ENABLED' && <p className="notice">{query.data.profileStatus === 'UNCONFIGURED' || query.data.connectionEnabled === false ? '연결의 키 검증 설정을 먼저 확인하세요.' : '서버 검증 기능이 꺼져 있어요.'} 범위 허용 설정과 실제 서버 실행 상태를 함께 확인하세요.</p>}
    {query.data.blockedReasonCodes?.map((code) => <p key={code}>{validationReason(code)}</p>)}
    {query.data.canConfigure && <button className="btn outline" disabled={stale || mutation.isPending || query.isFetching || !query.data.enabled && query.data.profileStatus === 'UNCONFIGURED'} onClick={() => mutation.mutate()}>{query.data.enabled ? '이 범위 검증 끄기' : '이 범위 검증 허용'}</button>}
    {mutation.isSuccess && <p role="status">범위의 검증 허용 설정을 저장했어요. 인증을 확인한 결과는 아니에요.</p>}
    {mutation.isError && <p role="alert">{safeMutationMessage(mutation.error)} <button className="btn outline" onClick={() => { mutation.reset(); void query.refetch() }}>최신 설정 다시 조회</button></p>}
    {query.data.connectionId && <div className="secret-scope-validation-links"><Link className="btn outline" to={`/secrets/connections?validationConnectionId=${query.data.connectionId}`}>연결 검증 설정</Link></div>}
  </>}</details>
}
