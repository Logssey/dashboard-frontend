import { useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { attestFixture, fetchFixtureAttestations } from '@/api/secretInvestigations'
import { PageHeader } from '@/components/PageHeader'
import { idempotencyFor, safeMutationMessage } from '@/lib/secretEvidence'
import { positiveId, scanDate } from '@/lib/secretScan'
import { useSecretReadRefresh } from '@/lib/useSecretReadRefresh'
import './secret-governance.css'
import './secret-scan.css'

const fixtureLabel: Record<string, string> = { VERIFIED_SYNTHETIC: '합성 표본 확인', POSSIBLE_REAL: '실제 키 가능성 확인 필요', CONFIRMED_REAL: '실제 키 확인', NOT_APPLICABLE: '합성 판정 대상 아님' }
export function SecretFixtureAttestationsPage() {
  const { secretId: rawId } = useParams(), secretId = positiveId(rawId)
  const [selection, setSelection] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const requestKey = useRef({ payload: '', key: '' })
  const refresh = useSecretReadRefresh()
  const matches = useQuery({ queryKey: ['secret-fixture-attestations', secretId], queryFn: () => fetchFixtureAttestations(secretId!), enabled: secretId != null, retry: false, refetchOnWindowFocus: false })
  const selected = matches.data?.eligibleMatches?.find((match) => String(match.matchEvidenceId) === selection)
  const attest = useMutation({ mutationFn: () => { if (!selected) throw new Error('NO_MATCH'); const request = { scopeId: selected.scopeId, expectedScopeVersion: selected.expectedScopeVersion, manifestId: selected.manifestId, manifestVersion: selected.manifestVersion, matchEvidenceId: selected.matchEvidenceId }; return attestFixture(secretId!, { ...request, idempotencyKey: idempotencyFor(requestKey, request) }) }, onSuccess: () => { refresh(); setConfirmed(false); setSelection(''); void matches.refetch() } })
  return <><Link className="secret-scan-back" to={secretId ? `/secrets/${secretId}?origin=TEST` : '/secrets/findings'}>← 키 상세로 돌아가기</Link><PageHeader title="합성 표본 근거" description="보호된 비교 결과와 정확한 합성 키 일치 근거를 확인하세요." />
    {!secretId ? <p className="card secret-scan-message" role="alert">키 주소가 올바르지 않아요.</p> : matches.isPending ? <p className="card secret-scan-message" role="status">합성 일치 근거를 불러오는 중이에요.</p> : matches.isError ? <div className="card secret-scan-message" role="alert"><p>{matches.error instanceof ApiError && matches.error.status === 403 ? '합성 근거를 열람할 권한이 없어요.' : '합성 일치 근거를 불러오지 못했어요.'}</p><button className="btn outline" onClick={() => void matches.refetch()}>다시 조회</button></div> : <>
      <section className="card secret-scan-section"><h2>{fixtureLabel[matches.data.fixtureStatus ?? ''] ?? '합성 여부 확인 불가'}</h2><p className="caption">승인된 표본 목록과 정확히 같은 키·범위 버전의 보호된 비교 결과가 필요해요. 키 원문을 입력하지 않아요.</p>{matches.data.items.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="합성 표본 확인 이력"><table><thead><tr><th>확인 기록</th><th>범위·표본 버전</th><th>상태</th><th>확인 시각</th></tr></thead><tbody>{matches.data.items.map((item) => <tr key={item.attestationId}><td>근거 #{item.attestationId}</td><td>범위 #{item.scopeId} · v{item.scopeRevision}<span className="asset">표본 목록 #{item.manifestId} · v{item.manifestVersion}</span></td><td>{item.isCurrentlyValid ? '현재 유효한 합성 근거' : '과거 기록 · 현재 적용 불가'}</td><td>{scanDate(item.confirmedAt)}</td></tr>)}</tbody></table></div> : <p className="secret-scan-message">승인된 합성 표본 근거가 없어요. 실제 키가 아니라고 단정하지 않아요.</p>}</section>
      {matches.data.capabilities?.canAttest && <section className="card secret-governance-form"><h2>일치 결과 확인</h2><label>확인할 보호된 비교 결과<select className="select" value={selection} onChange={(e) => { setSelection(e.target.value); setConfirmed(false) }}><option value="">일치 결과 선택</option>{matches.data.eligibleMatches?.map((match) => <option key={match.matchEvidenceId} value={match.matchEvidenceId}>일치 근거 #{match.matchEvidenceId} · 범위 #{match.scopeId} v{match.scopeRevision} · 표본 #{match.manifestId} v{match.manifestVersion}</option>)}</select></label><label className="secret-check-label"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> 이 키와 현재 승인 범위에 적용되는 정확한 일치 근거임을 확인했어요.</label><button className="btn primary" disabled={!selected || !confirmed || attest.isPending} onClick={() => attest.mutate()}>합성 근거 확인 요청</button>{attest.isError && <p className="notice error" role="alert">{safeMutationMessage(attest.error)}</p>}</section>}
      <p className="secret-history-footnote">합성 표본 확인만으로 위치 제거·재검사·대응 건 해결을 완료하지 않아요.</p>
    </>}
  </>
}
