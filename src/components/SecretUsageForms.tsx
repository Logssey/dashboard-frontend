import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { KeyLocation } from '@/api/secrets'
import type { SecretUsage, UsageObservation, UsageRequest } from '@/api/secretUsage'
import { decideUsageObservation, requestSecretUsage, submitUsageObservation } from '@/api/secretUsage'
import { idempotencyFor, safeMutationMessage } from '@/lib/secretEvidence'
import { riskInputUtc } from '@/lib/secretRiskForms'
import { kstInput } from '@/lib/secretScan'
import { manualUsagePayload, usageActions, usageActors, usageDecisionReasons, usageDecisions, usageRefKey, usageRefLabel, usageResults, validUsageWindow } from '@/lib/secretUsage'

interface Props { context: SecretUsage; disabled: boolean; onUpdated: (notice: string) => void; onStale: () => void }
const freshWindow = (days: number) => ({ from: kstInput(new Date(Math.ceil((Date.now() - days * 86400000) / 60000) * 60000).toISOString()), until: kstInput(new Date().toISOString()) })

export function SecretUsageRequestForm({ context, disabled, onRequested, onStale }: Omit<Props, 'onUpdated'> & { onRequested: (request: UsageRequest) => void }) {
  const [target, setTarget] = useState(''), [period, setPeriod] = useState(() => freshWindow(7))
  const key = useRef({ payload: '', key: '' })
  const selectedTarget = context.targetOptions.find((item) => String(item.targetId) === target)
  const windowStart = riskInputUtc(period.from), windowEnd = riskInputUtc(period.until)
  const ready = context.capabilities.canRequest && !!selectedTarget && validUsageWindow(windowStart, windowEnd)
  const request = useMutation({ mutationFn: () => {
    const body = { occurrenceId: context.occurrenceId, serverRegisteredTargetId: selectedTarget!.targetId, windowStart: windowStart!, windowEnd: windowEnd!, expectedCredentialRevision: context.credentialRevision, expectedScopeRevision: context.scopeRevision }
    return requestSecretUsage(context.credentialId, { ...body, idempotencyKey: idempotencyFor(key, body) })
  }, onSuccess: onRequested, onError: () => onStale() })
  return <form className="secret-usage-form" aria-label="AWS 사용 이력 조회 요청" onSubmit={(event) => { event.preventDefault(); if (ready && !disabled && !request.isPending) request.mutate() }}>
    <h3>AWS 관리 이벤트 조회</h3><p className="caption">승인된 계정·리전에서 이 키에 연결된 관리 이벤트를 조회해요. 기본 7일이며 최근 90일 안에서 선택하세요.</p>
    <label>승인된 조회 대상<select className="select" value={target} disabled={disabled || request.isPending} onChange={(event) => setTarget(event.target.value)}><option value="">조회 대상 선택</option>{context.targetOptions.map((item) => <option key={item.targetId} value={item.targetId}>{item.displayName}</option>)}</select></label>
    {selectedTarget && <p className="caption">조회 범위 {selectedTarget.accountRef} · {selectedTarget.region}</p>}
    <div className="row" aria-label="조회 기간 빠른 선택">{[7, 30, 90].map((days) => <button key={days} type="button" className="btn outline" disabled={disabled || request.isPending} onClick={() => setPeriod(freshWindow(days))}>최근 {days}일</button>)}</div>
    <div className="secret-usage-form-grid"><label>조회 시작 (KST)<input className="input" type="datetime-local" value={period.from} required disabled={disabled || request.isPending} onChange={(event) => setPeriod((current) => ({ ...current, from: event.target.value }))} /></label><label>조회 종료 (KST)<input className="input" type="datetime-local" value={period.until} required disabled={disabled || request.isPending} onChange={(event) => setPeriod((current) => ({ ...current, until: event.target.value }))} /></label></div>
    {!validUsageWindow(windowStart, windowEnd) && <p role="alert" className="notice">시작보다 뒤인 종료 시각을 최근 90일 안에서 선택하세요. 미래 기간은 조회할 수 없어요.</p>}
    {!context.targetOptions.length && <p className="notice">현재 선택할 수 있는 승인된 조회 대상이 없어요. 운영 담당자에게 계정·리전과 조회 연결 등록을 요청하세요.</p>}
    <p className="caption">S3 객체 읽기 같은 데이터 이벤트는 확인 범위 밖이에요. 결과의 0건·부분 조회와 키 연결 수준을 함께 확인하세요.</p>
    <button className="btn primary" disabled={!ready || disabled || request.isPending}>{request.isPending ? '조회 요청 중…' : '사용 이력 조회 요청'}</button>
    {request.isError && <p className="notice error" role="alert">{safeMutationMessage(request.error)}</p>}
  </form>
}

