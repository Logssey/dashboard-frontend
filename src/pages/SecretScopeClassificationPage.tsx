import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { approveScopeClassification, fetchClassificationQueue, fetchScopeClassification, fetchStoragePolicies, proposeScopeClassification, rejectScopeClassification, type ScopeClassification } from '@/api/secretPolicy'
import { PageHeader } from '@/components/PageHeader'
import { SecretPolicyDraftForm } from '@/components/SecretPolicyDraftForm'
import { inventoryOptions } from '@/lib/secretInventory'
import { safeMutationMessage, validEvidenceRef } from '@/lib/secretEvidence'
import { positiveId, scanDate, scopeTypeLabel } from '@/lib/secretScan'
import { useSecretReadRefresh } from '@/lib/useSecretReadRefresh'
import './secret-governance.css'
import './secret-scan.css'

const policyStatusLabel: Record<string, string> = { POLICY_PENDING: '보관 정책 미설정', ACTIVE: '적용 가능한 보관 정책', EXPIRED: '보관 정책 만료', RETIRED: '보관 정책 폐기됨', SCOPE_CHANGED: '현재 범위와 정책 불일치', NOT_YET_VALID: '보관 정책 적용 전', NOT_APPLICABLE: '값 보관 판단 대상 아님' }

export function SecretClassificationQueuePage() {
  const [params, setParams] = useSearchParams()
  const page = (positiveId(params.get('page')) ?? 1) - 1
  const scopes = useQuery({ queryKey: ['secret-classification-queue', page], queryFn: () => fetchClassificationQueue(page), retry: false })
  return <><Link className="secret-scan-back" to="/secrets/connections">← 연결 관리로 돌아가기</Link><PageHeader title="출처 확인" description="미분류·승인 대기 범위를 검토하세요. 수집 허가와 보관 허용은 별개예요." />
    {scopes.isPending ? <p className="card secret-scan-message" role="status">승인 범위를 불러오는 중이에요.</p> : scopes.isError ? <div className="card secret-scan-message" role="alert"><p>{scopes.error instanceof ApiError && scopes.error.status === 403 ? '범위 승인 정보를 조회할 권한이 없어요.' : '범위 승인 정보를 불러오지 못했어요.'}</p><button className="btn outline" onClick={() => void scopes.refetch()}>다시 조회</button></div> : <section className="card secret-scan-section"><h2>확인할 승인 범위</h2>{!scopes.data.items.length ? <p className="secret-scan-message">현재 조건에서 확인할 범위가 없어요.</p> : <div className="table-scroll" tabIndex={0} role="region" aria-label="출처·정책 확인 범위"><table><thead><tr><th>범위</th><th>콘텐츠</th><th>현재 출처</th><th>승인 상태</th><th>보관 정책</th></tr></thead><tbody>{scopes.data.items.map((scope) => <tr key={scope.scopeId}><td><Link to={`/secrets/connections/${scope.connectionId}/scopes/${scope.scopeId}`}>{scope.displayName || `범위 #${scope.scopeId}`}</Link></td><td>{scopeTypeLabel(scope.contentType)}</td><td>{inventoryOptions.origin[scope.origin] ?? '미분류'}</td><td>{scope.pendingProposal ? '변경 승인 대기' : scope.origin === 'UNCLASSIFIED' ? '출처 확인 필요' : '승인됨'}</td><td>{scope.storagePolicyId ? `정책 #${scope.storagePolicyId} · v${scope.storagePolicyVersion}` : policyStatusLabel[scope.policyStatus] ?? '정책 상태 미확인'}</td></tr>)}</tbody></table></div>}<div className="table-foot secret-table-foot"><span>확인 대상 {scopes.data.total}개 범위</span><div className="row"><button className="btn outline" disabled={page === 0} onClick={() => setParams(new URLSearchParams({ page: String(page) }))}>이전</button><span>{page + 1}</span><button className="btn outline" disabled={(page + 1) * scopes.data.size >= scopes.data.total} onClick={() => setParams(new URLSearchParams({ page: String(page + 2) }))}>다음</button></div></div></section>}
  </>
}

