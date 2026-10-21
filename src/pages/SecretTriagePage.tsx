import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { decideSecretOccurrence, fetchReviewContext, repairSecretCaseLink, type ReviewContext, type ReviewDecision, type ReviewResult } from '@/api/secretTriage'
import { SecretTaskGuidance } from '@/components/SecretTaskGuidance'
import { SecretHandoffForm } from '@/components/SecretHandoffForm'
import { SecretSourceCoordinates } from '@/components/SecretDiscoveryContext'
import { Badge } from '@/components/Badge'
import { componentStateLabel, credentialTypeLabel, issuerLabel, secretValidationLabel, secretValidationReasonLabel } from '@/lib/labels'
import { exposureLabels, inventoryOptions, presenceLabels } from '@/lib/secretInventory'
import { idempotencyFor, missingEvidenceLabel, safeMutationMessage } from '@/lib/secretEvidence'
import { allowedReviewDecisions, correctionRecheckLabel, currentReviewVersions, decisionUnavailableLabel, matchingReviewContext, reviewDecisionLabel, reviewInputErrors, reviewReasonLabel, reviewReturnPath } from '@/lib/secretReview'
import { kstInputToUtc, positiveId, scanDate } from '@/lib/secretScan'
import { useSecretReadRefresh } from '@/lib/useSecretReadRefresh'
import './secret-review.css'
import './secret-governance.css'
import './secret-scan.css'

const decisionEffect: Record<ReviewDecision, string> = { ABNORMAL: '이 위치의 노출을 확인하고, 같은 출처의 현재 대응 건을 만들거나 연결해요.', NORMAL: '이 위치의 승인된 보관 근거를 기록해요. 다른 위치를 정상으로 바꾸지 않아요.', FALSE_POSITIVE: '선택한 탐지 근거를 교정해요. 키 전체를 무효·정상으로 바꾸지 않아요.', NEEDS_MORE_INFO: '판단을 미확인으로 유지하고 담당자와 기한이 있는 조사 과제를 남겨요.' }

function reviewCasePath(context: ReviewContext, caseId: number, params: URLSearchParams, changed = false) {
  const next = new URLSearchParams({ origin: context.caseLinkData?.caseOrigin ?? context.origin, occurrence: String(context.occurrenceId) })
  if (params.has('returnQuery')) {
    const back = new URLSearchParams(reviewReturnPath(params, context.credentialSetId, context.occurrenceId, context.origin).split('?')[1] ?? '')
    if (changed) back.delete('snapshotId')
    next.set('return', 'workbench'); next.set('returnQuery', back.toString())
  }
  return `/secrets/cases/${caseId}?${next}`
}

