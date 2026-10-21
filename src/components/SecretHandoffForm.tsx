import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { requestInvestigation, type HandoffRequest } from '@/api/secretInvestigations'
import { idempotencyFor, safeMutationMessage, validEvidenceRef } from '@/lib/secretEvidence'
import { useSecretReadRefresh } from '@/lib/useSecretReadRefresh'
import './secret-task-guidance.css'

const questionLabels: Record<string, string> = { SOURCE_CLASSIFICATION: '출처 확인', POLICY_UNKNOWN: '보관 정책 보완', OWNER_UNKNOWN: '소유자 확인', SOURCE_PERMISSION: '원천 접근 복구', EVIDENCE_INCOMPLETE: '근거 보완' }
export function SecretHandoffForm({ targetType, targetId, expectedVersion }: { targetType: HandoffRequest['targetType']; targetId: number; expectedVersion: number }) {
  const [question, setQuestion] = useState(''), [reference, setReference] = useState('')
  const requestKey = useRef({ payload: '', key: '' }), refresh = useSecretReadRefresh()
  const request = useMutation({ mutationFn: () => {
    const payload = { targetType, targetId, missingReasonCode: question, evidenceRef: reference || null, expectedTargetVersion: expectedVersion }
    return requestInvestigation({ ...payload, idempotencyKey: idempotencyFor(requestKey, payload) })
  }, onSuccess: () => refresh() })
  return <details className="card secret-governance-form secret-handoff"><summary>담당자에게 확인 요청</summary>
    {request.isSuccess && request.data.taskId ? <div role="status"><p>요청을 등록했어요. 같은 질문의 열린 요청이 있으면 재사용해요.</p><Link className="btn primary" to={`/secrets/triage/investigations/${request.data.taskId}`}>요청 확인·담당자 지정</Link><p className="caption">요청 등록은 설정 변경이나 문제 해결을 뜻하지 않아요.</p></div> : <form onSubmit={(event) => { event.preventDefault(); request.mutate() }}>
      <p className="caption">담당자가 미정이면 배정 대기로 보관해요. 요청으로 접근 권한이 추가되지는 않아요.</p>
      <label>확인할 내용<select className="select" value={question} onChange={(e) => setQuestion(e.target.value)}><option value="">요청 종류 선택</option>{Object.entries(questionLabels).filter(([code]) => targetType === 'SCOPE' || code !== 'SOURCE_CLASSIFICATION').map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
      <label>근거 참조 (선택)<input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="TICKET:SEC-123" maxLength={80} autoComplete="off" /></label>
      {request.isError && <p role="alert" className="notice error">{safeMutationMessage(request.error)}</p>}
      <button className="btn outline" disabled={!question || (!!reference && !validEvidenceRef(reference)) || request.isPending}>{request.isPending ? '등록 중…' : '확인 요청 등록'}</button>
    </form>}
  </details>
}