function ClassificationForm({ scope, onUpdated }: { scope: ScopeClassification; onUpdated: () => void }) {
  const [origin, setOrigin] = useState('')
  const [policyChoice, setPolicyChoice] = useState('')
  const [policyPage, setPolicyPage] = useState(0)
  const [evidence, setEvidence] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [stale, setStale] = useState(false)
  const policies = useQuery({ queryKey: ['secret-policies', 'ACTIVE', policyPage], queryFn: () => fetchStoragePolicies('ACTIVE', policyPage), enabled: scope.capabilities?.canPropose, retry: false })
  const candidates = policies.data?.items.filter((policy) => policy.usableNow && policy.rules.some((rule) => rule.connectionId === scope.connectionId && rule.scopeId === scope.scopeId && rule.contentType === scope.contentType)) ?? []
  const selectedPolicy = candidates.find((policy) => `${policy.policyId}:${policy.version}` === policyChoice)
  const refresh = useSecretReadRefresh()
  const propose = useMutation({ mutationFn: proposeScopeClassification.bind(null, scope.scopeId), onSuccess: () => { refresh(); onUpdated() }, onError: (error) => { if (error instanceof ApiError && error.status === 409) setStale(true) } })
  if (!scope.capabilities?.canPropose) return null
  const ready = origin !== '' && (policyChoice === 'none' || selectedPolicy != null) && validEvidenceRef(evidence) && confirmed && !stale
  return <section className="card secret-governance-form"><h2>출처·정책 변경 제안</h2><p className="caption">승인 전에는 현재 분류를 유지해요. 운영·시험 자료가 섞인 범위는 먼저 나누어야 해요.</p>
    <form onSubmit={(e) => { e.preventDefault(); if (ready) propose.mutate({ origin: origin as ScopeClassification['origin'], storagePolicyId: selectedPolicy?.policyId ?? null, storagePolicyVersion: selectedPolicy?.version ?? null, reasonCode: !selectedPolicy ? 'POLICY_PENDING' : scope.origin === 'UNCLASSIFIED' ? 'SOURCE_CLASSIFICATION' : 'SOURCE_CORRECTION', evidenceRef: evidence, expectedScopeVersion: scope.scopeVersion }) }}>
      <label>대응 출처<select className="select" value={origin} onChange={(e) => { setOrigin(e.target.value); setConfirmed(false) }}><option value="">출처 선택</option><option value="PRODUCTION">운영</option><option value="TEST">시험</option></select></label>
      <label>보관 정책<select className="select" value={policyChoice} onChange={(e) => { setPolicyChoice(e.target.value); setConfirmed(false) }}><option value="">정책 선택</option><option value="none">{scope.policyStatus === 'NOT_APPLICABLE' ? '값 보관 판단 대상 아님' : '정책 미설정 · 보관 판단 미확인'}</option>{candidates.map((policy) => <option key={`${policy.policyId}:${policy.version}`} value={`${policy.policyId}:${policy.version}`}>정책 #{policy.policyId} · v{policy.version}</option>)}</select></label>
      {policies.isError && <p className="notice">선택 가능한 정책을 불러오지 못했어요. 정책 미설정으로 제안하면 보관 판단은 미확인으로 남아요.</p>}
      {policies.isSuccess && <div className="row"><span className="caption">정책 목록 {policyPage + 1}페이지 · 이 범위에 맞는 활성 정책만 선택할 수 있어요.</span><button className="btn outline" type="button" disabled={policyPage === 0} onClick={() => { setPolicyPage((page) => page - 1); setPolicyChoice(''); setConfirmed(false) }}>이전 정책</button><button className="btn outline" type="button" disabled={(policyPage + 1) * policies.data.size >= policies.data.total} onClick={() => { setPolicyPage((page) => page + 1); setPolicyChoice(''); setConfirmed(false) }}>다음 정책</button></div>}
      <label>승인 근거 참조<input className="input" value={evidence} placeholder="TICKET:SEC-123" maxLength={80} autoComplete="off" onChange={(e) => { setEvidence(e.target.value); setConfirmed(false) }} /><small>티켓·변경·정책 참조만 입력하세요.</small></label>
      <label className="secret-check-label"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> 이 승인 범위 전체의 출처이며, 다른 보안 담당자의 검토가 필요함을 확인했어요.</label>
      {propose.isError && <p className="notice error" role="alert">{safeMutationMessage(propose.error)}{stale && <button className="btn outline" type="button" onClick={onUpdated}>현재 분류 다시 확인</button>}</p>}
      <button className="btn primary" disabled={!ready || propose.isPending}>{propose.isPending ? '등록 중…' : '변경 승인 요청'}</button>
    </form>
  </section>
}

function PendingClassification({ scope, onUpdated }: { scope: ScopeClassification; onUpdated: () => void }) {
  const proposal = scope.pendingProposal!
  const [confirm, setConfirm] = useState(false)
  const [reason, setReason] = useState('')
  const [stale, setStale] = useState(false)
  const refresh = useSecretReadRefresh()
  const success = () => { refresh(); onUpdated() }
  const error = (error: Error) => { if (error instanceof ApiError && error.status === 409) setStale(true) }
  const approve = useMutation({ mutationFn: () => approveScopeClassification(scope.scopeId, proposal.proposalId, { expectedScopeVersion: scope.scopeVersion, expectedProposalVersion: proposal.version }), onSuccess: success, onError: error })
  const reject = useMutation({ mutationFn: () => rejectScopeClassification(scope.scopeId, proposal.proposalId, { reasonCode: reason, expectedProposalVersion: proposal.version }), onSuccess: success, onError: error })
  const busy = approve.isPending || reject.isPending
  return <section className="card secret-governance-form secret-classification-pending"><h2>승인 대기 제안</h2><dl className="secret-scan-facts"><div><dt>제안 출처</dt><dd>{inventoryOptions.origin[proposal.origin] ?? '미확인'}</dd></div><div><dt>보관 정책</dt><dd>{proposal.storagePolicyId ? `정책 #${proposal.storagePolicyId} · v${proposal.storagePolicyVersion}` : '미설정 · 보관 미확인'}</dd></div><div><dt>제안자</dt><dd>사용자 #{proposal.proposedByUserId}</dd></div><div><dt>근거</dt><dd>{proposal.evidenceRef}</dd></div></dl><p className="caption">이 제안은 아직 현재 승인 분류에 적용되지 않았어요.</p>
    {scope.capabilities?.canApprove && <><label className="secret-check-label"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> 범위·근거·과거 기록에 미치는 영향을 검토했어요.</label><button className="btn primary" disabled={!confirm || stale || busy} onClick={() => approve.mutate()}>변경 승인</button></>}
    {scope.capabilities?.canReject && <><label>반려 사유<select className="select" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">반려 사유 선택</option><option value="INSUFFICIENT_EVIDENCE">근거 부족</option><option value="WRONG_SCOPE">범위 불일치</option><option value="POLICY_MISMATCH">정책 불일치</option></select></label><button className="btn outline" disabled={!reason || stale || busy} onClick={() => reject.mutate()}>변경 반려</button></>}
    {!scope.capabilities?.canApprove && !scope.capabilities?.canReject && <p>다른 보안 담당자의 검토를 기다리고 있어요.</p>}
    {(approve.isError || reject.isError) && <p className="notice error" role="alert">{safeMutationMessage(approve.error ?? reject.error)}{stale && <button className="btn outline" onClick={onUpdated}>현재 제안 다시 확인</button>}</p>}
  </section>
}

export function SecretScopeClassificationPage() {
  const { connectionId: rawConnection, scopeId: rawScope } = useParams()
  const connectionId = positiveId(rawConnection), scopeId = positiveId(rawScope)
  const heading = useRef<HTMLHeadingElement>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const classification = useQuery({ queryKey: ['secret-classification', scopeId], queryFn: () => fetchScopeClassification(scopeId!), enabled: connectionId != null && scopeId != null, retry: false, refetchOnWindowFocus: false })
  const valid = classification.data?.connectionId === connectionId && classification.data.scopeId === scopeId ? classification.data : null
  useEffect(() => { heading.current?.focus(); window.scrollTo({ top: 0 }) }, [connectionId, scopeId])
  const reload = () => { void classification.refetch().then(() => setRefreshVersion((version) => version + 1)) }
  return <><Link className="secret-scan-back" to={connectionId ? `/secrets/connections/${connectionId}/scopes` : '/secrets/connections'}>← 승인 범위로 돌아가기</Link><section className="page-head"><div><h1 ref={heading} tabIndex={-1}>범위 #{scopeId ?? '—'} 출처·보관 정책</h1><p className="subtitle">수집 허가·대응 출처·보관 허용을 구분해 관리하세요.</p></div><button className="btn outline" disabled={classification.isFetching || !scopeId} onClick={reload}>새로고침</button></section>
    {!connectionId || !scopeId ? <p className="card secret-scan-message" role="alert">범위 주소가 올바르지 않아요.</p> : classification.isPending ? <p className="card secret-scan-message" role="status">범위 승인 근거를 불러오는 중이에요.</p> : classification.isError ? <p className="card secret-scan-message" role="alert">{classification.error instanceof ApiError && classification.error.status === 403 ? '범위 승인 정보를 열람할 권한이 없어요.' : '범위 승인 정보를 불러오지 못했어요.'}</p> : !valid ? <p className="card secret-scan-message" role="alert">선택한 연결과 승인 범위가 일치하지 않아요. 변경 작업을 진행할 수 없어요.</p> : <>
      <section className="card secret-classification-current"><h2>현재 승인 내용</h2><dl className="secret-scan-facts"><div><dt>대응 출처</dt><dd>{inventoryOptions.origin[valid.origin] ?? '미분류'}</dd></div><div><dt>승인 범위</dt><dd>{scopeTypeLabel(valid.contentType)} · 버전 {valid.scopeRevision}</dd></div><div><dt>보관 정책</dt><dd>{valid.storagePolicy ? <Link to={`/secrets/connections/policies/${valid.storagePolicy.policyId}/versions/${valid.storagePolicy.version}`}>정책 #{valid.storagePolicy.policyId} · v{valid.storagePolicy.version}</Link> : policyStatusLabel[valid.policyStatus] ?? '보관 판단 미확인'}</dd></div><div><dt>승인 시각</dt><dd>{scanDate(valid.approvedAt)}</dd></div></dl><p className="caption">수집을 승인한 사실만으로 이 위치의 키 보관이 허용되지는 않아요.</p><details className="secret-classification-history"><summary>분류 변경 이력</summary>{valid.history.length ? <ul>{valid.history.map((entry) => <li key={entry.decisionId}>{inventoryOptions.origin[entry.fromOrigin as keyof typeof inventoryOptions.origin] ?? '미분류'} → {inventoryOptions.origin[entry.toOrigin as keyof typeof inventoryOptions.origin] ?? '미분류'} · {entry.evidenceRef} · {scanDate(entry.decidedAt)}</li>)}</ul> : <p className="caption">변경 이력이 없어요.</p>}</details></section>
      {valid.pendingProposal ? <PendingClassification key={`${valid.pendingProposal.proposalId}:${valid.pendingProposal.version}:${refreshVersion}`} scope={valid} onUpdated={reload} /> : <ClassificationForm key={`${valid.scopeVersion}:${refreshVersion}`} scope={valid} onUpdated={reload} />}
      <SecretPolicyDraftForm key={`draft:${scopeId}`} scope={valid} />
    </>}
  </>
}
