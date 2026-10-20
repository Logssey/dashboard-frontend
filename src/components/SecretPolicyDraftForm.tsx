import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { createPolicyDraft, type ScopeClassification } from '@/api/secretPolicy'
import { kstInput, kstInputToUtc, scopeTypeLabel } from '@/lib/secretScan'
import { safeMutationMessage, validEvidenceRef } from '@/lib/secretEvidence'
import { useSecretReadRefresh } from '@/lib/useSecretReadRefresh'

export function SecretPolicyDraftForm({ scope }: { scope: ScopeClassification }) {
  const [effect, setEffect] = useState<'ALLOW' | 'DENY'>('ALLOW')
  const [evidence, setEvidence] = useState('')
  const [from, setFrom] = useState(() => kstInput(new Date().toISOString()))
  const [until, setUntil] = useState('')
  const [withoutExpiry, setWithoutExpiry] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const refresh = useSecretReadRefresh()
  const draft = useMutation({ mutationFn: createPolicyDraft, onSuccess: refresh })
  const datesValid = from && (withoutExpiry || (until && Date.parse(`${from}+09:00`) < Date.parse(`${until}+09:00`)))
  if (!scope.capabilities?.canDraftPolicy) return null
  return <details className="secret-governance-form" aria-labelledby="draft-policy-title"><summary id="draft-policy-title">새 보관 정책 제안</summary><p className="caption">범위 #{scope.scopeId} · {scopeTypeLabel(scope.contentType)} 전체에 적용하는 정책이에요. 수집 허가와 별개로 검토해요.</p>
    <form onSubmit={(e) => { e.preventDefault(); if (confirmed && validEvidenceRef(evidence) && datesValid) draft.mutate({ policyId: null, expectedVersion: null, reasonCode: effect === 'ALLOW' ? 'AUTHORIZED_STORAGE' : 'PROHIBITED_STORAGE', evidenceRef: evidence, validFrom: kstInputToUtc(from), validUntil: withoutExpiry ? null : kstInputToUtc(until), rules: [{ connectionId: scope.connectionId, scopeId: scope.scopeId, contentType: scope.contentType, effect, pathMatch: 'SCOPE', branchCondition: null, protectedPathCondition: null }] }) }}>
      <label>보관 기준<select className="select" value={effect} onChange={(e) => { setEffect(e.target.value as 'ALLOW' | 'DENY'); setConfirmed(false) }}><option value="ALLOW">이 범위 전체 보관 허용</option><option value="DENY">이 범위 전체 보관 금지</option></select></label>
      <label>근거 참조<input className="input" value={evidence} maxLength={80} autoComplete="off" placeholder="TICKET:SEC-123" onChange={(e) => { setEvidence(e.target.value); setConfirmed(false) }} /><small>티켓·변경·정책 참조만 입력하세요. 키나 경로는 입력하지 마세요.</small></label>
      <div className="secret-governance-fields"><label>적용 시작 (KST)<input className="input" type="datetime-local" value={from} onChange={(e) => { setFrom(e.target.value); setConfirmed(false) }} /></label><label>적용 종료 (KST)<input className="input" type="datetime-local" disabled={withoutExpiry} value={until} onChange={(e) => { setUntil(e.target.value); setConfirmed(false) }} /></label></div>
      <label className="secret-check-label"><input type="checkbox" checked={withoutExpiry} onChange={(e) => { setWithoutExpiry(e.target.checked); setConfirmed(false) }} /> 만료 없이 적용하도록 제안</label>
      <label className="secret-check-label"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> 선택한 승인 범위 전체에 적용되며, 다른 보안 담당자의 승인이 필요함을 확인했어요.</label>
      {draft.isError && <p className="notice error" role="alert">{safeMutationMessage(draft.error)}</p>}
      {draft.isSuccess ? <p className="notice" role="status">정책 초안을 등록했어요. <Link to={`/secrets/connections/policies/${draft.data.policyId}/versions/${draft.data.version}`}>초안 검토로 이동</Link></p> : <button className="btn primary" disabled={!confirmed || !validEvidenceRef(evidence) || !datesValid || draft.isPending}>{draft.isPending ? '등록 중…' : '초안 등록'}</button>}
    </form>
  </details>
}
