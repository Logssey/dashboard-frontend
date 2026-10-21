import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { approveScopeClassification, fetchClassificationQueue, fetchScopeClassification, assignScopeReviewer, rejectScopeClassification, type ScopeClassification } from '@/api/secretPolicy'
import { SecretScopeSetupEditor } from '@/components/SecretScopeSetupEditor'
import { scopeSetupReasons, setupReasonLabels, scopeChangeMessage, refreshedWorkbenchReturn } from '@/lib/secretScopeSetup'
import { PageHeader } from '@/components/PageHeader'
import { SecretPolicyDraftForm } from '@/components/SecretPolicyDraftForm'
import { inventoryOptions } from '@/lib/secretInventory'
import { idempotencyFor, safeMutationMessage } from '@/lib/secretEvidence'
import { positiveId, scanDate, scopeTypeLabel } from '@/lib/secretScan'
import { useSecretReadRefresh } from '@/lib/useSecretReadRefresh'
import { safeWorkbenchReturn } from '@/lib/secretWorkbench'
import './secret-governance.css'
import './secret-scan.css'

const policyStatusLabel: Record<string, string> = { POLICY_PENDING: '보관 정책 미설정', ACTIVE: '적용 가능한 보관 정책', EXPIRED: '보관 정책 만료', RETIRED: '보관 정책 폐기됨', SCOPE_CHANGED: '현재 범위와 정책 불일치', NOT_YET_VALID: '보관 정책 적용 전', NOT_APPLICABLE: '값 보관 판단 대상 아님' }

export function SecretClassificationQueuePage() {
  const [params, setParams] = useSearchParams()
  const page = (positiveId(params.get('page')) ?? 1) - 1
  const scopes = useQuery({ queryKey: ['secret-classification-queue', page], queryFn: () => fetchClassificationQueue(page), retry: false })
  return <><Link className="secret-scan-back" to="/secrets/connections">← 연결 관리로 돌아가기</Link><PageHeader title="범위 설정" description="출처, 보관 정책, 검토 대기를 각각 확인하세요." />
    {scopes.isPending ? <p className="card secret-scan-message" role="status">승인 범위를 불러오는 중이에요.</p> : scopes.isError ? <div className="card secret-scan-message" role="alert"><p>{scopes.error instanceof ApiError && scopes.error.status === 403 ? '범위 승인 정보를 조회할 권한이 없어요.' : '범위 승인 정보를 불러오지 못했어요.'}</p><button className="btn outline" onClick={() => void scopes.refetch()}>다시 조회</button></div> : <section className="card secret-scan-section"><h2>확인할 승인 범위</h2>{!scopes.data.items.length ? <p className="secret-scan-message">현재 조건에서 확인할 범위가 없어요.</p> : <div className="table-scroll" tabIndex={0} role="region" aria-label="출처·정책 확인 범위"><table><thead><tr><th>범위</th><th>콘텐츠</th><th>현재 출처</th><th>남은 확인</th><th>보관 정책</th></tr></thead><tbody>{scopes.data.items.map((scope) => <tr key={scope.scopeId}><td><Link to={`/secrets/connections/${scope.connectionId}/scopes/${scope.scopeId}`}>{scope.displayName || `범위 #${scope.scopeId}`}</Link></td><td>{scopeTypeLabel(scope.contentType)}</td><td>{inventoryOptions.origin[scope.origin] ?? '미분류'}</td><td>{scopeSetupReasons(scope).map((code) => setupReasonLabels[code] ?? '추가 확인').join(' · ') || '설정 완료'}</td><td>{scope.storagePolicyId ? `정책 #${scope.storagePolicyId} · v${scope.storagePolicyVersion}` : policyStatusLabel[scope.policyStatus] ?? '정책 상태 미확인'}</td></tr>)}</tbody></table></div>}<div className="table-foot secret-table-foot"><span>확인 대상 {scopes.data.total}개 범위</span><div className="row"><button className="btn outline" disabled={page === 0} onClick={() => setParams(new URLSearchParams({ page: String(page) }))}>이전</button><span>{page + 1}</span><button className="btn outline" disabled={(page + 1) * scopes.data.size >= scopes.data.total} onClick={() => setParams(new URLSearchParams({ page: String(page + 2) }))}>다음</button></div></div></section>}
  </>
}

