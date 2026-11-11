import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { fetchConnectionValidationPolicy, updateConnectionValidationPolicy, type ConnectionValidationPolicy, type ValidationIssuer } from '@/api/secretValidation'
import { idempotencyFor, safeMutationMessage } from '@/lib/secretEvidence'
import { connectionValidationNextAction, validationIssuerLabels, validationReason } from '@/lib/secretValidation'
import { useSecretReadRefresh } from '@/lib/useSecretReadRefresh'
import './secret-connection-validation.css'

const issuers = Object.keys(validationIssuerLabels) as ValidationIssuer[]

function PolicyForm({ policy, refreshing, onSaved, onEdit, onReload }: {
  policy: ConnectionValidationPolicy; onSaved: (value: ConnectionValidationPolicy) => void
  refreshing: boolean; onEdit: () => void; onReload: () => void
}) {
  const [enabled, setEnabled] = useState(policy.enabled)
  const [selected, setSelected] = useState<ValidationIssuer[]>(policy.profileStatus === 'UNCONFIGURED' ? [] : policy.allowedIssuers)
  const key = useRef({ payload: '', key: '' })
  const mutation = useMutation({ mutationFn: () => {
    const payload = { expectedValidationRevision: policy.expectedValidationRevision, enabled,
      allowedIssuers: issuers.filter((issuer) => selected.includes(issuer)),
      reasonCode: enabled ? 'VALIDATION_APPROVED' as const : 'VALIDATION_DISABLED' as const }
    return updateConnectionValidationPolicy(policy.connectionId, { ...payload, idempotencyKey: idempotencyFor(key, payload) })
  }, onSuccess: onSaved })
  const stale = mutation.error instanceof ApiError && [403, 404, 409].includes(mutation.error.status)
  const disabled = !policy.canConfigure || mutation.isPending || stale || refreshing
  const selectionMissing = enabled && selected.length === 0
  const changed = enabled !== policy.enabled || issuers.some((issuer) => selected.includes(issuer) !== policy.allowedIssuers.includes(issuer))
  const inactiveIssuers = selected.filter((issuer) => !policy.enabledIssuers.includes(issuer))
  const choose = (issuer: ValidationIssuer, checked: boolean) => {
    onEdit()
    setSelected((current) => checked ? [...current, issuer] : current.filter((value) => value !== issuer))
  }

  return <form className="secret-connection-validation-form" onSubmit={(event) => {
    event.preventDefault()
    if (!disabled && !selectionMissing && changed) mutation.mutate()
  }}>
    <label className="secret-connection-validation-switch"><input type="checkbox" checked={enabled} disabled={disabled}
      onChange={(event) => { onEdit(); setEnabled(event.target.checked) }} /><span><strong>이 연결의 키 검증 허용</strong><small>허용한 검사 대상에서 발견한 키의 인증 응답을 확인해요.</small></span></label>
    <fieldset disabled={disabled}>
      <legend>검증할 키 발급 서비스</legend>
      <p>저장소가 GitHub여도 안에서 AWS 키가 발견될 수 있어요. 인증을 확인할 키 종류를 선택하세요.</p>
      {issuers.map((issuer) => <label key={issuer} className="secret-connection-validation-issuer"><input type="checkbox" checked={selected.includes(issuer)} onChange={(event) => choose(issuer, event.target.checked)} />
        <span>{validationIssuerLabels[issuer]}{!policy.enabledIssuers.includes(issuer) && <small>서버 검증 기능 꺼짐</small>}</span></label>)}
    </fieldset>
    {selectionMissing && <p className="secret-connection-validation-warning" role="status">검증할 키 발급 서비스를 하나 이상 선택하세요.</p>}
    {enabled && inactiveIssuers.length > 0 && <p className="secret-connection-validation-warning">{inactiveIssuers.map((issuer) => validationIssuerLabels[issuer]).join(', ')}의 서버 검증 기능이 꺼져 있어요. 설정은 저장할 수 있으며 실제 인증 확인은 서버 기능이 켜진 후 실행돼요.</p>}
    {!policy.canConfigure && <p className="caption">이 연결의 보안 담당자가 검증 허용 설정을 변경할 수 있어요.</p>}
    {mutation.isError && <div role="alert"><p>{safeMutationMessage(mutation.error)}</p><button type="button" className="btn outline" disabled={refreshing} onClick={() => { mutation.reset(); onReload() }}>최신 설정 다시 조회</button></div>}
    {policy.canConfigure && <div className="secret-connection-validation-save"><button type="submit" className="btn primary" disabled={disabled || selectionMissing || !changed}>{mutation.isPending ? '저장 중…' : '검증 설정 저장'}</button></div>}
  </form>
}

