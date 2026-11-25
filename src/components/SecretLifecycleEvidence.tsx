import { SecretRecordReference } from '@/components/SecretRecordReference'
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { fetchLifecycleEvidence, reviewLifecycleEvidence, submitLifecycleEvidence, type LifecycleEvidence } from '@/api/secretLifecycle'
import type { SecretCaseDetail } from '@/api/secretCases'
import { idempotencyFor, safeMutationMessage } from '@/lib/secretEvidence'
import { validLifecycleTime } from '@/lib/secretResponse'
import { kstInput, kstInputToUtc, positiveId, scanDate } from '@/lib/secretScan'

interface Props { detail: SecretCaseDetail; onReload: () => void; onStale: () => void; disabled: boolean }
const kindLabels: Record<string, string> = { ROTATED: '키 교체', REVOKED: '키 폐기', RETIRED: '사용 종료', FIXTURE_RETIRED: '합성 표본 사용 종료' }
const reviewReasons: Record<string, string> = { EXTERNAL_RECORD_CONFIRMED: '조치 기록과 적용 범위 확인', INSUFFICIENT_EVIDENCE: '근거 부족', WRONG_CREDENTIAL: '다른 키의 근거', CONTRADICTORY_EVIDENCE: '다른 근거와 상충' }
const reuseReasonLabels: Record<string, string> = { ACTION_TIME_IN_FUTURE: '미래 시각의 기록', ACTION_TOO_OLD: '90일이 지난 기록', ACTION_ALREADY_SUBMITTED: '이미 연결된 기록', CASE_NOT_ACTIVE: '종료된 대응의 기록' }
const levelLabels: Record<string, string> = { PENDING: '보안 확인 전', APPROVED_MANUAL: '수동 근거 승인', PROVIDER_VERIFIED: '공급자 확인', SELF_ATTESTED: '본인 확인 · 제한 수준', REJECTED: '근거 반려' }

function EvidenceReview({ item, detail, reasonCodes, onReload, onStale, disabled }: Props & { item: LifecycleEvidence; reasonCodes: Record<string, string[]> }) {
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT' | ''>('')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const key = useRef({ payload: '', key: '' })
  const review = useMutation({
    mutationFn: (selfAttest: boolean) => {
      const body = { decision: selfAttest ? 'APPROVE' as const : decision as 'APPROVE' | 'REJECT', reasonCode: selfAttest ? 'SELF_ATTESTATION_LIMITED' : reason, expectedEvidenceVersion: item.version, expectedCaseVersion: detail.version }
      return reviewLifecycleEvidence(detail.caseId, item.evidenceId, { ...body, idempotencyKey: idempotencyFor(key, body) })
    },
    onSuccess: onReload,
    onError: (error) => { if (error instanceof ApiError && [403, 409].includes(error.status)) onStale() },
  })
  const limitedReview = item.reviewVerificationLevel === 'SELF_ATTESTED'
  const ready = confirmed && decision && reasonCodes[decision]?.includes(reason)
  return <div>
    {item.capabilities.canSelfAttest && <section className="secret-governance-form">
      <h4>1인 운영의 제한 확인</h4>
      <p className="caption">제출한 조치의 책임자를 기록해요. 공급자의 폐기·교체 확인 수준은 별도로 유지돼요.</p>
      <button className="btn outline" disabled={disabled || review.isPending} onClick={() => review.mutate(true)}>제한 확인으로 기록</button>
    </section>}
    {item.capabilities.canReview && <details className="secret-response-disclosure"><summary>이 근거 검토</summary><div className="secret-governance-form">{limitedReview && <p className="caption">원래 조치의 작성자가 확인하는 기록이에요. 제한 확인 수준으로 남아요.</p>}
      <label>검토 결과<select className="select" value={decision} onChange={(event) => { setDecision(event.target.value as 'APPROVE' | 'REJECT'); setReason(''); setConfirmed(false) }}><option value="">결과 선택</option>{['APPROVE', 'REJECT'].filter((code) => reasonCodes[code]?.length > 0).map((code) => <option key={code} value={code}>{code === 'APPROVE' ? limitedReview ? '제한 확인' : '수동 근거 승인' : '근거 반려'}</option>)}</select></label>
      <label>사유<select className="select" value={reason} onChange={(event) => setReason(event.target.value)}><option value="">사유 선택</option>{(reasonCodes[decision] ?? []).filter((code) => code !== 'SELF_ATTESTATION_LIMITED').map((code) => <option key={code} value={code}>{reviewReasons[code] ?? '근거 검토 사유'}</option>)}</select></label>
      <label className="secret-check-label"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> 적용 키·수행 시각·참조를 확인했어요.</label>
      <button className="btn outline" disabled={!ready || disabled || review.isPending} onClick={() => review.mutate(false)}>{limitedReview && decision === 'APPROVE' ? '제한 확인으로 기록' : '근거 검토 저장'}</button>
    </div></details>}
    {review.isError && <p className="notice error" role="alert">{safeMutationMessage(review.error)}</p>}
  </div>
}

