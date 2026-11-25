import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { SecretHandoffForm } from './SecretHandoffForm'
import { SecretRiskApplicability } from './SecretRiskApplicability'
import { ApiError } from '@/api/client'
import { confirmPermissionObservation, fetchPermissionAssistance, fetchPermissionPreview, fetchPermissionRequest, rejectPermissionObservation, requestPermissionAssistance, type PermissionAssistance, type PermissionObservation, type PermissionPreview } from '@/api/secretPermissionAssistance'
import type { KeyLocation } from '@/api/secrets'
import { idempotencyFor, safeMutationMessage } from '@/lib/secretEvidence'
import { activePermissionRequest, completedPermissionRequest, currentPermissionPreview, observedPermissionOptions, partialPermissionConfirmationFacts, permissionConfirmationFacts, permissionCoverageLabels, permissionCoverageValues, permissionReason, permissionPrincipalLabel, permissionPrerequisites, permissionRejectLabels, permissionRequestStatus, permissionSourceRequirements, permissionTargetLabels, restorablePermissionDraft } from '@/lib/secretPermissionAssistance'
import { withSecretOrigin } from '@/lib/secretNavigation'
import { allowedRiskSources, riskInputUtc, riskOptionLabel, riskSourceKey, riskSourceLabel } from '@/lib/secretRiskForms'
import { scanDate } from '@/lib/secretScan'
import { useSecretReadRefresh } from '@/lib/useSecretReadRefresh'
import './secret-permission-assistance.css'