export function SecretConnectionValidationSettings({ connectionId }: { connectionId: number }) {
  const client = useQueryClient()
  const refreshReads = useSecretReadRefresh()
  const [receipt, setReceipt] = useState<ConnectionValidationPolicy | null>(null)
  const query = useQuery({ queryKey: ['secret-connection-validation-policy', connectionId], queryFn: () => fetchConnectionValidationPolicy(connectionId), retry: false, refetchOnWindowFocus: false })
  const saved = (value: ConnectionValidationPolicy) => {
    setReceipt(value)
    client.setQueryData(['secret-connection-validation-policy', connectionId], value)
    refreshReads()
    for (const key of ['secret-validation-policy', 'secret-validation', 'secret-validation-history', 'secret-risk', 'secret-permission-assistance']) void client.invalidateQueries({ queryKey: [key] })
  }
  if (query.isPending) return <p role="status">연결의 검증 설정을 불러오는 중이에요.</p>
  if (query.isError) return <div role="alert"><p>{safeMutationMessage(query.error)}</p><button className="btn outline" onClick={() => void query.refetch()}>다시 조회</button></div>
  if (query.data.connectionId !== connectionId) return <p role="alert">선택한 연결과 검증 설정이 달라요. 연결 목록에서 다시 선택하세요.</p>
  const policy = query.data
  return <section className="secret-connection-validation-settings">
    <div className="secret-connection-validation-status"><strong>{policy.enabled ? '연결 검증 허용' : '연결 검증 꺼짐'}</strong><span>{policy.provider === 'GITHUB' ? 'GitHub' : policy.provider === 'AWS' ? 'AWS' : policy.provider === 'NOTION' ? 'Notion' : '수집'} 연결 #{connectionId}</span></div>
    <p className="secret-connection-validation-intro">수집한 키로 발급 서비스의 인증 응답을 확인하는 설정이에요. 검사 대상별 허용도 함께 설정하세요.</p>
    {receipt && <div className="secret-connection-validation-receipt" role="status"><strong>검증 설정을 저장했어요.</strong><p>검사 대상별 승인 {receipt.approvedScopeCount} / {receipt.scopeCount}개</p><p>{connectionValidationNextAction(receipt)}</p></div>}
    <PolicyForm key={`${connectionId}:${policy.expectedValidationRevision}`} policy={policy} refreshing={query.isFetching} onSaved={saved} onEdit={() => setReceipt(null)} onReload={() => { setReceipt(null); void query.refetch() }} />
    <div className="secret-connection-validation-scopes"><h3>검사 대상별 검증 허용</h3><p>{policy.scopeCount}개 검사 대상 중 {policy.approvedScopeCount}개에서 인증 확인을 허용했어요.</p><Link className="btn outline" to={`/secrets/connections/${connectionId}/scopes`}>검사 대상별 허용 설정</Link></div>
    {!!policy.blockedReasonCodes.length && <details className="secret-connection-validation-conditions"><summary>현재 실행 조건</summary><ul>{policy.blockedReasonCodes.map((code) => <li key={code}>{validationReason(code)}</li>)}</ul></details>}
  </section>
}