function ReviewForm({ context, reload, onSaved }: { context: ReviewContext; reload: () => void; onSaved: (result: ReviewResult) => void }) {
  const [params] = useSearchParams()
  const [decision, setDecision] = useState<ReviewDecision | ''>('')
  const [reason, setReason] = useState(''), [finding, setFinding] = useState(''), [evidence, setEvidence] = useState('')
  const [missing, setMissing] = useState(''), [owner, setOwner] = useState(''), [due, setDue] = useState('')
  const [confirm, setConfirm] = useState(false), [stale, setStale] = useState(false)
  const requestKey = useRef({ payload: '', key: '' }), repairKey = useRef({ payload: '', key: '' })
  const navigate = useNavigate(), refresh = useSecretReadRefresh()
  const onSuccess = (result: ReviewResult) => {
    onSaved(result)
    refresh()
    if (result.caseId) navigate(reviewCasePath(context, result.caseId, params, true))
    else if (result.investigationTaskId) navigate(`/secrets/triage/investigations/${result.investigationTaskId}`)
    else { setDecision(''); setConfirm(false); reload() }
  }
  const onError = (error: Error) => { if (error instanceof ApiError && error.status === 409) { setStale(true); setConfirm(false) } }
  const submit = useMutation({ mutationFn: () => {
    if (!decision) throw new Error('NO_DECISION')
    const request = { decision, reasonCode: reason, findingId: positiveId(finding), evidenceRefs: [evidence], expectedOccurrenceVersion: context.versions.occurrence, expectedScopeVersion: context.versions.scope, expectedPolicyVersion: context.versions.policy ?? null,
      ...(decision === 'NEEDS_MORE_INFO' ? { missingReasonCode: missing, followUpOwnerUserId: positiveId(owner)!, dueAt: kstInputToUtc(due), evidenceRef: evidence } : {}),
    }
    return decideSecretOccurrence(context.occurrenceId, { ...request, idempotencyKey: idempotencyFor(requestKey, request) })
  }, onSuccess, onError })
  const repair = useMutation({ mutationFn: () => {
    if (!context.caseLinkData?.decisionId || context.caseLinkData.decisionVersion == null) throw new Error('NO_VALID_DECISION')
    const request = { decisionId: context.caseLinkData.decisionId, expectedDecisionVersion: context.caseLinkData.decisionVersion, expectedOccurrenceVersion: context.versions.occurrence, expectedScopeVersion: context.versions.scope }
    return repairSecretCaseLink(context.occurrenceId, { ...request, idempotencyKey: idempotencyFor(repairKey, request) })
  }, onSuccess, onError })
  const choices = allowedReviewDecisions(context)
  const reasons = decision ? context.allowedReasonCodes?.[decision] ?? [] : []
  const ready = reviewInputErrors(context, { decision, reasonCode: reason, findingId: positiveId(finding), evidenceRef: evidence, missingReasonCode: missing, followUpOwnerUserId: positiveId(owner), dueAt: due ? kstInputToUtc(due) : null }).length === 0 && confirm && !stale
  const busy = submit.isPending || repair.isPending
  const form = <>
    {stale && <p className="notice error" role="alert">판정 근거가 바뀌었어요.<button className="btn outline" onClick={reload}>현재 근거 다시 확인</button></p>}
    {(submit.isError || repair.isError) && <p className="notice error" role="alert">{safeMutationMessage(submit.error ?? repair.error)}</p>}
    {!currentReviewVersions(context) ? <section className="card secret-scan-message" role="alert">현재 범위·정책 버전을 확인하지 못해 결정을 저장할 수 없어요. <button className="btn outline" onClick={reload}>근거 다시 조회</button></section> : context.caseLinkData?.canRepair && context.exposureStatus === 'ABNORMAL' ? <section className="card secret-governance-form"><h2>확인된 노출을 대응 건에 연결</h2><p>이미 기록된 노출 판정을 유지해요. 같은 판단을 다시 승인하지 않아요.</p><label className="secret-check-label"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> 현재 위치·출처와 기존 판정 근거를 확인했어요.</label><button className="btn primary" disabled={!confirm || stale || busy || !context.caseLinkData.decisionId || context.caseLinkData.decisionVersion == null} onClick={() => repair.mutate()}>{repair.isPending ? '연결 중…' : '현재 대응 건에 연결'}</button></section> : !choices.length ? <section className="card secret-scan-section"><h2>현재 가능한 작업</h2><p>이 근거와 권한으로 새 결정을 저장할 수 없어요.</p>{context.caseLinkData?.caseId && <Link className="btn outline" to={reviewCasePath(context, context.caseLinkData.caseId, params)}>현재 대응 건 확인</Link>}<Link className="btn outline" to={`/secrets/connections/${context.connectionId}/scopes/${context.scopeId}`}>출처·보관 정책 확인</Link></section> : <section className="card secret-governance-form" aria-labelledby="review-decision-title"><h2 id="review-decision-title">이 위치의 다음 작업</h2>
      <form onSubmit={(e) => { e.preventDefault(); if (ready) submit.mutate() }}>
        <label>결정<select className="select" value={decision} disabled={busy || stale} onChange={(e) => { setDecision(e.target.value as ReviewDecision | ''); setReason(''); setConfirm(false); submit.reset() }}><option value="">가능한 결정 선택</option>{choices.map((choice) => <option key={choice} value={choice}>{reviewDecisionLabel[choice]}</option>)}</select></label>
        {decision && <p className="secret-review-effect">{decisionEffect[decision]}</p>}
        {decision && <>
          <label>적용할 탐지 근거{decision === 'NEEDS_MORE_INFO' ? ' (선택)' : ''}<select className="select" value={finding} disabled={busy || stale} onChange={(e) => { setFinding(e.target.value); setConfirm(false) }}><option value="">탐지 근거 선택</option>{context.findings?.filter((entry) => entry.valid).map((entry) => <option key={entry.findingId} value={entry.findingId}>탐지 #{entry.findingId} · {entry.ruleId} · {scanDate(entry.detectedAt)}</option>)}</select></label>
          <label>결정 사유<select className="select" value={reason} disabled={busy || stale} onChange={(e) => { setReason(e.target.value); setConfirm(false) }}><option value="">근거에 맞는 사유 선택</option>{reasons.map((code) => <option key={code} value={code}>{reviewReasonLabel(code)}</option>)}</select></label>
          <label>근거 참조<input className="input" value={evidence} maxLength={80} autoComplete="off" disabled={busy || stale} placeholder="TICKET:SEC-123" onChange={(e) => { setEvidence(e.target.value); setConfirm(false) }} /><small>티켓·변경·정책 참조만 입력하세요. 키나 원천 경로는 입력하지 마세요.</small></label>
          {decision === 'NEEDS_MORE_INFO' && <>
            <label>부족한 근거<select className="select" value={missing} disabled={busy || stale} onChange={(e) => { setMissing(e.target.value); setConfirm(false) }}><option value="">확인할 근거 선택</option>{context.allowedMissingReasonCodes?.map((code) => <option key={code} value={code}>{missingEvidenceLabel(code)}</option>)}</select></label>
            <label>조사 담당자<select className="select" value={owner} disabled={busy || stale} onChange={(e) => { setOwner(e.target.value); setConfirm(false) }}><option value="">적격 담당자 선택</option>{context.eligibleInvestigationAssignees?.map((person) => <option key={person.userId} value={person.userId}>{person.displayName}</option>)}</select></label>
            <label>확인 기한 (KST·향후 90일 이내)<input className="input" type="datetime-local" value={due} disabled={busy || stale} onChange={(e) => { setDue(e.target.value); setConfirm(false) }} /></label>
            {!context.eligibleInvestigationAssignees?.length && <p className="notice">적격 조사 담당자가 없어요. 이 범위의 담당 권한 설정을 먼저 확인해 주세요.</p>}
          </>}
          <section className="secret-review-confirmation" aria-label="저장할 결정 요약"><strong>{context.safeLocationLabel || `위치 #${context.occurrenceId}`}</strong><p>{reviewDecisionLabel[decision]} · {reason ? reviewReasonLabel(reason) : '사유 선택 필요'}</p><label className="secret-check-label"><input type="checkbox" checked={confirm} disabled={busy || stale} onChange={(e) => setConfirm(e.target.checked)} /> 이 위치의 현재 근거와 저장 결과를 확인했어요.</label></section>
        </>}
        <button className="btn primary" disabled={!ready || busy}>{submit.isPending ? '저장 중…' : decision ? reviewDecisionLabel[decision] : '결정 저장'}</button>
      </form>
    </section>}
  </>
  return hasCurrentCase(context) ? <details className="card secret-scan-technical"><summary>{context.storagePolicy?.requiresReassessment ? '판정 근거 재확인·변경' : '판정 변경'}</summary>{form}</details> : form
}

function hasCurrentCase(context: ReviewContext) { return !!context.caseLinkData?.caseId && context.caseLinkData.caseLinkStatus === 'LINKED' && !context.caseLinkData.canRepair }
function CurrentCaseAction({ context }: { context: ReviewContext }) {
  const [params] = useSearchParams()
  if (!hasCurrentCase(context)) return null
  return <section className="card secret-review-current-case"><div><h2>현재 대응에서 조치하세요</h2><p>{context.storagePolicy?.requiresReassessment ? '기존 노출 판정과 현재 대응이 있어요. 최신 근거 재확인은 별도로 진행하고, 담당자 지정과 조치는 현재 대응에서 이어가세요.' : '이미 노출이 확인되어 대응 중이에요. 새 판정 없이 현재 대응에서 조치하세요.'}</p></div><div className="row"><Link className="btn primary" to={reviewCasePath(context, context.caseLinkData.caseId!, params)}>현재 대응 건에서 이 위치 조치</Link><Link className="btn outline" to={`/secrets/${context.credentialSetId}?${new URLSearchParams({ origin: context.origin, occurrence: String(context.occurrenceId), locationPanel: 'closed' })}`}>키·발견 위치</Link></div></section>
}

function ReviewEvidence({ context }: { context: ReviewContext }) {
  return <>
    <section className="card secret-scan-section"><div className="row between"><h2>{context.safeLocationLabel || `위치 #${context.occurrenceId}`}</h2><Badge label={inventoryOptions.origin[context.origin] ?? '미분류'} /></div><SecretSourceCoordinates location={context} /><p className="caption">{issuerLabel[context.issuer] ?? '발급자 미확인'} · {credentialTypeLabel(context.credentialType)} · 승인 범위 #{context.scopeId} v{context.scopeRevision ?? '미기록'}</p>
      <dl className="secret-review-facts"><div><dt>구성</dt><dd>{componentStateLabel[context.componentState]}</dd></div><div><dt>마지막 위치 검사</dt><dd>{presenceLabels[context.presence] ?? '현재 확인 불가'}</dd></div><div><dt>노출 판단</dt><dd>{exposureLabels[context.exposureStatus] ?? '노출 미확인'}</dd></div><div><dt>보관 정책</dt><dd>{context.storagePolicy?.result === 'ALLOWED' ? '명시적 허용 근거 있음' : context.storagePolicy?.result === 'DENIED' ? '명시적 금지 근거 있음' : '정책 적용 확인 필요'}</dd></div><div><dt>유효성</dt><dd>{secretValidationLabel(context.validity?.result ?? 'UNKNOWN')}</dd><small>{secretValidationReasonLabel(context.validity?.reasonCode ?? 'NO_VERIFICATION_ATTEMPT')}</small></div><div><dt>최근 검증 시도</dt><dd>{scanDate(context.validity?.observedAt)}</dd></div></dl>
      {context.storagePolicy?.requiresReassessment && <p className="notice">보관 정책 근거가 달라져 재확인이 필요해요. 과거 판정을 현재 사실로 재사용하지 않아요.</p>}
      {Object.keys(context.decisionUnavailableReasons ?? {}).length > 0 && <div className="notice"><strong>현재 확인할 처리 조건</strong><ul>{Object.entries(context.decisionUnavailableReasons ?? {}).filter(([decision]) => Object.hasOwn(reviewDecisionLabel, decision)).map(([decision, code]) => <li key={decision}>{reviewDecisionLabel[decision as ReviewDecision]} · {decisionUnavailableLabel(code)}</li>)}</ul></div>}
      {context.origin === 'UNCLASSIFIED' && <p className="notice">출처가 미분류 상태예요. 연결의 출처 승인을 확인하세요. 근거 보완 조사는 별도로 남길 수 있어요.</p>}
      {context.origin === 'TEST' && <p className="notice">시험 출처예요. 합성 키 증빙이 없으면 실제 키 가능성을 별도로 조사해야 해요. <Link to={`/secrets/${context.credentialSetId}/fixture-attestations`}>합성 표본 근거</Link></p>}
      <div className="row"><Link className="btn outline" to={`/secrets/${context.credentialSetId}?origin=${context.origin}&occurrence=${context.occurrenceId}`}>같은 키의 다른 위치</Link><Link className="btn outline" to={`/secrets/connections/${context.connectionId}/scopes/${context.scopeId}`}>출처·보관 정책</Link></div>
    </section>
    {context.corrections?.length ? <details className="card secret-scan-technical"><summary>오탐 교정 근거·적용 기간</summary><ul className="secret-investigation-history">{context.corrections.map((correction) => <li key={correction.correctionId}><strong>탐지 #{correction.findingId} · {correction.currentlyApplicable ? '현재 적용 중' : '과거 교정 근거'}</strong><span>{correction.source === 'EXACT_EVIDENCE_REUSE' ? '동일한 원천·룰·증거의 교정을 재사용했어요.' : '보안 담당자의 오탐 교정이에요.'}</span><span>유효 기한 {correction.expiresAt ? scanDate(correction.expiresAt) : '미기록'}</span>{!correction.currentlyApplicable && <span>{correctionRecheckLabel(correction.recheckReason)}</span>}</li>)}</ul></details> : null}
    <details className="card secret-scan-technical"><summary>탐지 룰·버전과 근거 시각</summary><p className="caption">형식 일치는 저장 위치의 노출·악용·관리자 권한을 증명하지 않아요.</p>{context.findings?.length ? <ul className="secret-investigation-history">{context.findings.map((entry) => <li key={entry.findingId}><strong>탐지 #{entry.findingId} · {entry.ruleId}</strong><span>룰 버전 {entry.ruleVersion ?? '미기록'} · {scanDate(entry.detectedAt)} · {entry.valid ? '현재 유효 근거' : '현재 적용되지 않는 근거'}</span></li>)}</ul> : <p className="caption">판정에 사용할 탐지 근거가 없어요.</p>}</details>
  </>
}

export function SecretTriagePage() {
  const { secretId: rawSecret } = useParams(), secretId = positiveId(rawSecret)
  const [params] = useSearchParams(), occurrenceId = positiveId(params.get('occurrence'))
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [receipt, setReceipt] = useState<{ credentialSetId: number; occurrenceId: number; result: ReviewResult } | null>(null)
  const requestedOrigin = params.get('origin') === 'TEST' || new URLSearchParams(params.get('returnQuery') ?? '').get('origin') === 'TEST' ? 'TEST' : 'PRODUCTION'
  const title = useRef<HTMLHeadingElement>(null)
  const context = useQuery({ queryKey: ['secret-review-context', occurrenceId], queryFn: () => fetchReviewContext(occurrenceId!), enabled: secretId != null && occurrenceId != null, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false })
  const valid = context.isSuccess && matchingReviewContext(context.data, secretId, occurrenceId) ? context.data : null
  const reload = () => { void context.refetch().then(() => setRefreshVersion((version) => version + 1)) }
  useEffect(() => { title.current?.focus(); window.scrollTo({ top: 0 }) }, [secretId, occurrenceId])
  return <>
    <Link className="secret-scan-back" to={reviewReturnPath(params, secretId, occurrenceId, valid?.origin ?? requestedOrigin)}>← 확인 대기열로 돌아가기</Link>
    <section className="page-head"><div><h1 ref={title} tabIndex={-1}>{valid?.maskedLabel || '위치 근거 확인'}</h1><p className="subtitle">확인된 사실과 부족한 근거를 구분해 판단하세요.</p></div><button className="btn outline" disabled={!occurrenceId || context.isFetching} onClick={reload}>현재 근거 다시 조회</button></section>
    {receipt?.credentialSetId === secretId && receipt?.occurrenceId === occurrenceId && <section className="card secret-scan-section" role="status"><h2>이 위치의 결정을 저장했어요</h2><p>{receipt.result.correctionId ? '선택한 탐지 근거를 오탐으로 교정했어요. 다른 위치의 판정은 유지돼요.' : receipt.result.exposureStatus === 'NORMAL' ? '이 위치의 승인된 보관 근거를 저장했어요. 키의 유효성과 다른 위치의 조치는 별도예요.' : '현재 근거와 다음 작업을 확인해 주세요.'}</p></section>}
    {!secretId || !occurrenceId ? <div className="card secret-scan-message" role="alert"><h2>확인할 위치를 선택해 주세요</h2><p>키와 발견 위치가 모두 지정돼야 판단 근거를 확인할 수 있어요.</p>{secretId && <Link className="btn outline" to={`/secrets/${secretId}?${new URLSearchParams({ origin: requestedOrigin, ...(params.has('returnQuery') ? { return: 'workbench', returnQuery: params.get('returnQuery')! } : {}) })}`}>키 상세에서 위치 선택</Link>}</div> : context.isPending ? <p className="card secret-scan-message" role="status">위치·범위·정책 근거를 불러오는 중이에요.</p> : context.isError ? <div className="card secret-scan-message" role="alert"><h2>{context.error instanceof ApiError && context.error.status === 403 ? '위치 근거를 볼 권한이 없어요' : context.error instanceof ApiError && context.error.status === 404 ? '위치 근거를 찾을 수 없어요' : '위치 근거를 불러오지 못했어요'}</h2><p>확인 대기열로 돌아가거나 다시 조회해 주세요. 빈 값을 근거로 판정하지 않아요.</p>{!(context.error instanceof ApiError && [403, 404].includes(context.error.status)) && <button className="btn outline" onClick={reload}>다시 조회</button>}</div> : !valid ? <div className="card secret-scan-message" role="alert"><h2>선택한 키·위치·승인 범위가 일치하지 않아요</h2><p>잘못 연결된 주소일 수 있어요. 이 상태에서는 변경할 수 없어요.</p></div> : <><CurrentCaseAction context={valid} />{!hasCurrentCase(valid) && <SecretTaskGuidance guidance={valid.taskGuidance} />}<ReviewEvidence context={valid} /><ReviewForm key={`${valid.occurrenceId}:${valid.versions?.occurrence}:${valid.versions?.scope}:${valid.versions?.policy}:${refreshVersion}`} context={valid} reload={reload} onSaved={(result) => setReceipt({ credentialSetId: valid.credentialSetId, occurrenceId: valid.occurrenceId, result })} />{valid.canRequestAssistance && <SecretHandoffForm key={`request:${valid.occurrenceId}:${valid.versions.occurrence}`} targetType="OCCURRENCE" targetId={valid.occurrenceId} expectedVersion={valid.versions.occurrence} />}</>}
  </>
}