function PendingClassification({ scope, onUpdated }: { scope: ScopeClassification; onUpdated: (value?: ScopeClassification) => void }) {
  const proposal = scope.pendingProposal!
  const [reviewer, setReviewer] = useState(proposal.reviewerUserId ? String(proposal.reviewerUserId) : '')
  const command = useRef({ payload: '', key: '' })
  const [confirm, setConfirm] = useState(false)
  const [reason, setReason] = useState('')
  const [stale, setStale] = useState(false)
  const refresh = useSecretReadRefresh()
  const success = (value: ScopeClassification) => { refresh(); onUpdated(value) }
  const error = (error: Error) => { if (error instanceof ApiError && error.status === 409) setStale(true) }
  const approve = useMutation({ mutationFn: () => approveScopeClassification(scope.scopeId, proposal.proposalId, { expectedScopeVersion: scope.scopeVersion, expectedProposalVersion: proposal.version, idempotencyKey: idempotencyFor(command, [proposal.proposalId, proposal.version, "approve"]) }), onSuccess: success, onError: error })
  const reject = useMutation({ mutationFn: () => rejectScopeClassification(scope.scopeId, proposal.proposalId, { reasonCode: reason, expectedProposalVersion: proposal.version, idempotencyKey: idempotencyFor(command, [proposal.proposalId, proposal.version, reason]) }), onSuccess: success, onError: error })
  const assign = useMutation({ mutationFn: () => { const payload = { reviewerUserId: reviewer ? Number(reviewer) : null, expectedProposalVersion: proposal.version }; return assignScopeReviewer(scope.scopeId, proposal.proposalId, { ...payload, idempotencyKey: idempotencyFor(command, [proposal.proposalId, payload]) }) }, onSuccess: success, onError: error })
  const busy = approve.isPending || reject.isPending || assign.isPending
  return <section className="card secret-governance-form secret-classification-pending"><h2>승인 대기 제안</h2><dl className="secret-scan-facts"><div><dt>제안 출처</dt><dd>{inventoryOptions.origin[proposal.origin] ?? '미확인'}</dd></div><div><dt>보관 정책</dt><dd>{proposal.storagePolicyId ? `정책 #${proposal.storagePolicyId} · v${proposal.storagePolicyVersion}` : '미설정 · 보관 미확인'}</dd></div><div><dt>제안자</dt><dd>사용자 #{proposal.proposedByUserId}</dd></div><div><dt>근거</dt><dd>{proposal.evidenceRef}</dd></div></dl><p className="caption">이 제안은 아직 현재 승인 분류에 적용되지 않았어요.</p>
    {scope.capabilities?.canApprove && <><label className="secret-check-label"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> 범위·근거·과거 기록에 미치는 영향을 검토했어요.</label><button className="btn primary" disabled={!confirm || stale || busy} onClick={() => approve.mutate()}>변경 승인</button></>}
    {scope.capabilities?.canReject && <><label>반려 사유<select className="select" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">반려 사유 선택</option><option value="INSUFFICIENT_EVIDENCE">근거 부족</option><option value="WRONG_SCOPE">범위 불일치</option><option value="POLICY_MISMATCH">정책 불일치</option></select></label><button className="btn outline" disabled={!reason || stale || busy} onClick={() => reject.mutate()}>변경 반려</button></>}
    {!scope.capabilities?.canApprove && !scope.capabilities?.canReject && <p>다른 보안 담당자의 검토를 기다리고 있어요. 직접 요청한 변경은 스스로 승인할 수 없어요.</p>}
    <p className="caption">요청 시각 {scanDate(proposal.createdAt)} · 검토 담당자 {scope.eligibleReviewers?.find((person) => person.userId === proposal.reviewerUserId)?.displayName ?? (proposal.reviewerUserId ? `사용자 #${proposal.reviewerUserId}` : '미지정')}</p>
    {scope.capabilities?.canAssignReviewer && <div className="row"><label>검토 담당자 지정<select className="select" value={reviewer} disabled={busy} onChange={(e) => setReviewer(e.target.value)}><option value="">미지정</option>{scope.eligibleReviewers?.map((person) => <option key={person.userId} value={person.userId}>{person.displayName}</option>)}</select></label><button className="btn outline" disabled={busy || stale} onClick={() => assign.mutate()}>담당자 저장</button></div>}
    {assign.isError && <p className="notice error" role="alert">{safeMutationMessage(assign.error)}</p>}
    {(approve.isError || reject.isError) && <p className="notice error" role="alert">{safeMutationMessage(approve.error ?? reject.error)}{stale && <button className="btn outline" onClick={() => onUpdated()}>현재 제안 다시 확인</button>}</p>}
  </section>
}

export function SecretScopeClassificationPage() {
  const { connectionId: rawConnection, scopeId: rawScope } = useParams()
  const [params] = useSearchParams()
  const connectionId = positiveId(rawConnection), scopeId = positiveId(rawScope)
  const heading = useRef<HTMLHeadingElement>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [receipt, setReceipt] = useState<ScopeClassification | null>(null)
  const classification = useQuery({ queryKey: ['secret-classification', scopeId], queryFn: () => fetchScopeClassification(scopeId!), enabled: connectionId != null && scopeId != null, retry: false, refetchOnWindowFocus: false })
  const valid = classification.data?.connectionId === connectionId && classification.data.scopeId === scopeId ? classification.data : null
  useEffect(() => { heading.current?.focus(); window.scrollTo({ top: 0 }) }, [connectionId, scopeId])
  const reload = (value?: ScopeClassification) => { if (value) setReceipt(value); void classification.refetch().then(() => setRefreshVersion((version) => version + 1)) }
  return <><Link className="secret-scan-back" to={params.get('return') === 'workbench' ? safeWorkbenchReturn(params.get('returnQuery'), scopeId ? String(scopeId) : undefined) : connectionId ? `/secrets/connections/${connectionId}/scopes` : '/secrets/connections'}>← 승인 범위로 돌아가기</Link><section className="page-head"><div><h1 ref={heading} tabIndex={-1}>범위 #{scopeId ?? '—'} 출처·보관 정책</h1><p className="subtitle">수집 허가·대응 출처·보관 허용을 구분해 관리하세요.</p></div><button className="btn outline" disabled={classification.isFetching || !scopeId} onClick={() => reload()}>새로고침</button></section>
    {!connectionId || !scopeId ? <p className="card secret-scan-message" role="alert">범위 주소가 올바르지 않아요.</p> : classification.isPending ? <p className="card secret-scan-message" role="status">범위 승인 근거를 불러오는 중이에요.</p> : classification.isError ? <p className="card secret-scan-message" role="alert">{classification.error instanceof ApiError && classification.error.status === 403 ? '범위 승인 정보를 열람할 권한이 없어요.' : '범위 승인 정보를 불러오지 못했어요.'}</p> : !valid ? <p className="card secret-scan-message" role="alert">선택한 연결과 승인 범위가 일치하지 않아요. 변경 작업을 진행할 수 없어요.</p> : <>
      {receipt?.scopeId === scopeId && receipt.changeResult && <section className="card secret-scope-receipt" role="status"><h2>{scopeChangeMessage(receipt.changeResult)}</h2><p>설정 저장과 남은 확인 항목은 별개예요.</p><ul>{receipt.changeResult.remainingReasonCodes.map((code) => <li key={code}>{setupReasonLabels[code] ?? '추가 확인'}</li>)}</ul><Link className="btn outline" to={params.get('return') === 'workbench' ? refreshedWorkbenchReturn(params.get('returnQuery')) : '/secrets/connections/review'}>최신 목록에서 확인</Link></section>}
      <section className="card secret-classification-current"><h2>현재 승인 내용</h2><dl className="secret-scan-facts"><div><dt>대응 출처</dt><dd>{inventoryOptions.origin[valid.origin] ?? '미분류'}</dd></div><div><dt>승인 범위</dt><dd>{scopeTypeLabel(valid.contentType)} · 버전 {valid.scopeRevision}</dd></div><div><dt>보관 정책</dt><dd>{valid.storagePolicy ? <Link to={`/secrets/connections/policies/${valid.storagePolicy.policyId}/versions/${valid.storagePolicy.version}`}>정책 #{valid.storagePolicy.policyId} · v{valid.storagePolicy.version}</Link> : policyStatusLabel[valid.policyStatus] ?? '보관 판단 미확인'}</dd></div><div><dt>승인 시각</dt><dd>{scanDate(valid.approvedAt)}</dd></div></dl><p className="caption">수집을 승인한 사실만으로 이 위치의 키 보관이 허용되지는 않아요.</p><details className="secret-classification-history"><summary>분류 변경 이력</summary>{valid.history.length ? <ul>{valid.history.map((entry) => <li key={entry.decisionId}>{inventoryOptions.origin[entry.fromOrigin as keyof typeof inventoryOptions.origin] ?? '미분류'} → {inventoryOptions.origin[entry.toOrigin as keyof typeof inventoryOptions.origin] ?? '미분류'} · {entry.evidenceRef} · {scanDate(entry.decidedAt)}</li>)}</ul> : <p className="caption">변경 이력이 없어요.</p>}</details></section>
      {valid.pendingProposal ? <PendingClassification key={`${valid.pendingProposal.proposalId}:${valid.pendingProposal.version}:${refreshVersion}`} scope={valid} onUpdated={reload} /> : <SecretScopeSetupEditor key={`${valid.scopeVersion}:${refreshVersion}`} scope={valid} onUpdated={reload} />}
      <SecretPolicyDraftForm key={`draft:${scopeId}`} scope={valid} />
    </>}
  </>
}
