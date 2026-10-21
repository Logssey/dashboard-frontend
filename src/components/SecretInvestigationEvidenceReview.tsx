import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { acceptInvestigationEvidence, type InvestigationDetail } from '@/api/secretInvestigations'
import { idempotencyFor, safeMutationMessage } from '@/lib/secretEvidence'
import { useSecretReadRefresh } from '@/lib/useSecretReadRefresh'
export function SecretInvestigationEvidenceReview({ task, onUpdated }: { task: InvestigationDetail; onUpdated: () => void }) {
  const [history, setHistory] = useState(''), [confirm, setConfirm] = useState(false)
  const command = useRef({ payload: '', key: '' }), refresh = useSecretReadRefresh()
  const eligible = task.activities?.filter((entry) => entry.eventType === 'EVIDENCE_ADDED' && (task.missingReasonCode !== 'OWNER_UNKNOWN' || entry.safeChanges?.evidenceKind === 'OWNER_CONFIRMATION')) ?? []
  const review = useMutation({ mutationFn: () => { const request = { historyId: Number(history), expectedVersion: task.version }; return acceptInvestigationEvidence(task.taskId, { ...request, idempotencyKey: idempotencyFor(command, request) }) }, onSuccess: () => { refresh(); onUpdated() } })
  if (!task.capabilities.canReviewEvidence || !eligible.length) return null
  return <section className="card secret-governance-form"><h2>제출 근거 검토</h2><label>확인한 자료<select className="select" value={history} onChange={(e) => { setHistory(e.target.value); setConfirm(false) }}><option value="">제출 근거 선택</option>{eligible.map((entry) => <option key={entry.historyId} value={entry.historyId}>{entry.evidenceRef} · 근거 #{entry.historyId}</option>)}</select></label><label className="secret-check-label"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> 이 자료가 요청한 사실을 보완하는지 확인했어요.</label>{review.isError && <p role="alert">{safeMutationMessage(review.error)}</p>}<button className="btn outline" disabled={!history || !confirm || review.isPending} onClick={() => review.mutate()}>근거 검토 완료</button><p className="caption">근거 검토는 키의 노출·보관 허용·폐기를 판정하지 않아요.</p></section>
}
