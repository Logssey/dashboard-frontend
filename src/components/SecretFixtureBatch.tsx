import { useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { attestFixtureBatch, fetchFixtureAttestations } from '@/api/secretInvestigations'
import { safeMutationMessage } from '@/lib/secretEvidence'
import { SecretDetailPanel } from './SecretDetailPanel'

interface KeyOption { id: number; maskedLabel: string; safeLocationLabel?: string | null }

function FixtureBatchReview({ items, snapshotId, onChanged, onClose }: {
  items: KeyOption[]; snapshotId?: string; onChanged: () => void; onClose: () => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const keys = useRef(new Map<string, string>())
  const matches = useQuery({
    queryKey: ['secret-fixture-batch-review', items.map((item) => item.id), snapshotId ?? null],
    queryFn: async () => {
      const results = await Promise.allSettled(items.slice(0, 100).map((item) => fetchFixtureAttestations(item.id)))
      return results.map((result, index) => ({
        key: items[index],
        data: result.status === 'fulfilled' ? result.value : null,
        unavailable: result.status === 'rejected',
      }))
    },
    retry: false,
    refetchOnWindowFocus: false,
  })
  const choices = matches.data?.flatMap((item) => item.data?.capabilities.canAttest
    ? item.data.eligibleMatches.map((match) => ({ ...match, key: item.key, selectionKey: `${item.key.id}:${match.matchEvidenceId}:${match.expectedScopeVersion}` })) : []) ?? []
  const unavailable = matches.data?.filter((item) => item.unavailable).length ?? 0
  const save = useMutation({
    mutationFn: () => attestFixtureBatch(choices.filter((choice) => selected.includes(choice.selectionKey)).map((choice) => {
      if (!keys.current.has(choice.selectionKey)) keys.current.set(choice.selectionKey, crypto.randomUUID())
      return {
        credentialSetId: choice.key.id,
        attestation: {
          scopeId: choice.scopeId,
          expectedScopeVersion: choice.expectedScopeVersion,
          manifestId: choice.manifestId,
          manifestVersion: choice.manifestVersion,
          matchEvidenceId: choice.matchEvidenceId,
          idempotencyKey: keys.current.get(choice.selectionKey)!,
        },
      }
    })),
  })
  const close = () => {
    if (save.data?.succeededCount) onChanged()
    onClose()
  }

  return <SecretDetailPanel title="테스트용 키 묶음 검토" open onClose={close} closeDisabled={save.isPending}>
    <p>현재 목록에서 승인된 표본과 정확히 일치하는 근거를 조회해요.</p>
    {matches.isPending ? <p role="status">{items.length}개 키의 일치 근거를 조회하고 있어요.</p> : matches.isError ? <p role="alert">근거를 조회하지 못했어요.</p> : <>
      {unavailable > 0 && <p className="caption">조회하지 못한 키 {unavailable}개. 열람 권한과 현재 상태를 확인하세요.</p>}
      {!choices.length ? <p className="secret-scan-message">현재 승인할 수 있는 정확한 일치 근거가 없어요.</p> : <>
        <div className="row between"><strong>일치 근거 {choices.length}개</strong><button className="btn outline" disabled={save.isPending} onClick={() => {
          setSelected(selected.length > 0 ? [] : choices.slice(0, 100).map((choice) => choice.selectionKey))
          setConfirmed(false)
        }}>{selected.length > 0 ? '선택 해제' : choices.length > 100 ? '일치 근거 100개 선택' : '일치 근거 전체 선택'}</button></div>
        {choices.length > 100 && <p className="caption">한 번에 최대 100개를 확인할 수 있어요.</p>}
        <ul className="secret-fixture-batch-list">{choices.map((choice) => <li key={choice.selectionKey}>
          <label><input type="checkbox" checked={selected.includes(choice.selectionKey)} disabled={save.isPending || selected.length >= 100 && !selected.includes(choice.selectionKey)}
            onChange={(event) => {
              setSelected((current) => event.target.checked ? [...current, choice.selectionKey] : current.filter((key) => key !== choice.selectionKey))
              setConfirmed(false)
            }} /><span><strong>{choice.key.maskedLabel}</strong><small>{choice.key.safeLocationLabel ?? `키 #${choice.key.id}`} · 검사 대상 #{choice.scopeId}</small><small>표본 목록 #{choice.manifestId} · 버전 {choice.manifestVersion}</small></span></label>
          <Link to={`/secrets/${choice.key.id}/fixture-attestations`}>근거 상세</Link>
        </li>)}</ul>
        <label className="secret-check-label"><input type="checkbox" checked={confirmed} disabled={save.isPending} onChange={(event) => setConfirmed(event.target.checked)} />선택한 키와 검사 대상에 적용되는 정확한 일치 근거를 검토했어요.</label>
        <button className="btn primary" disabled={!selected.length || !confirmed || save.isPending || matches.isFetching} onClick={() => save.mutate()}>{save.isPending ? '기록 중…' : `선택한 근거 ${selected.length}개 확인`}</button>
      </>}
    </>}
    {save.isError && <p role="alert">{safeMutationMessage(save.error)}</p>}
    {save.data && <div className="secret-manager-readiness" role="status">
      <strong>확인 완료 {save.data.succeededCount}개 · 미처리 {save.data.failedCount}개</strong>
      {save.data.items.some((item) => item.status === 'FAILED') && <ul>{save.data.items.filter((item) => item.status === 'FAILED').map((item, index) => <li key={`${item.credentialSetId}:${index}`}>
        키 #{item.credentialSetId} · 현재 근거 또는 권한을 다시 확인하세요.
      </li>)}</ul>}
      <button className="btn outline" onClick={close}>목록에 반영하고 닫기</button>
    </div>}
  </SecretDetailPanel>
}

export function SecretFixtureBatch({ items, snapshotId, onChanged }: { items: KeyOption[]; snapshotId?: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  return <>
    <button className="btn outline" disabled={!items.length} onClick={() => setOpen(true)}>테스트용 키 묶음 검토</button>
    {open && <FixtureBatchReview items={items} snapshotId={snapshotId} onChanged={onChanged} onClose={() => setOpen(false)} />}
  </>
}