export function SecretUsageMaterialForm({ context, disabled, onUpdated, onStale, location }: Props & { location?: KeyLocation }) {
  const [input, setInput] = useState({ source: '', target: '', from: '', until: '', eventAt: '', action: '', result: '', actor: '' })
  const key = useRef({ payload: '', key: '' })
  const change = (name: keyof typeof input, value: string) => setInput((current) => ({ ...current, [name]: value }))
  const body = manualUsagePayload(context, input)
  const save = useMutation({ mutationFn: () => {
    const current = manualUsagePayload(context, input)
    if (!current) throw new Error('USAGE_MATERIAL_INCOMPLETE')
    return submitUsageObservation(context.credentialId, { ...current, idempotencyKey: idempotencyFor(key, current) })
  }, onSuccess: () => onUpdated('사용 자료를 제출했어요. 보안 담당자의 검토 상태와 키 연결 수준을 확인하세요.'), onError: onStale })
  const blocked = disabled || save.isPending
  if (!context.capabilities.canSubmit) return <p className="notice">이 위치의 보안 담당자 또는 할당된 조치 담당자에게 사용 자료 제출을 요청하세요.</p>
  if (!context.availableSourceRefs.length || !context.availableTargetRefs.length) return <div className="notice"><p>연결할 조사·조치 기록과 승인된 대상이 먼저 필요해요. 기존 조사 또는 조치 화면에서 자료를 등록한 뒤 현재 조건을 다시 조회하세요.</p><div className="row">{location?.capabilities.canViewCase && location.caseId && <Link className="btn outline" to={`/secrets/cases/${location.caseId}?origin=${location.origin}&occurrence=${location.occurrenceId}`}>현재 대응에서 자료 등록</Link>}{location?.capabilities.canReview && <Link className="btn outline" to={`/secrets/triage/${context.credentialId}?origin=${location.origin}&occurrence=${location.occurrenceId}`}>현재 위치의 조사·근거 확인</Link>}{!location?.capabilities.canReview && !(location?.capabilities.canViewCase && location.caseId) && <p className="caption">이 위치의 보안 담당자에게 연결할 조사·조치 자료 등록을 요청하세요.</p>}</div></div>
  return <form className="secret-usage-form" aria-label="사용 자료 제출" onSubmit={(event) => { event.preventDefault(); if (body && !blocked) save.mutate() }}>
    <h3>확인한 사용 자료 제출</h3><p className="caption">등록된 조사·조치 기록을 연결하세요. 수용한 자료도 사용자·앱 수준인지 정확한 키의 기록인지 따로 표시해요.</p>
    <label>근거 기록<select className="select" value={input.source} disabled={blocked} onChange={(event) => change('source', event.target.value)}><option value="">등록된 자료 선택</option>{context.availableSourceRefs.map((ref) => <option key={usageRefKey(ref)} value={usageRefKey(ref)}>{usageRefLabel(ref)}</option>)}</select></label>
    <label>자료의 적용 대상<select className="select" value={input.target} disabled={blocked} onChange={(event) => change('target', event.target.value)}><option value="">승인된 대상 선택</option>{context.availableTargetRefs.map((ref) => <option key={usageRefKey(ref)} value={usageRefKey(ref)}>{usageRefLabel(ref)}</option>)}</select></label>
    <div className="secret-usage-form-grid">{[['from', '자료 기간 시작'], ['until', '자료 기간 종료'], ['eventAt', '행위 발생 시각']].map(([name, title]) => <label key={name}>{title} (KST)<input className="input" type="datetime-local" required value={input[name as keyof typeof input]} disabled={blocked} onChange={(event) => change(name as keyof typeof input, event.target.value)} /></label>)}</div>
    <p className="caption">최근 90일의 확인한 기간만 입력하세요. 행위 시각은 시작 이상·종료 미만에 포함돼야 해요.</p>
    <div className="secret-usage-form-grid">{([['action', '행위 종류', usageActions], ['result', '행위 결과', usageResults], ['actor', '업무 사용 분류', { UNATTRIBUTED: usageActors.UNATTRIBUTED, EXPECTED_WORKLOAD: usageActors.EXPECTED_WORKLOAD }]] as const).map(([name, title, choices]) => <label key={name}>{title}<select className="select" value={input[name]} disabled={blocked} onChange={(event) => change(name, event.target.value)}><option value="">자료에서 확인한 값 선택</option>{Object.entries(choices).map(([code, text]) => <option key={code} value={code}>{text}</option>)}</select></label>)}</div>
    <p className="caption">키 원문이나 로그 본문을 입력하는 칸은 없어요. 자체 검증 여부와 정확한 키 연결은 서버가 근거를 확인해 표시해요.</p>
    <button className="btn primary" disabled={!body || blocked}>{save.isPending ? '자료 제출 중…' : '사용 자료 제출'}</button>
    {!body && <p className="caption">등록 근거·대상, 기간·행위 시각, 행위·결과·분류를 확인하면 제출할 수 있어요.</p>}
    {save.isError && <p className="notice error" role="alert">{safeMutationMessage(save.error)}</p>}
  </form>
}

