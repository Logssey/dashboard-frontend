import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { approveStoragePolicy, fetchStoragePolicies, fetchStoragePolicy, retireStoragePolicy } from '@/api/secretPolicy'
import { secretOriginParams, withSecretOrigin } from '@/lib/secretNavigation'
import { PageHeader } from '@/components/PageHeader'
import { safeMutationMessage, validEvidenceRef } from '@/lib/secretEvidence'
import { positiveId, scanDate, scopeTypeLabel } from '@/lib/secretScan'
import { useSecretReadRefresh } from '@/lib/useSecretReadRefresh'
import './secret-governance.css'
import './secret-scan.css'

const statusNames: Record<string, string> = { ACTIVE: '승인됨', DRAFT: '승인 대기', RETIRED: '폐기됨' }
export function SecretPolicyListPage() {
  const [params, updateParams] = useSearchParams()
  const setParams = (next: URLSearchParams) => updateParams(secretOriginParams(next, params))
  const page = (positiveId(params.get('page')) ?? 1) - 1
  const status = params.get('status') ?? 'ACTIVE'
  const valid = ['ACTIVE', 'DRAFT', 'RETIRED', 'ALL'].includes(status)
  const policies = useQuery({ queryKey: ['secret-policies', status, page], queryFn: () => fetchStoragePolicies(status, page), enabled: valid, retry: false })
  return <><Link className="secret-scan-back" to={withSecretOrigin('/secrets/connections', params)}>← 연결 관리로 돌아가기</Link><PageHeader title="보관 정책" description="보관 허용·금지 근거와 적용 기간을 확인하세요." />
    <div className="card secret-scan-filters"><label>정책 상태<select className="select" value={status} onChange={(e) => setParams(new URLSearchParams({ status: e.target.value, page: '1' }))}><option value="ACTIVE">승인된 정책</option><option value="DRAFT">승인 대기</option><option value="RETIRED">폐기된 정책</option><option value="ALL">전체</option></select></label></div>
    {!valid ? <p className="notice error" role="alert">조회 조건을 확인해 주세요.</p> : policies.isPending ? <p className="card secret-scan-message" role="status">정책을 불러오는 중이에요.</p> : policies.isError ? <div className="card secret-scan-message" role="alert"><p>{policies.error instanceof ApiError && policies.error.status === 403 ? '정책을 열람할 권한이 없어요.' : '정책을 불러오지 못했어요.'}</p><button className="btn outline" onClick={() => void policies.refetch()}>다시 조회</button></div> : <section className="card secret-scan-section"><h2>정책 버전</h2>{!policies.data.items.length ? <p className="secret-scan-message">조건에 맞는 정책이 없어요. 보관 허용을 의미하지 않아요.</p> : <div className="table-scroll" tabIndex={0} role="region" aria-label="보관 정책 목록"><table><thead><tr><th>정책</th><th>상태</th><th>적용 기간</th><th>근거</th><th>규칙</th></tr></thead><tbody>{policies.data.items.map((policy) => <tr key={`${policy.policyId}:${policy.version}`}><td><Link to={withSecretOrigin(`/secrets/connections/policies/${policy.policyId}/versions/${policy.version}`, params)}>정책 #{policy.policyId} · v{policy.version}</Link></td><td>{statusNames[policy.status] ?? '상태 미확인'}<span className="asset">{policy.usableNow ? '현재 적용 가능' : '현재 적용 불가'}</span></td><td>{scanDate(policy.validFrom)}<span className="asset">종료 {policy.validUntil ? scanDate(policy.validUntil) : '만료 없음'}</span></td><td>{policy.evidenceRef}</td><td>{policy.rules.length}개</td></tr>)}</tbody></table></div>}<div className="table-foot secret-table-foot"><span>정책 버전 {policies.data.total}개</span><div className="row"><button className="btn outline" disabled={page === 0} onClick={() => setParams(new URLSearchParams({ status, page: String(page) }))}>이전</button><span>{page + 1}</span><button className="btn outline" disabled={(page + 1) * policies.data.size >= policies.data.total} onClick={() => setParams(new URLSearchParams({ status, page: String(page + 2) }))}>다음</button></div></div></section>}
    <p className="secret-history-footnote">새 정책은 연결의 승인 범위 상세에서 제안할 수 있어요. 승인되지 않은 초안은 보관 허용 근거로 사용하지 않아요.</p>
  </>
}

export function SecretPolicyDetailPage() {
  const [params] = useSearchParams()
  const { policyId: rawPolicy, version: rawVersion } = useParams()
  const policyId = positiveId(rawPolicy), version = positiveId(rawVersion)
  const title = useRef<HTMLHeadingElement>(null)
  const refresh = useSecretReadRefresh()
  const [confirmed, setConfirmed] = useState(false)
  const [evidence, setEvidence] = useState('')
  const [retireReason, setRetireReason] = useState('POLICY_WITHDRAWN')
  const [retireConfirmed, setRetireConfirmed] = useState(false)
  const [stale, setStale] = useState(false)
  const policy = useQuery({ queryKey: ['secret-policy', policyId, version], queryFn: () => fetchStoragePolicy(policyId!, version!), enabled: policyId != null && version != null, retry: false, refetchOnWindowFocus: false })
  useEffect(() => { title.current?.focus(); window.scrollTo({ top: 0 }); setConfirmed(false); setStale(false) }, [policyId, version])
  const onError = (error: Error) => { if (error instanceof ApiError && error.status === 409) setStale(true) }
  const onSuccess = () => { refresh(); void policy.refetch(); setConfirmed(false); setRetireConfirmed(false) }
  const approve = useMutation({ mutationFn: approveStoragePolicy, onSuccess, onError })
  const retire = useMutation({ mutationFn: () => retireStoragePolicy(policyId!, { expectedVersion: version!, reasonCode: retireReason, evidenceRef: evidence }), onSuccess, onError })
  const busy = approve.isPending || retire.isPending
  return <><Link className="secret-scan-back" to={withSecretOrigin('/secrets/connections/policies', params)}>← 정책 목록으로 돌아가기</Link><section className="page-head"><div><h1 ref={title} tabIndex={-1}>보관 정책 {policyId ? `#${policyId} · v${version ?? '—'}` : ''}</h1><p className="subtitle">적용 범위와 근거를 확인하고 승인하세요.</p></div></section>
    {!policyId || !version ? <p className="card secret-scan-message" role="alert">정책 주소가 올바르지 않아요.</p> : policy.isPending ? <p className="card secret-scan-message" role="status">정책을 불러오는 중이에요.</p> : policy.isError ? <div className="card secret-scan-message" role="alert"><p>{policy.error instanceof ApiError && policy.error.status === 403 ? '정책을 조회할 권한이 없어요.' : '정책을 찾거나 불러오지 못했어요.'}</p><button className="btn outline" onClick={() => void policy.refetch()}>다시 조회</button></div> : <>
      <section className="card secret-scan-section"><div className="row between"><h2>{statusNames[policy.data.status] ?? '상태 미확인'}</h2><span>{policy.data.usableNow ? '현재 적용 가능' : '현재 적용 불가'}</span></div><dl className="secret-scan-facts"><div><dt>제안자</dt><dd>사용자 #{policy.data.createdByUserId}</dd></div><div><dt>승인자</dt><dd>{policy.data.approvedByUserId ? `사용자 #${policy.data.approvedByUserId}` : '승인 전'}</dd></div><div><dt>적용 시작</dt><dd>{scanDate(policy.data.validFrom)}</dd></div><div><dt>적용 종료</dt><dd>{policy.data.validUntil ? scanDate(policy.data.validUntil) : '만료 없음'}</dd></div><div><dt>근거</dt><dd>{policy.data.evidenceRef}</dd></div><div><dt>승인 시각</dt><dd>{scanDate(policy.data.approvedAt)}</dd></div></dl><div className="table-scroll" tabIndex={0} role="region" aria-label="정책 적용 규칙"><table><thead><tr><th>범위</th><th>콘텐츠</th><th>보관 기준</th><th>적용 조건</th></tr></thead><tbody>{policy.data.rules.map((rule, index) => <tr key={rule.ruleId ?? index}><td><Link to={withSecretOrigin(`/secrets/connections/${rule.connectionId}/scopes/${rule.scopeId}`, params)}>승인 범위 #{rule.scopeId}</Link></td><td>{scopeTypeLabel(rule.contentType)}</td><td>{rule.effect === 'ALLOW' ? '허용' : '금지'}</td><td>{rule.pathMatch === 'SCOPE' ? '승인 범위 전체' : '보호된 세부 경로 조건'}</td></tr>)}</tbody></table></div></section>
      {stale && <p className="notice error" role="alert">정책 상태가 바뀌었어요. <button className="btn outline" onClick={() => { void policy.refetch().then(() => { setStale(false); setConfirmed(false); setRetireConfirmed(false) }) }}>최신 정책 다시 확인</button></p>}
      {(approve.isError || retire.isError) && <p className="notice error" role="alert">{safeMutationMessage(approve.error ?? retire.error)}</p>}
      {(approve.isSuccess || retire.isSuccess) && <p className="notice" role="status">정책 변경을 저장했어요. 적용 대상의 판정은 최신 근거로 다시 확인해요.</p>}
      {policy.data.capabilities?.canApprove && <section className="card secret-governance-form"><h2>정책 승인</h2><p className="caption">제안자와 다른 보안 담당자가 적용 범위·기간·근거를 확인해요.</p><label className="secret-check-label"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> 범위와 근거를 검토했어요.</label><button className="btn primary" disabled={!confirmed || busy || stale} onClick={() => approve.mutate(policy.data)}>정책 승인</button></section>}
      {policy.data.capabilities?.canRetire && <section className="card secret-governance-form"><h2>정책 폐기</h2><label>사유<select className="select" value={retireReason} onChange={(e) => { setRetireReason(e.target.value); setRetireConfirmed(false) }}><option value="POLICY_WITHDRAWN">정책 철회</option><option value="POLICY_REPLACED">다른 정책으로 대체</option></select></label><label>근거 참조<input className="input" value={evidence} onChange={(e) => { setEvidence(e.target.value); setRetireConfirmed(false) }} placeholder="CHANGE:SEC-123" maxLength={80} /></label><label className="secret-check-label"><input type="checkbox" checked={retireConfirmed} onChange={(e) => setRetireConfirmed(e.target.checked)} /> 기존 보관 판단에 재검토가 필요해짐을 확인했어요.</label><button className="btn outline" disabled={!retireConfirmed || !validEvidenceRef(evidence) || busy || stale} onClick={() => retire.mutate()}>정책 폐기</button></section>}
    </>}
  </>
}
