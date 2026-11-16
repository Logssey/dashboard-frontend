import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { fetchConnectionStoragePolicy, updateConnectionStoragePolicy, type SecretConnectionSettings } from '@/api/secretConnections'
import { idempotencyFor, safeMutationMessage } from '@/lib/secretEvidence'
import { useSecretReadRefresh } from '@/lib/useSecretReadRefresh'

const resultLabels: Record<string, string> = {
  PENDING_REVIEW: '승인 대기',
  APPLIED: '적용 완료',
  UNCHANGED: '현재 정책과 동일',
  BLOCKED: '정책 조건 확인',
  FAILED: '적용하지 못함',
}

export function SecretDefaultStoragePolicy({ connectionId, summary }: { connectionId: number; summary?: SecretConnectionSettings['defaultStoragePolicy'] }) {
  const client = useQueryClient()
  const refresh = useSecretReadRefresh()
  const [selection, setSelection] = useState('')
  const key = useRef({ payload: '', key: '' })
  const query = useQuery({ queryKey: ['secret-default-storage-policy', connectionId], queryFn: () => fetchConnectionStoragePolicy(connectionId), retry: false })
  const selected = selection || (summary?.status === 'APPLICATION_REQUIRED' && query.data?.selectedPolicyId ? `${query.data.selectedPolicyId}:${query.data.selectedPolicyVersion}` : '')
  const chosen = query.data?.policyOptions.find((policy) => `${policy.policyId}:${policy.version}` === selected)
  const statusLabels = { NOT_SELECTED: '미선택', APPLIED: '적용 완료', APPLICATION_REQUIRED: '대상에 적용 가능', PENDING_REVIEW: '승인 대기', RULE_UPDATE_REQUIRED: '일부 대상 규칙 보완', POLICY_EXPIRED: '현재 적용 불가' }
  const needsReview = !!summary?.selectedPolicyId && summary.status !== 'APPLIED'
  const save = useMutation({
    mutationFn: () => {
      if (!query.data || !chosen) throw new Error('POLICY_SELECTION_REQUIRED')
      const body = { policyId: chosen.policyId, policyVersion: chosen.version, expectedSettingsVersion: query.data.settingsVersion, applyMatchingScopes: true as const }
      return updateConnectionStoragePolicy(connectionId, { ...body, idempotencyKey: idempotencyFor(key, body) })
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['secret-default-storage-policy', connectionId] })
      void client.invalidateQueries({ queryKey: ['secret-connection-settings', connectionId] })
      refresh()
    },
  })
  if (query.error instanceof ApiError && [403, 404].includes(query.error.status)) return null
  return <details className="secret-manager-readiness" open={needsReview}>
    <summary>이 연결의 기본 보관 정책{summary && ` · ${statusLabels[summary.status]}`}</summary>
    {query.isPending ? <p role="status">승인된 정책을 조회하고 있어요.</p> : query.isError ? <p role="status">정책을 조회하지 못했어요. <button className="btn outline" onClick={() => void query.refetch()}>다시 조회</button></p> : <>
      <p>조건에 맞는 검사 대상에 같은 승인 정책을 적용해요.</p>{summary && <p>적용 {summary.appliedScopeCount}개 · 승인 대기 {summary.pendingReviewScopeCount}개</p>}
      <p>적용 가능 {query.data.applicableScopeCount}개 · 규칙 보완 {query.data.ruleUpdateRequiredScopeCount}개</p>
      {summary?.ruleUpdateRequiredScopeCount ? <p>대상 {summary.ruleUpdateRequiredScopeCount}개의 규칙을 보완하면 같은 기본 정책을 연결할 수 있어요. <Link to={`/secrets/connections/${connectionId}/scopes`}>대상별 정책 설정</Link></p> : null}
      <label>승인된 보관 정책<select className="select" value={selection} disabled={!query.data.canManage || save.isPending} onChange={(event) => setSelection(event.target.value)}>
        <option value="">{query.data.selectedPolicyId ? `현재 정책 #${query.data.selectedPolicyId} · 버전 ${query.data.selectedPolicyVersion}` : '정책 선택'}</option>
        {query.data.policyOptions.map((policy) => <option key={`${policy.policyId}:${policy.version}`} value={`${policy.policyId}:${policy.version}`}>
          {policy.label ?? policy.name ?? `승인 정책 #${policy.policyId}`} · 버전 {policy.version}
        </option>)}
      </select></label>
      <button className="btn outline" disabled={!chosen || !query.data.canManage || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? '정책 적용 중…' : !selection && summary?.status === 'APPLICATION_REQUIRED' ? '기본 정책을 새 대상에 적용' : '선택한 정책을 대상에 적용'}
      </button>
      {save.isSuccess && <div role="status"><p>기본 정책을 저장했어요. 대상별 적용 상태를 확인하세요.</p>
        {!!save.data.items?.length && <ul>{save.data.items.map((item) => <li key={item.scopeId}>
          검사 대상 #{item.scopeId} · {resultLabels[item.status] ?? '결과 확인 필요'}
        </li>)}</ul>}
      </div>}
      {save.isError && <p role="alert">{safeMutationMessage(save.error)} <button className="btn outline" onClick={() => void query.refetch()}>현재 정책 다시 조회</button></p>}
    </>}
  </details>
}