export function SecretUsageDecision({ observation, disabled, onUpdated, onStale }: { observation: UsageObservation; disabled: boolean; onUpdated: (notice: string) => void; onStale: () => void }) {
  const [decision, setDecision] = useState(''), [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false)
  const key = useRef({ payload: '', key: '' })
  const allowed = observation.allowedDecisions.filter((code) => Object.hasOwn(usageDecisions, code))
  const reasons = decision === 'ACCEPT' ? ['REVIEWED_USAGE'] : decision === 'WITHDRAW' ? ['WITHDRAWN_BY_REVIEWER'] : decision === 'REJECT' ? ['INSUFFICIENT_EVIDENCE', 'IDENTITY_MISMATCH'] : []
  const save = useMutation({ mutationFn: () => {
    const body = { decision, expectedObservationRevision: observation.observationRevision, reasonCode: reason }
    return decideUsageObservation(observation.observationId, { ...body, idempotencyKey: idempotencyFor(key, body) })
  }, onSuccess: () => onUpdated('사용 자료 검토를 기록했어요. 기록과 키 연결 수준을 다시 확인하세요.'), onError: onStale })
  if (observation.sourceKind !== 'MANUAL' || !allowed.length) return null
  return <form className="secret-usage-form" aria-label="사용 자료 검토" onSubmit={(event) => { event.preventDefault(); if (allowed.includes(decision) && reasons.includes(reason) && confirmed && !disabled && !save.isPending) save.mutate() }}><h3>보안 담당자 검토</h3>
    <label>검토 결과<select className="select" value={decision} onChange={(event) => { setDecision(event.target.value); setReason(''); setConfirmed(false) }} disabled={disabled || save.isPending}><option value="">검토 결과 선택</option>{allowed.map((code) => <option key={code} value={code}>{usageDecisions[code]}</option>)}</select></label>
    <label>검토 사유<select className="select" value={reason} onChange={(event) => setReason(event.target.value)} disabled={disabled || save.isPending}><option value="">사유 선택</option>{reasons.map((code) => <option key={code} value={code}>{usageDecisionReasons[code]}</option>)}</select></label>
    <label className="secret-check-label"><input type="checkbox" checked={confirmed} disabled={disabled || save.isPending} onChange={(event) => setConfirmed(event.target.checked)} /> 적용 기간·자료 출처·키 연결 근거를 검토했어요.</label>
    <button className="btn primary" disabled={disabled || save.isPending || !allowed.includes(decision) || !reasons.includes(reason) || !confirmed}>사용 자료 검토 저장</button>
    {save.isError && <p className="notice error" role="alert">{safeMutationMessage(save.error)}</p>}
  </form>
}
