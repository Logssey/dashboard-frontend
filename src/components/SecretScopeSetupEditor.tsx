import { useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { saveScopeSource, fetchStoragePolicies, previewScopeClassification, proposeScopeClassification, type ClassificationPreview, type ScopeClassification, type ProposeClassification, type PreviewClassification } from '@/api/secretPolicy'
import { idempotencyFor, safeMutationMessage, validEvidenceRef } from '@/lib/secretEvidence'
import { approvalReasonLabels, setupReasonLabels } from '@/lib/secretScopeSetup'
import { useSecretReadRefresh } from '@/lib/useSecretReadRefresh'

function AdvancedPolicyEditor({ scope, onUpdated }: { scope: ScopeClassification; onUpdated: (value?: ScopeClassification) => void }) {
  const [origin, setOrigin] = useState(scope.origin === 'UNCLASSIFIED' ? '' : scope.origin)
  const [editPolicy, setEditPolicy] = useState(false)
  const [policyChoice, setPolicyChoice] = useState('keep')
  const [policyPage, setPolicyPage] = useState(0)
  const [evidence, setEvidence] = useState('')
  const [reviewer, setReviewer] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [stale, setStale] = useState(false)
  const [prepared, setPrepared] = useState<{ signature: string; result: ClassificationPreview } | null>(null)
  const command = useRef({ payload: '', key: '' })
  const refresh = useSecretReadRefresh()
  const policies = useQuery({ queryKey: ['secret-policies', 'ACTIVE', policyPage], queryFn: () => fetchStoragePolicies('ACTIVE', policyPage), enabled: !!scope.capabilities?.canPropose && editPolicy, retry: false })
  const candidates = policies.data?.items.filter((policy) => policy.usableNow && policy.rules.some((rule) => rule.connectionId === scope.connectionId && rule.scopeId === scope.scopeId && rule.contentType === scope.contentType)) ?? []
  const selected = candidates.find((policy) => `${policy.policyId}:${policy.version}` === policyChoice)
  const keepPolicy = !editPolicy || policyChoice === 'keep'
  const policyId = keepPolicy ? scope.storagePolicyId : selected?.policyId ?? null
  const policyVersion = keepPolicy ? scope.storagePolicyVersion : selected?.version ?? null
  const request = { origin: origin as ScopeClassification['origin'], storagePolicyId: policyId, storagePolicyVersion: policyVersion, expectedScopeVersion: scope.scopeVersion }
  const signature = JSON.stringify(request)
  const preview = prepared?.signature === signature ? prepared.result : null
  const prepare = useMutation({ mutationFn: (input: { request: PreviewClassification; signature: string }) => previewScopeClassification(scope.scopeId, input.request), onSuccess: (result, input) => { setPrepared({ signature: input.signature, result }); setConfirmed(false); setReviewer('') } })
  const save = useMutation({ mutationFn: (value: ProposeClassification) => proposeScopeClassification(scope.scopeId, value), onSuccess: (result) => { refresh(); onUpdated(result) }, onError: (error) => { if (error instanceof ApiError && error.status === 409) setStale(true) } })
  if (!scope.capabilities?.canPropose) return <section className="card secret-governance-form"><h2>설정 변경</h2><p>운영 또는 보안 담당자가 출처와 정책을 설정할 수 있어요.</p></section>
  const validChoice = keepPolicy || policyChoice === 'none' || !!selected
  const ready = !!origin && validChoice && validEvidenceRef(evidence) && preview?.canSubmit && confirmed && !stale
  const busy = save.isPending || prepare.isPending
  return <section className="card secret-governance-form"><h2>보관 규칙 변경</h2><p className="caption">출처를 저장한 뒤에도 보관 정책이나 위치 확인이 남을 수 있어요.</p>
    <form onSubmit={(event) => { event.preventDefault(); if (!ready || !preview) return
      const payload = { ...request, reasonCode: policyId == null ? 'POLICY_PENDING' as const : scope.origin === 'UNCLASSIFIED' ? 'SOURCE_CLASSIFICATION' as const : 'SOURCE_CORRECTION' as const, evidenceRef: evidence, expectedApprovalMode: preview.approvalMode, reviewerUserId: preview.approvalMode === 'INDEPENDENT_REVIEW' && reviewer ? Number(reviewer) : null }
      save.mutate({ ...payload, idempotencyKey: idempotencyFor(command, payload) })
    }}>
      <label>현재 출처<select className="select" value={origin} disabled={true} onChange={(e) => { setOrigin(e.target.value as typeof origin); setConfirmed(false) }}><option value="">출처 선택</option><option value="PRODUCTION">운영</option><option value="TEST">시험</option></select></label>
      <p className="caption">같은 범위에 운영 자료와 시험 자료가 섞여 있다면 먼저 수집 범위를 나누세요.</p>
      <details open={editPolicy} onToggle={(event) => setEditPolicy(event.currentTarget.open)}><summary>보관 정책 별도 설정</summary><div className="secret-policy-picker">
        <label>적용할 보관 정책<select className="select" value={policyChoice} disabled={busy} onChange={(e) => { setPolicyChoice(e.target.value); setConfirmed(false) }}><option value="keep">현재 설정 유지{scope.storagePolicyId ? ` · #${scope.storagePolicyId} v${scope.storagePolicyVersion}` : ' · 미설정'}</option><option value="none">정책 미설정으로 변경</option>{candidates.map((policy) => <option key={`${policy.policyId}:${policy.version}`} value={`${policy.policyId}:${policy.version}`}>정책 #{policy.policyId} · v{policy.version}</option>)}</select></label>
        {policies.isError && <p role="alert">정책 목록을 불러오지 못했어요. 현재 설정은 유지돼요.</p>}
        {policies.data && <div className="row"><button className="btn outline" type="button" disabled={policyPage === 0 || busy} onClick={() => setPolicyPage((page) => page - 1)}>이전 정책</button><span>{policyPage + 1}페이지</span><button className="btn outline" type="button" disabled={(policyPage + 1) * policies.data.size >= policies.data.total || busy} onClick={() => setPolicyPage((page) => page + 1)}>다음 정책</button></div>}
      </div></details>
      <button className="btn outline" type="button" disabled={!origin || !validChoice || busy || stale} onClick={() => prepare.mutate({ request, signature })}>{prepare.isPending ? '확인 중…' : '저장 방식 확인'}</button>
      {prepare.isError && <p className="notice error" role="alert">{safeMutationMessage(prepare.error)}</p>}
      {preview && <div className="secret-scope-preview" aria-live="polite"><h3>{preview.approvalMode === 'DIRECT' ? '바로 저장할 수 있어요' : '다른 보안 담당자의 검토가 필요해요'}</h3>
        {preview.approvalReasonCodes.map((code) => <p key={code}>{approvalReasonLabels[code] ?? '변경 영향 검토가 필요해요.'}</p>)}
        {!!preview.remainingReasonCodes.length && <p>저장 후 남는 항목: {preview.remainingReasonCodes.map((code) => setupReasonLabels[code] ?? '추가 확인').join(' · ')}</p>}
        {preview.approvalMode === 'INDEPENDENT_REVIEW' && <label>검토 담당자<select className="select" value={reviewer} onChange={(e) => setReviewer(e.target.value)}><option value="">미지정 · 검토 대기로 등록</option>{preview.eligibleReviewers.map((person) => <option key={person.userId} value={person.userId}>{person.displayName}</option>)}</select>{!preview.eligibleReviewers.length && <small>현재 다른 보안 담당자가 없어요. 요청은 대기로 남으며 자동 승인되지 않아요.</small>}</label>}
      </div>}
      <label>근거 참조<input className="input" value={evidence} placeholder="TICKET:SEC-123" maxLength={80} autoComplete="off" disabled={busy} onChange={(e) => { setEvidence(e.target.value); setConfirmed(false) }} /><small>티켓·변경·정책 참조를 입력하세요.</small></label>
      <label className="secret-check-label"><input type="checkbox" checked={confirmed} disabled={!preview || busy} onChange={(e) => setConfirmed(e.target.checked)} /> 이 수집 범위 전체의 출처와 변경 영향을 확인했어요.</label>
      {save.isError && <p className="notice error" role="alert">{safeMutationMessage(save.error)}{stale && <button className="btn outline" type="button" onClick={() => onUpdated()}>현재 설정 다시 확인</button>}</p>}
      <button className="btn primary" disabled={!ready || busy}>{save.isPending ? '저장 중…' : preview?.approvalMode === 'INDEPENDENT_REVIEW' ? '검토 요청' : '출처 저장'}</button>
    </form>
  </section>
}


export function SecretScopeSetupEditor({ scope, onUpdated }: { scope: ScopeClassification; onUpdated: (value?: ScopeClassification) => void }) {
  const [origin, setOrigin] = useState(scope.origin === 'UNCLASSIFIED' ? '' : scope.origin)
  const command = useRef({ payload: '', key: '' })
  const refresh = useSecretReadRefresh()
  const save = useMutation({ mutationFn: () => {
    const payload = { origin, expectedScopeVersion: scope.scopeVersion }
    return saveScopeSource(scope.scopeId, { ...payload, idempotencyKey: idempotencyFor(command, payload) })
  }, onSuccess: (result) => { refresh(); onUpdated(result) } })
  return <>
    <section className="card secret-governance-form"><h2>운영·시험 분류</h2><p>이 검사 대상에서 발견한 기록을 어느 목록에 보여줄지 정해요. 분류하지 않아도 연결 테스트와 스캔은 할 수 있어요.</p>
      <form onSubmit={(event) => { event.preventDefault(); if (origin && scope.capabilities.canClassifySource) save.mutate() }}>
        <label>자료 용도<select className="select" value={origin} disabled={save.isPending || !scope.capabilities.canClassifySource} onChange={(event) => setOrigin(event.target.value as typeof origin)}><option value="">용도 선택</option><option value="PRODUCTION">운영 · 실제 서비스 자료</option><option value="TEST">시험 · 개발·실험 자료</option></select></label>
        <p className="caption">시험으로 분류해도 실제 키 여부·노출 판정은 바뀌지 않으며, 기존 대응 기록은 남아요.</p>
        {!scope.capabilities.canClassifySource && <p role="status">보안 담당자가 분류를 변경할 수 있어요. 연결 중지나 검토 대기 여부도 확인하세요.</p>}
        {save.isError && <p role="alert" className="notice error">{safeMutationMessage(save.error)} <button className="btn outline" type="button" onClick={() => onUpdated()}>현재 설정 다시 조회</button></p>}
        <button className="btn primary" disabled={!origin || save.isPending || !scope.capabilities.canClassifySource}>{save.isPending ? '저장 중…' : '분류 저장'}</button>
        <p className="caption">외부 티켓 번호 없이 변경자·변경 시각을 자동으로 기록해요.</p>
      </form>
    </section>
    {scope.capabilities.canPropose && scope.capabilities.canDraftPolicy && <details className="card secret-governance-form"><summary>보관 허용·금지 규칙 변경 (고급)</summary><p>분류·스캔과 별개의 설정이에요. 키를 보관해도 되는 장소인지 정하는 규칙 변경에는 별도 검토가 필요해요.</p><AdvancedPolicyEditor scope={scope} onUpdated={onUpdated} /></details>}
  </>
}