const localTime = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value) + 9 * 3600000).toISOString().slice(0, 16) : ''
const reviewDeadline = (expiresAt: string) => {
  const expiry = Date.parse(expiresAt)
  return Number.isFinite(expiry) ? localTime(new Date(Math.min(expiry, Date.now() + 24 * 60 * 60 * 1000)).toISOString()) : ''
}
type PermissionLocation = Pick<KeyLocation, 'occurrenceId' | 'connectionId' | 'scopeId' | 'origin' | 'fixtureStatus' | 'safeLocationLabel' | 'capabilities'>
export function PermissionPrerequisites({ context, collector, onCollector, disabled, location: requestedLocation, onValidate }: { context: PermissionAssistance; collector: string; onCollector: (value: string) => void; disabled: boolean; location?: PermissionLocation; onValidate?: () => void }) {
  const location = requestedLocation?.occurrenceId === context.occurrenceId ? requestedLocation : undefined
  const ready = permissionPrerequisites(context, collector, location?.fixtureStatus === 'VERIFIED_SYNTHETIC')
  const aws = context.identity.provider === 'AWS'
  const github = context.identity.provider === 'GITHUB'
  const selected = context.collectorOptions.find((option) => String(option.connectionId) === collector)
  return <div className="secret-permission-prerequisites">
    {ready.isSynthetic ? <p className="notice">승인된 합성 표본이에요. 실제 공급자 인증·권한 조회를 실행하지 않으며, 공급자 인증·권한 근거는 별도로 확인해요.</p> : null}
    {location && <p className="caption">현재 확인할 위치: {location.safeLocationLabel}</p>}
    <ol aria-label="권한 확인 순서">
      <li><div className="secret-permission-step-title"><strong>현재 키의 유효성 확인</strong><span>{ready.isSynthetic ? '공급자 호출 안 함' : ready.identityReady ? '확인됨' : '먼저 확인'}</span></div><p>{ready.identityReady ? '최근 인증 결과의 주체와 이 키가 연결되어 있어요. 유효성은 접근 가능한 전체 권한을 증명하지 않아요.' : aws ? '선택한 발견 위치에서 현재 키로 인증 가능한지 확인하고 주체를 연결해요. 완전한 키 쌍이 필요하며 임시 키는 세션 토큰도 필요해요.' : '선택한 발견 위치에서 현재 토큰으로 인증 가능한지 확인하고 주체를 연결해요. 공급자 인증과 저장소 접근 범위는 구분해요.'}</p>
        {!ready.isSynthetic && ready.supported && !ready.identityReady && (onValidate ? <button type="button" className="btn outline" onClick={onValidate}>키 유효성 확인으로 이동</button> : <p className="caption">키 상세의 ‘키 유효성’에서 현재 발견 위치를 선택해 확인하세요.</p>)}
        {!ready.isSynthetic && !ready.identityReady && location?.capabilities.canViewCoverage && <Link className="secret-permission-detail-link" to={withSecretOrigin(`/secrets/connections/${location.connectionId}/scopes/${location.scopeId}?settings=validation`, location.origin)}>이 위치의 검증 허용·설정 확인</Link>}
      </li>
      <li><div className="secret-permission-step-title"><strong>{aws ? '승인된 IAM 읽기 연결 선택' : github ? 'GitHub 토큰의 제공 정보 확인' : '지원하는 권한 조회 범위 확인'}</strong><span>{ready.isSynthetic ? '조회 안 함' : aws ? ready.collectorWaiting ? '유효성 확인 후 판별' : ready.collectorReady ? '선택됨' : '연결 필요' : github ? '최근 인증 정보 사용' : '자동 조회 미지원'}</span></div><p>{aws ? '인증한 키와 같은 AWS 계정의 승인된 연결로 IAM 정책만 읽어요. 읽기 승인은 실제 키의 권한이 모두 확인됐다는 뜻이 아니에요.' : github ? '최근 유효성 확인에서 공급자가 제공한 토큰 정보만 사용해요. 저장소별 실제 접근 권한과 제한은 추가로 확인해야 해요.' : '이 발급자는 자동 권한 조회를 지원하지 않아요. 조사에서 직접 확인한 자료를 기록하세요.'}</p>
        {aws && !ready.isSynthetic && <>{context.collectorOptions.length > 0 ? <label className="secret-permission-collector">조회에 사용할 연결<select className="select" value={collector} disabled={disabled} onChange={(event) => onCollector(event.target.value)}><option value="">승인된 조회 연결 선택</option>{context.collectorOptions.map((option) => <option key={option.connectionId} value={option.connectionId}>{option.displayName}</option>)}</select></label> : <p className="caption">{ready.collectorWaiting ? '현재 키의 주체를 먼저 확인하면 같은 AWS 계정의 승인된 조회 연결을 찾을 수 있어요.' : '현재 선택할 수 있는 승인된 IAM 읽기 연결이 없어요. 보안 담당자에게 같은 계정의 연결과 IAM 정책 읽기 승인을 요청하세요.'}</p>}
          <Link className="secret-permission-detail-link" to={withSecretOrigin(selected ? `/secrets/connections/${selected.connectionId}/scopes` : '/secrets/connections', location?.origin)}>{selected ? '선택한 연결의 승인 범위 확인' : '연결 관리에서 승인 범위 확인'}</Link>
        </>}
      </li>
      <li><div className="secret-permission-step-title"><strong>조회 후 사람이 확인한 내용 저장</strong><span>직접 검토 필요</span></div><p>조회한 권한·대상·제한을 검토하고 자산 분류와 조사 기록을 연결하세요. 확인되지 않은 항목은 미확인으로 남기며, 저장한 검토와 현재 심각도 판단을 구분해요.</p></li>
    </ol>
  </div>
}
function PermissionObservedFacts({ observation }: { observation: PermissionObservation }) {
  const options = observedPermissionOptions(observation)
  return <section className="secret-permission-observed" aria-label="공급자 조회 자료"><div className="secret-permission-observed-title"><h4>조회한 권한 자료</h4><span>{observation.status === 'COMPLETE' ? '조회 완료' : observation.status === 'PARTIAL' ? '일부만 확인' : '조회 미지원'}</span></div>{observation.sourceBasis && <p className="secret-permission-source">{observation.sourceBasis === 'RECENT_VALIDATION_METADATA' ? '최근 유효성 확인에서 수집한 토큰 정보' : observation.sourceBasis === 'APPROVED_IAM_POLICY_METADATA' ? '승인된 읽기 연결의 IAM 정책 정보 조회 결과' : '공급자 자료의 확인 범위 검토 필요'}</p>}<p className="caption">정책에 포함된 권한 기능 후보예요. 실제 접근 허용과 수용된 심각도 근거는 별도로 확인해요.</p>
    {options.length ? <ul className="secret-permission-capabilities">{options.map((code) => <li key={code}>{riskOptionLabel(code)}</li>)}</ul> : <p className="caption">확정할 수 있는 권한 기능이 없어요. 권한이 없다는 뜻은 아니에요.</p>}
    <dl className="secret-permission-coverage">{Object.entries(permissionCoverageLabels).map(([field, label]) => <div key={field}><dt>{label}</dt><dd>{permissionCoverageValues[observation.coverage[field as keyof typeof observation.coverage]] ?? '미확인'}</dd></div>)}</dl><p className="caption">자료 관측 {scanDate(observation.observedAt)} · 자료 기한 {scanDate(observation.expiresAt)}</p>{observation.reasonCodes.length > 0 && <ul className="secret-safe-reasons">{[...new Set(observation.reasonCodes.map(permissionReason))].map((reason) => <li key={reason}>{reason}</li>)}</ul>}
  </section>
}
function PermissionSupplementActions({ occurrenceId, preview, onSupplement, onValidate }: { occurrenceId: number; preview: PermissionPreview; onSupplement?: (type: 'ASSET_CLASSIFICATION' | 'PERMISSION_MAPPING') => void; onValidate?: () => void }) {
  const missing = permissionSourceRequirements(allowedRiskSources(preview.availableSourceRefs)), help = preview.supplementation
  const taskId = help?.investigationTaskId
  return <div className="secret-permission-supplement">{missing.includes('현재 키의 주체 연결') && onValidate && <button type="button" className="btn outline" onClick={onValidate}>현재 위치의 키 유효성 확인</button>}{onSupplement && <button type="button" className="btn outline" onClick={() => onSupplement(missing.includes('수용된 자산 분류') ? 'ASSET_CLASSIFICATION' : 'PERMISSION_MAPPING')}>{missing.includes('수용된 자산 분류') ? '자산 분류 보완' : '권한 근거 보완'}</button>}
    {taskId && Number.isSafeInteger(taskId) && taskId > 0 ? <Link className="btn outline" to={`/secrets/triage/investigations/${taskId}`}>현재 위치 조사에서 자료 보완</Link> : help?.canRequestInvestigation && Number.isSafeInteger(help.occurrenceVersion) && help.occurrenceVersion >= 0 ? <SecretHandoffForm targetType="OCCURRENCE" targetId={occurrenceId} expectedVersion={help.occurrenceVersion} /> : null}
  </div>
}
export function PermissionReviewForm({ occurrenceId, preview, evidenceRevision, disabled = false, onUpdated, onStale, onSupplement, onValidate }: { occurrenceId: number; preview: PermissionPreview; evidenceRevision: number; disabled?: boolean; onUpdated: (message: string) => void; onStale: () => void; onSupplement?: (type: 'ASSET_CLASSIFICATION' | 'PERMISSION_MAPPING') => void; onValidate?: () => void }) {
  const restored = restorablePermissionDraft(preview)
  const [capability, setCapability] = useState(() => restored && observedPermissionOptions(preview).includes(restored.facts.capability) ? restored.facts.capability : observedPermissionOptions(preview).length === 1 ? observedPermissionOptions(preview)[0] : '')
  const [targetScope, setTargetScope] = useState(() => restored && Object.hasOwn(permissionTargetLabels, restored.facts.targetScope) ? restored.facts.targetScope : '')
  const [coverage, setCoverage] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(preview.coverage).map(([field, value]) => [field, restored && Object.hasOwn(permissionCoverageValues, restored.facts[field as keyof typeof preview.coverage]) ? restored.facts[field as keyof typeof preview.coverage] : value])))
  const [selectedSourceKeys, setSelectedSourceKeys] = useState<string[]>(() => {
    const available = new Set(allowedRiskSources(preview.availableSourceRefs).map(riskSourceKey))
    return restored?.sourceRefs.map(riskSourceKey).filter((key) => available.has(key)) ?? []
  })
  const [until, setUntil] = useState(() => restored ? localTime(restored.validUntil) : reviewDeadline(preview.expiresAt))
  const [attested, setAttested] = useState(false)
  const [attestedAt, setAttestedAt] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [applicableFrom, setApplicableFrom] = useState(() => localTime(restored?.applicableFrom ?? preview.sourcePresenceObservedAt ?? preview.observedAt))
  const [applicableUntil, setApplicableUntil] = useState(() => restored?.applicableUntil ? localTime(restored.applicableUntil) : reviewDeadline(preview.expiresAt))
  const clearAttestation = () => { setAttested(false); setAttestedAt(null) }
  const key = useRef({ payload: '', key: '' }), rejectKey = useRef({ payload: '', key: '' }), partialKey = useRef({ payload: '', key: '' })
  const availableSources = allowedRiskSources(preview.availableSourceRefs), missingAvailable = permissionSourceRequirements(availableSources)
  const current = currentPermissionPreview(preview, preview.observationId, evidenceRevision)
  const finalDecision = ['CONFIRMED', 'REJECTED'].includes(preview.decision ?? '')
  const input = { capability, targetScope, coverage, selectedSourceKeys, evidenceRef: '', until, attested, attestedAt, applicableFrom, applicableUntil }
  const body = permissionConfirmationFacts(preview, evidenceRevision, input)
  const partialBody = partialPermissionConfirmationFacts(preview, evidenceRevision, input)
  const blocked = disabled || !current
  const onError = (error: Error) => { if (error instanceof ApiError && [403, 404, 409].includes(error.status)) onStale() }
  const confirm = useMutation({ mutationFn: () => { const freshBody = permissionConfirmationFacts(preview, evidenceRevision, input); if (!freshBody) throw new Error('CONFIRMATION_REQUIRED'); return confirmPermissionObservation(occurrenceId, preview.observationId, { ...freshBody, idempotencyKey: idempotencyFor(key, freshBody) }) }, onSuccess: () => onUpdated('수동 검토를 저장했어요. 현재 심각도와 미확인 근거를 다시 확인하세요.'), onError })
  const reject = useMutation({ mutationFn: () => { const payload = { expectedContextVersion: preview.contextVersion, reasonCode: rejectReason }; return rejectPermissionObservation(occurrenceId, preview.observationId, { ...payload, idempotencyKey: idempotencyFor(rejectKey, payload) }) }, onSuccess: () => onUpdated('이 조회 자료를 사용하지 않도록 기록했어요. 기존 위험 판단은 유지돼요.'), onError })
  const partial = useMutation({
    mutationFn: () => {
      const facts = partialPermissionConfirmationFacts(preview, evidenceRevision, input)
      if (!facts) throw new Error('PARTIAL_CONFIRMATION_REQUIRED')
      return confirmPermissionObservation(occurrenceId, preview.observationId, { ...facts, idempotencyKey: idempotencyFor(partialKey, facts) })
    },
    onSuccess: () => onUpdated('부분 자료로 저장했어요. 확인한 내용을 보완한 뒤 평가 근거로 확정할 수 있어요.'),
    onError,
  })
  const busy = confirm.isPending || reject.isPending || partial.isPending
  return <section className="secret-permission-review" aria-label="권한 자료 수동 검토"><h4>조회한 권한 자료 검토</h4>{preview.latestDraft && <p className="caption">{restored ? '저장한 부분 자료를 불러왔어요.' : '이전 부분 자료를 이력으로 보존하고 있어요.'} 저장 {scanDate(preview.latestDraft.savedAt)}</p>}<p className="caption">관측된 값은 미리 채웠어요. 확인한 내용은 부분 자료로 저장하고 필요한 근거를 보완해 확정하세요.</p>
    {!current ? <p className="notice" role="alert">키·근거가 달라졌거나 자료 기한이 지났어요. 현재 자료를 다시 조회하세요.</p> : finalDecision ? <p className="notice">이미 검토를 기록한 자료예요. 현재 판단과 근거 이력을 확인하세요.</p> : (!preview.canConfirm || missingAvailable.length > 0) && !preview.canSavePartial ? <div className="notice"><strong>지금은 이 자료를 수용할 수 없어요</strong>{missingAvailable.length > 0 && <ul>{missingAvailable.map((item) => <li key={item}>{item}</li>)}</ul>}{preview.blockedReasonCodes.map((code) => <p key={code}>{permissionReason(code)}</p>)}<PermissionSupplementActions occurrenceId={occurrenceId} preview={preview} onSupplement={onSupplement} onValidate={onValidate} /></div> : <form onSubmit={(event) => { event.preventDefault(); if (body && !blocked && !busy) confirm.mutate() }}>
      <div className="secret-permission-form-grid"><label>확인한 권한 기능<select className="select" value={capability} disabled={blocked || busy} onChange={(event) => { setCapability(event.target.value); clearAttestation() }}><option value="">권한 기능 미확인</option>{observedPermissionOptions(preview).map((code) => <option key={code} value={code}>{riskOptionLabel(code)}</option>)}</select></label><label>적용 대상 단위<select className="select" value={targetScope} disabled={blocked || busy} onChange={(event) => { setTargetScope(event.target.value); clearAttestation() }}><option value="">적용 대상 미확인</option>{Object.entries(permissionTargetLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>{Object.entries(permissionCoverageLabels).map(([field, label]) => <label key={field}>{label}<select className="select" value={coverage[field] ?? ''} disabled={blocked || busy} onChange={(event) => { setCoverage((current) => ({ ...current, [field]: event.target.value })); clearAttestation() }}><option value="">직접 확인한 값 선택</option>{Object.entries(permissionCoverageValues).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>)}</div>
      <details className="secret-permission-review-details"><summary>연결 근거·적용 기한</summary><fieldset><legend>수용을 뒷받침하는 현재 근거</legend>{availableSources.map((ref) => { const value = riskSourceKey(ref); return <label className="secret-check-label" key={value}><input type="checkbox" checked={selectedSourceKeys.includes(value)} disabled={blocked || busy} onChange={(event) => { setSelectedSourceKeys((current) => event.target.checked ? [...current, value] : current.filter((item) => item !== value)); clearAttestation() }} />{riskSourceLabel(ref.labelCode)} · {ref.role === 'BINDS_IDENTITY' ? '키 주체 연결' : ref.role === 'LIMITS' ? '제한 확인' : ref.role === 'CLASSIFIES' ? '자산 분류' : '권한·대상 확인'}</label> })}</fieldset>
      <SecretRiskApplicability from={applicableFrom} until={applicableUntil} sourceObservedAt={preview.sourcePresenceObservedAt} observedAt={attestedAt} validUntil={riskInputUtc(until)} disabled={blocked || busy} onFrom={(value) => { setApplicableFrom(value); clearAttestation() }} onUntil={(value) => { setApplicableUntil(value); clearAttestation() }} />
      <div className="secret-permission-form-grid"><div className="secret-permission-readonly"><span>공급자 자료 조회 시각</span><strong>{scanDate(preview.observedAt)}</strong></div><label>적용 기한 (KST)<input className="input" type="datetime-local" max={localTime(preview.expiresAt)} value={until} disabled={blocked || busy} onChange={(event) => { setUntil(event.target.value); clearAttestation() }} /></label><p className="caption">확인한 내용과 담당자, 시각은 내부 기록으로 저장해요.</p></div><p className="caption">부분 자료도 현재 확인 수준으로 저장할 수 있어요. 평가 근거 확정에는 모든 확인 범위와 연결 자료가 필요해요.</p></details>
      <label className="secret-check-label"><input type="checkbox" checked={attested} disabled={blocked || busy} onChange={(event) => { setAttested(event.target.checked); setAttestedAt(event.target.checked ? new Date().toISOString() : null) }} />조회 자료와 연결 근거를 검토했으며, 선택한 내용을 수동 근거로 수용해요.</label>{attestedAt && <p className="caption">수동 검토 시각 {scanDate(attestedAt)}</p>}<p className="caption" id={`permission-review-help-${occurrenceId}`}>{body ? '현재 근거로 평가 근거 확정을 요청할 수 있어요.' : partialBody ? '부분 자료로 저장할 수 있어요. 등급에는 보완 후 확정한 근거를 반영해요.' : !attested ? '조회 자료를 검토한 뒤 위의 확인을 선택하세요.' : '선택한 확인 범위와 근거를 확인하세요.'}</p><div className="row">
        {preview.canSavePartial && <button type="button" className="btn primary" aria-describedby={`permission-review-help-${occurrenceId}`} disabled={!partialBody || blocked || busy} onClick={() => partial.mutate()}>{partial.isPending ? '저장 중…' : '확인한 내용 저장'}</button>}
        {preview.canConfirm && <button className={`btn ${preview.canSavePartial ? 'outline' : 'primary'}`} aria-describedby={`permission-review-help-${occurrenceId}`} disabled={!body || blocked || busy}>{confirm.isPending ? '확정 중…' : '평가 근거로 확정'}</button>}
      </div>
      {onSupplement && <button type="button" className="btn outline" onClick={() => onSupplement('PERMISSION_MAPPING')}>일부 확인한 내용을 근거 보완에 기록</button>}
    </form>}
    {current && preview.canReject === true && !finalDecision && <details className="secret-permission-reject"><summary>이 조회 자료 사용하지 않기</summary><label>제외 사유<select className="select" value={rejectReason} disabled={blocked || busy} onChange={(event) => setRejectReason(event.target.value)}><option value="">사유 선택</option>{Object.entries(permissionRejectLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label><button className="btn outline" disabled={blocked || busy || !Object.hasOwn(permissionRejectLabels, rejectReason)} onClick={() => reject.mutate()}>자료 제외 기록</button></details>}
    {(confirm.isError || reject.isError || partial.isError) && <p className="notice error" role="alert">{safeMutationMessage(confirm.error ?? reject.error ?? partial.error)}</p>}
  </section>
}
export function SecretPermissionAssistance({ occurrenceId, evidenceRevision, onReload, onSupplement, onValidate, location: requestedLocation }: { occurrenceId: number; evidenceRevision: number; onReload: () => void; onSupplement?: (type: 'ASSET_CLASSIFICATION' | 'PERMISSION_MAPPING') => void; onValidate?: () => void; location?: PermissionLocation }) {
  const location = requestedLocation?.occurrenceId === occurrenceId ? requestedLocation : undefined
  const client = useQueryClient(), refreshReads = useSecretReadRefresh(), [requestId, setRequestId] = useState<number | null>(null), [collector, setCollector] = useState(''), [reviewId, setReviewId] = useState<number | null>(null), [notice, setNotice] = useState(''), [stale, setStale] = useState(false)
  const requestKey = useRef({ payload: '', key: '' }), processed = useRef<number | null>(null)
  const context = useQuery({ queryKey: ['secret-permission-assistance', occurrenceId, evidenceRevision], queryFn: () => fetchPermissionAssistance(occurrenceId), retry: false, refetchOnWindowFocus: false })
  const requestedId = requestId ?? context.data?.latestRequest?.requestId ?? null
  const progress = useQuery({ queryKey: ['secret-permission-request', occurrenceId, requestedId], queryFn: () => fetchPermissionRequest(occurrenceId, requestedId!), enabled: requestedId != null, retry: false, refetchOnWindowFocus: false, refetchInterval: (query) => !query.state.error && (!query.state.data || activePermissionRequest(query.state.data.status)) ? 3000 : false })
  const request = useMutation({ mutationFn: () => { if (!context.data || !permissionPrerequisites(context.data, collector, location?.fixtureStatus === 'VERIFIED_SYNTHETIC').canRequest) throw new Error('PERMISSION_PREREQUISITES_REQUIRED'); const body = { expectedContextVersion: context.data.contextVersion, ...(collector ? { collectorConnectionId: Number(collector) } : {}) }; return requestPermissionAssistance(occurrenceId, { ...body, idempotencyKey: idempotencyFor(requestKey, body) }) }, onSuccess: (result) => { setRequestId(result.requestId); setNotice('권한 정보 조회 요청을 접수했어요. 결과가 나오면 조회 자료를 검토하세요.'); void context.refetch() }, onError: (error) => { if (error instanceof ApiError && [403, 404, 409].includes(error.status)) setStale(true) } })
  useEffect(() => { if (progress.data && completedPermissionRequest(progress.data.status) && processed.current !== progress.data.requestId) { processed.current = progress.data.requestId; requestKey.current = { payload: '', key: '' }; void client.invalidateQueries({ queryKey: ['secret-permission-assistance', occurrenceId] }) } }, [progress.data, occurrenceId, client])
  const observation = progress.data?.observation ?? context.data?.latestObservation
  const preview = useQuery({ queryKey: ['secret-permission-preview', occurrenceId, reviewId, evidenceRevision], queryFn: () => fetchPermissionPreview(occurrenceId, reviewId!), enabled: reviewId != null, retry: false, refetchOnWindowFocus: false })
  const matched = context.data?.occurrenceId === occurrenceId && context.data.evidenceRevision === evidenceRevision
  const pending = requestedId != null && (!progress.data || !completedPermissionRequest(progress.data.status)) || activePermissionRequest(context.data?.latestRequest?.status)
  const ready = context.data ? permissionPrerequisites(context.data, collector, location?.fixtureStatus === 'VERIFIED_SYNTHETIC') : null
  const updated = (message: string) => { setNotice(message); setReviewId(null); refreshReads(); onReload(); for (const prefix of ['secret-risk', 'secret-permission-assistance', 'secret-permission-request', 'secret-assessment-history']) void client.invalidateQueries({ queryKey: [prefix] }) }
  const reload = () => { setStale(false); setReviewId(null); setRequestId(null); request.reset(); void context.refetch(); if (requestedId) void progress.refetch() }
  return <section className="secret-permission-assistance" aria-label="권한 정보 가져오기"><div className="secret-permission-heading"><div><h3>키 권한 확인</h3><p>확인한 공급자 권한 자료를 모아, 검토한 근거만 판단에 사용해요.</p></div><button className="btn outline" disabled={context.isFetching} onClick={reload}>현재 조건 조회</button></div>
    {notice && <p className="notice" role="status">{notice}</p>}{context.isPending ? <p role="status">권한 조회 조건을 불러오는 중이에요.</p> : context.isError ? <p className="notice" role="alert">{safeMutationMessage(context.error)}</p> : !matched ? <p className="notice" role="alert">선택한 위치의 근거가 달라졌어요. 현재 판단을 다시 조회하세요.</p> : <>
      {reviewId == null ? <>
      <dl className="secret-permission-identity"><div><dt>발급자</dt><dd>{context.data.identity.provider === 'AWS' ? 'AWS' : context.data.identity.provider === 'GITHUB' ? 'GitHub' : '유형 확인 필요'}</dd></div><div><dt>키 주체 연결</dt><dd>{context.data.identity.status === 'MATCHED' ? `인증한 주체와 연결됨 · ${permissionPrincipalLabel(context.data.identity.principalType)}` : context.data.identity.status === 'STALE' ? '이전 확인 · 기한 지남' : '현재 연결 근거 없음'}</dd></div><div><dt>주체 확인 시각</dt><dd>{context.data.identity.observedAt ? scanDate(context.data.identity.observedAt) : '확인 기록 없음'}</dd></div></dl>
      <PermissionPrerequisites context={context.data} collector={collector} onCollector={setCollector} disabled={context.isFetching || pending || request.isPending} location={location} onValidate={onValidate} />
      {[...new Set((ready?.displayReasonCodes ?? []).map(permissionReason))].length > 0 && <ul className="secret-safe-reasons">{[...new Set((ready?.displayReasonCodes ?? []).map(permissionReason))].map((reason) => <li key={reason}>{reason}</li>)}</ul>}
      {stale && <p className="notice error" role="alert">권한 또는 조회 기준이 바뀌었어요. 현재 조건과 판단을 다시 조회하세요.</p>}<div className="row"><button className="btn primary" aria-describedby={`permission-request-help-${occurrenceId}`} disabled={!ready?.canRequest || context.isFetching || stale || pending || request.isPending || progress.isError} onClick={() => request.mutate()}>{request.isPending ? '요청 중…' : '권한 정보 가져오기'}</button><span className="caption" id={`permission-request-help-${occurrenceId}`}>{pending ? '진행 중인 요청 결과를 먼저 확인하세요.' : context.isFetching ? '현재 조회 조건을 확인하는 중이에요.' : progress.isError ? '기존 요청 상태를 확인한 뒤 진행하세요.' : ready?.blocker || '조건을 충족했어요. 조회 자료를 가져온 뒤 직접 검토하세요.'}</span></div>
      {(progress.data || context.data.latestRequest) && <p className="secret-permission-progress" role="status">요청 #{(progress.data ?? context.data.latestRequest)!.requestId} · {permissionRequestStatus((progress.data ?? context.data.latestRequest)!.status)}{progress.data?.failureCode ? ` · ${permissionReason(progress.data.failureCode)}` : ''}</p>}{progress.isError && <p className="notice error" role="alert">진행 상태를 확인하지 못했어요. 새 요청 전에 <button className="btn outline" onClick={() => void progress.refetch()}>기존 요청 다시 확인</button>하세요.</p>}{progress.data && !activePermissionRequest(progress.data.status) && !completedPermissionRequest(progress.data.status) && <p className="notice" role="alert">요청 종료 여부를 확인할 수 없어요. 기존 요청 상태를 다시 조회하세요.</p>}{request.isError && <p className="notice error" role="alert">{safeMutationMessage(request.error)}</p>}
      {observation && <><PermissionObservedFacts observation={observation} />{observation.decision && observation.decision !== 'DRAFTED' ? <p className="notice">{observation.decision === 'CONFIRMED' ? '이 자료는 수동 검토를 저장했어요. 수용·평가 결과는 현재 판단에서 확인하세요.' : '이 자료는 사용하지 않도록 기록했어요. 기존 위험 판단은 유지돼요.'}</p> : Date.parse(observation.expiresAt) <= Date.now() ? <p className="notice">조회 자료의 기한이 지났어요. 새 자료를 가져온 뒤 검토하세요.</p> : <button className="btn outline" disabled={stale || pending} onClick={() => setReviewId(observation.observationId)}>{observation.decision === 'DRAFTED' ? '저장한 부분 자료 이어보기' : '조회 자료 검토'}</button>}</>}
      </> : <><button type="button" className="btn outline" onClick={() => setReviewId(null)}>조회 자료로 돌아가기</button>
      {(preview.isPending ? <p role="status">검토할 현재 근거를 불러오는 중이에요.</p> : preview.isError ? <p className="notice error" role="alert">{safeMutationMessage(preview.error)} <button className="btn outline" onClick={() => void preview.refetch()}>검토 자료 다시 조회</button></p> : preview.data.observationId !== reviewId ? <p className="notice error" role="alert">선택한 조회 자료가 달라요. 현재 조건을 다시 조회하세요.</p> : <PermissionReviewForm key={`${reviewId}:${preview.data.contextVersion}`} occurrenceId={occurrenceId} preview={preview.data} evidenceRevision={evidenceRevision} disabled={context.isFetching || stale || pending} onUpdated={updated} onStale={() => setStale(true)} onSupplement={onSupplement} onValidate={ready?.isSynthetic ? undefined : onValidate} />)}
      </>}
    </>}
  </section>
}
