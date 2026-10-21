import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { fetchValidationPolicy, updateValidationPolicy } from '@/api/secretValidation'
import { idempotencyFor, safeMutationMessage } from '@/lib/secretEvidence'
import { validationReason } from '@/lib/secretValidation'

export function SecretValidationPolicy({ scopeId }: { scopeId: number }) {
  const key = useRef({ payload: '', key: '' }), disclosure = useRef<HTMLDetailsElement>(null), [params] = useSearchParams(), client = useQueryClient()
  useEffect(() => { if (params.get('settings') !== 'validation') return; const frame = requestAnimationFrame(() => { if (disclosure.current) { disclosure.current.open = true; disclosure.current.focus(); disclosure.current.scrollIntoView({ block: 'center' }) } }); return () => cancelAnimationFrame(frame) }, [params])
  const query = useQuery({ queryKey: ['secret-validation-policy', scopeId], queryFn: () => fetchValidationPolicy(scopeId), retry: false, refetchOnWindowFocus: false })
  const mutation = useMutation({ mutationFn: () => {
    const payload = { expectedValidationApprovalRevision: query.data!.expectedValidationApprovalRevision, enabled: !query.data!.enabled, reasonCode: query.data!.enabled ? 'VALIDATION_DISABLED' : 'VALIDATION_APPROVED' }
    return updateValidationPolicy(scopeId, { ...payload, idempotencyKey: idempotencyFor(key, payload) })
  }, onSuccess: () => { void query.refetch(); void client.invalidateQueries({ queryKey: ['secret-validation'] }) } })
  const stale = mutation.error instanceof ApiError && [403, 404, 409].includes(mutation.error.status)
  return <details ref={disclosure} tabIndex={-1} className="secret-scope-alias-editor"><summary>키 유효성 검증 설정</summary>{query.isPending ? <p role="status">검증 허용 상태를 불러오는 중이에요.</p> : query.isError ? <p role="alert">{safeMutationMessage(query.error)} <button className="btn outline" onClick={() => void query.refetch()}>다시 조회</button></p> : <>
    <p>이 범위의 인증 확인: <strong>{query.data.enabled ? '허용' : '꺼짐'}</strong></p><p className="caption">승인된 범위와 등록된 검증기만 허용해요. 수집 범위나 공급자 권한은 바뀌지 않아요.</p>
    {query.data.profileStatus !== 'ENABLED' && <p className="notice">{query.data.profileStatus === 'UNCONFIGURED' ? '서버 운영 담당자의 검증 실행 설정이 필요해요.' : '서버·연결 검증 기능이 꺼져 있어요.'} 범위를 허용해도 공급자를 호출하지 않아요.</p>}
    {query.data.blockedReasonCodes?.map((code) => <p key={code}>{validationReason(code)}</p>)}
    {query.data.canConfigure && <button className="btn outline" disabled={stale || mutation.isPending || query.isFetching || !query.data.enabled && query.data.profileStatus === 'UNCONFIGURED'} onClick={() => mutation.mutate()}>{query.data.enabled ? '이 범위 검증 끄기' : '이 범위 검증 허용'}</button>}
    {mutation.isSuccess && <p role="status">범위의 검증 허용 설정을 저장했어요. 인증을 확인한 결과는 아니에요.</p>}
    {mutation.isError && <p role="alert">{safeMutationMessage(mutation.error)} <button className="btn outline" onClick={() => { mutation.reset(); void query.refetch() }}>최신 설정 다시 조회</button></p>}
  </>}</details>
}
