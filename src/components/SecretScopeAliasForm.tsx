import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { updateScopeDisplayAlias, type ManagedScope } from '@/api/secretConnections'
import { safeMutationMessage } from '@/lib/secretEvidence'
import { validScopeDisplayAlias } from '@/lib/secretScopeAlias'
import { useSecretReadRefresh } from '@/lib/useSecretReadRefresh'

export function SecretScopeAliasForm({ scope, disabled, onReload }: { scope: ManagedScope; disabled: boolean; onReload: () => void }) {
  const [alias, setAlias] = useState(scope.customSafeDisplayAlias ?? ''), [stale, setStale] = useState(false)
  const refresh = useSecretReadRefresh()
  const mutation = useMutation({ mutationFn: () => updateScopeDisplayAlias(scope.scopeId, { safeDisplayAlias: alias.trim() || null, expectedScopeRevision: scope.scopeRevision!, expectedAliasVersion: scope.aliasVersion! }), onSuccess: () => { refresh(); onReload() }, onError: (error) => { if (error instanceof ApiError && [403, 409].includes(error.status)) setStale(true) } })
  if (!scope.capabilities?.canEditAlias) return null
  const value = alias.trim() || null
  const versionsKnown = typeof scope.scopeRevision === 'number' && typeof scope.aliasVersion === 'number'
  const ready = versionsKnown && validScopeDisplayAlias(value) && value !== (scope.customSafeDisplayAlias ?? null)
  return <details className="secret-scope-alias-editor"><summary>표시 이름 수정</summary><form onSubmit={(event) => { event.preventDefault(); if (ready && !disabled && !stale) mutation.mutate() }}><label htmlFor={`scope-alias-${scope.scopeId}`}>서비스·용도 이름<input className="input" id={`scope-alias-${scope.scopeId}`} value={alias} autoComplete="off" maxLength={80} placeholder="결제 서비스 운영 설정" disabled={disabled || stale || mutation.isPending} onChange={(event) => setAlias(event.target.value)} /></label><p className="caption">짧은 서비스 이름만 입력하세요. 키·주소·원천 경로는 사용할 수 없어요. 비우면 기본 표시를 사용해요.</p>{value !== null && !validScopeDisplayAlias(value) && <p className="notice error" role="alert">한글·영문으로 시작한 짧은 이름을 입력하세요. 경로·토큰 형태는 사용할 수 없어요.</p>}{!versionsKnown && <p className="caption">현재 승인·표시 이름 버전을 확인해야 수정할 수 있어요.</p>}<div className="row"><button className="btn primary" disabled={!ready || disabled || stale || mutation.isPending}>표시 이름 저장</button><button className="btn outline" type="button" disabled={disabled || stale || mutation.isPending || !alias} onClick={() => setAlias('')}>기본 표시로</button></div>{mutation.isError && <p className="notice error" role="alert">{safeMutationMessage(mutation.error)}{stale && <button className="btn outline" type="button" onClick={onReload}>현재 범위 다시 조회</button>}</p>}</form></details>
}