export function SecretLifecycleEvidence(props: Props) {
  const { detail, onReload, onStale, disabled } = props
  const evidence = useQuery({ queryKey: ['secret-case-lifecycle', detail.caseId], queryFn: () => fetchLifecycleEvidence(detail.caseId), retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false })
  const [sourceId, setSourceId] = useState('')
  const [kind, setKind] = useState('')
  const [performedAt, setPerformedAt] = useState(() => kstInput(new Date().toISOString()))
  const [confirmed, setConfirmed] = useState(false)
  const key = useRef({ payload: '', key: '' })
  const prefilled = useRef(false)
  useEffect(() => {
    if (prefilled.current || !evidence.data) return
    prefilled.current = true
    const reusable = evidence.data.sourceActions?.filter((action) => action.reusable !== false) ?? []
    if (reusable.length === 1) setSourceId(String(reusable[0].actionId))
  }, [evidence.data])
  const source = evidence.data?.sourceActions?.find((action) => action.actionId === positiveId(sourceId))
  const submit = useMutation({
    mutationFn: () => {
      const body = { ...(source ? { sourceActionId: source.actionId } : { kind, performedAt: kstInputToUtc(performedAt)! }), expectedCaseVersion: detail.version }
      return submitLifecycleEvidence(detail.caseId, { ...body, idempotencyKey: idempotencyFor(key, body) })
    },
    onSuccess: onReload,
    onError: (error) => { if (error instanceof ApiError && [403, 409].includes(error.status)) onStale() },
  })
  const ready = confirmed && (source ? source.reusable !== false : evidence.data?.allowedKinds.includes(kind) && validLifecycleTime(kstInputToUtc(performedAt)) )
  const current = evidence.data?.caseId === detail.caseId && evidence.data.caseVersion === detail.version
  if (evidence.data && evidence.data.caseId !== detail.caseId) return <p className="notice error" role="alert">폐기·교체 근거의 대상이 현재 대응 건과 다릅니다.</p>
  return <section className="secret-response-lifecycle"><h3>키 폐기·교체 근거</h3>
    {evidence.isPending ? <p role="status">폐기·교체 기록 확인 중…</p> : evidence.isError ? <div role="alert"><p>폐기·교체 기록을 불러오지 못했어요.</p><button className="btn outline" onClick={() => void evidence.refetch()}>다시 조회</button></div> : <>
      {!current && <p className="notice">최신 대응 건을 조회한 후 계속하세요.</p>}
      {evidence.data.items.length === 0 ? <p className="caption">확인된 폐기·교체 근거가 없어요.</p> : <ul className="secret-response-evidence-list">{evidence.data.items.map((item) => <li key={item.evidenceId}>
        <div className="secret-response-section-heading"><strong>{kindLabels[item.kind] ?? '키 사용 종료 근거'}</strong><span>{levelLabels[item.verificationLevel] ?? '확인 수준 미기록'}</span></div>
        <p><SecretRecordReference value={item.evidenceRef} /> · 수행 {scanDate(item.performedAt)}</p>
        {!item.isCurrentlyApplicable && <p className="caption">과거 기록 · 현재 해결 판단에 미적용</p>}
        {['APPROVED_MANUAL', 'SELF_ATTESTED'].includes(item.verificationLevel) && <p className="caption">{item.verificationLevel === 'SELF_ATTESTED' ? '본인이 제출·확인한 조치 기록이에요.' : '수동 승인된 조치 기록이에요.'} 공급자의 폐기·교체 상태는 미확인이에요. {item.coverageLimit === 'SIMULATION' ? '합성 표본 사용 종료' : '제한 확인 수준'}</p>}
        {current && (item.capabilities?.canReview || item.capabilities?.canSelfAttest) && <EvidenceReview key={`${item.evidenceId}:${item.version}`} {...props} item={item} reasonCodes={evidence.data.allowedReviewReasonCodes} />}
      </li>)}</ul>}
      {current && evidence.data.capabilities?.canSubmit && <details className="secret-response-disclosure" open={evidence.data.items.length === 0}><summary>폐기·교체 근거 연결</summary><div className="secret-governance-form">
        {!!evidence.data.sourceActions?.length && <label>기존 조치 기록<select className="select" value={sourceId} onChange={(event) => { setSourceId(event.target.value); setConfirmed(false) }}><option value="">다른 조치 근거 입력</option>{evidence.data.sourceActions.map((action) => <option key={action.actionId} value={action.actionId} disabled={action.reusable === false}>{kindLabels[action.lifecycleKind ?? action.actionType] ?? '조치'} · 위치 #{action.occurrenceId} · {scanDate(action.performedAt)}{action.reusable === false ? ` · ${reuseReasonLabels[action.unavailableReasonCode ?? ''] ?? '연결 불가'}${action.existingEvidenceId ? ` #${action.existingEvidenceId}` : ''}` : ''}</option>)}</select></label>}
        {source ? <p className="caption">{kindLabels[source.lifecycleKind ?? source.actionType]} · {scanDate(source.performedAt)} · <SecretRecordReference value={source.evidenceRef} /></p> : <>
          <label>수행 내용<select className="select" value={kind} onChange={(event) => setKind(event.target.value)}><option value="">수행 내용 선택</option>{evidence.data.allowedKinds.filter((code) => Object.hasOwn(kindLabels, code)).map((code) => <option key={code} value={code}>{kindLabels[code]}</option>)}</select></label>
          <label>수행 시각 (KST·최근 90일)<input className="input" type="datetime-local" value={performedAt} onChange={(event) => setPerformedAt(event.target.value)} /></label>
          <p className="caption">확인한 내용과 담당자, 시각은 내부 기록으로 저장해요.</p>
        </>}
        <label className="secret-check-label"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> 이 키에 수행한 폐기·교체 작업의 근거예요.</label>
        <button className="btn primary" disabled={!ready || disabled || submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? '연결 중…' : '근거 연결'}</button>
        {submit.isError && <p className="notice error" role="alert">{safeMutationMessage(submit.error)}</p>}
      </div></details>}
      <details className="secret-response-disclosure"><summary>확인 범위</summary><p className="caption">같은 키의 위치들이 이 근거를 함께 참조해요. 위치별 조치 후 재검사는 각각 확인해요.</p>{evidence.data.providerVerificationStatus === 'NOT_SUPPORTED_BY_CURRENT_VALIDATORS' && <p className="caption">현재 공급자의 폐기 상태 자동 확인은 지원하지 않아요.</p>}</details>
    </>}
  </section>
}
