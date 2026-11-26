import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { fetchAssessmentHistory, fetchOccurrenceRisk, type RiskAssessment } from '@/api/secretRisk'
import type { KeyLocation } from '@/api/secrets'
import { safeMutationMessage } from '@/lib/secretEvidence'
import { positiveId, scanDate } from '@/lib/secretScan'
import { riskOptionLabel } from '@/lib/secretRiskForms'
import { riskEvidenceState, riskRuleLabels, riskAxisLabels, riskAxisValue, riskEvidenceLabels, riskReason, severityText, verificationLabel } from '@/lib/secretRisk'
import { SecretRiskActions } from './SecretRiskActions'
import { SecretRiskContext } from './SecretRiskContext'
import { SecretPermissionAssistance } from './SecretPermissionAssistance'
import { SecretRiskExperience } from './SecretRiskExperience'
import './secret-validation-risk.css'

function AssessmentResult({ label, assessment }: { label: string; assessment: RiskAssessment | null }) {
  return <section className={`secret-risk-result${assessment?.held ? ' held' : ''}`}><h3>{label}</h3><strong>{assessment ? severityText(assessment.severity, assessment.assessmentStatus) : '평가 전'}</strong>{assessment?.policyVersion === 'severity-v2' && assessment.ruleId && <p>{riskRuleLabels[assessment.ruleId] ?? '입력과 근거를 확인해 주세요.'}</p>}{assessment?.held && <p className="notice">기존 판단 유지 · 재검토 필요</p>}{assessment?.holdReasonCodes?.map((code) => <p key={code}>{riskReason(code)}</p>)}<details><summary>평가 시각·규칙</summary><dl><div><dt>규칙·정책</dt><dd>{assessment?.ruleId ?? '—'} · {assessment?.policyVersion ?? '—'}</dd></div><div><dt>평가 시각</dt><dd>{assessment?.assessedAt ? scanDate(assessment.assessedAt) : '—'}</dd></div><div><dt>원평가</dt><dd>{assessment?.assessmentId == null ? '—' : `#${assessment.sourceAssessmentId ?? assessment.assessmentId}`}</dd></div></dl></details></section>
}
export function SecretRiskPanel({ occurrenceId, location, credentialSetId }: { occurrenceId: number; location?: KeyLocation; credentialSetId?: number }) {
  const actions = useRef<HTMLDetailsElement>(null), [assetRequest, setAssetRequest] = useState({ occurrenceId: 0, sequence: 0, evidenceType: 'ASSET_CLASSIFICATION' })
  const assetFocus = assetRequest.occurrenceId === occurrenceId ? assetRequest.sequence : 0
  const [params, setParams] = useSearchParams(), historyMode = params.get('riskView') === 'history', evidenceMode = params.get('riskView') === 'evidence', page = (positiveId(params.get('assessmentPage')) ?? 1) - 1
  const risk = useQuery({ queryKey: ['secret-risk', occurrenceId], queryFn: () => fetchOccurrenceRisk(occurrenceId), retry: false, refetchOnWindowFocus: false,
    refetchInterval: (query) => ['PENDING', 'RUNNING'].includes(query.state.data?.assessmentProcess?.status ?? '') ? 5000 : false })
  const history = useQuery({ queryKey: ['secret-assessment-history', occurrenceId, page], queryFn: () => fetchAssessmentHistory(occurrenceId, page), enabled: historyMode, retry: false, refetchOnWindowFocus: false })
  const automatic = risk.data?.latestAutomaticAssessment, effective = risk.data?.effectiveAssessment
  const sameResult = !!automatic && !!effective && !effective.held && automatic.assessmentId === effective.assessmentId && automatic.assessmentStatus === effective.assessmentStatus && automatic.severity === effective.severity
  const missing = [...new Set([...(risk.data?.missingReasonCodes ?? []), ...(risk.data?.conflictReasonCodes ?? [])].map(riskReason))]
  const axes = Object.entries(riskAxisLabels).filter(([axis]) => risk.data?.inputs?.[axis] != null)
  const experience = risk.data?.riskExperience
  const view = historyMode ? 'history' : evidenceMode && experience ? 'evidence' : 'current'
  useEffect(() => { if (assetFocus && actions.current) { actions.current.open = true; actions.current.scrollIntoView({ block: 'nearest' }); actions.current.querySelector<HTMLSelectElement>('select')?.focus() } }, [assetFocus, view, risk.isSuccess])
  const openEvidence = (evidenceType = '') => {
    const next = new URLSearchParams(params); next.set('riskView', 'evidence'); setParams(next)
    setAssetRequest((current) => ({ occurrenceId, sequence: current.sequence + 1, evidenceType }))
  }
  const validate = () => { const next = new URLSearchParams(params); next.set('occurrence', String(occurrenceId)); next.set('locationPanel', 'closed'); next.set('validation', 'open'); next.set('tab', 'validation'); setParams(next) }
  return <section aria-labelledby="location-risk-title"><h2 id="location-risk-title">판단 근거</h2><nav className="secret-key-tabs" aria-label="위치 판단 보기">{(experience ? [['current', '현재 판단'], ['evidence', '근거 보완·검토'], ['history', '평가 이력']] : [['current', '현재 판단'], ['history', '평가 이력']]).map(([tab, label]) => <button key={tab} className={view === tab ? 'active' : ''} aria-current={view === tab ? 'page' : undefined} onClick={() => { const next = new URLSearchParams(params); if (tab === 'current') next.delete('riskView'); else next.set('riskView', tab); setParams(next) }}>{label}</button>)}</nav>
    {risk.isPending ? <p role="status">이 위치의 판단 근거를 불러오는 중이에요.</p> : risk.isError ? <p className="notice error" role="alert">{safeMutationMessage(risk.error)} <button className="btn outline" onClick={() => void risk.refetch()}>다시 조회</button></p> : historyMode ? <>
      {history.isPending ? <p role="status">평가 이력을 불러오는 중이에요.</p> : history.isError ? <p role="alert">{safeMutationMessage(history.error)} <button className="btn outline" onClick={() => void history.refetch()}>다시 조회</button></p> : <><ol className="secret-risk-history">{history.data.items.map((item) => <li key={item.assessmentId}><strong>평가 #{item.assessmentId} · {item.recordKind === 'APPLICATION' ? '적용·보류 기록' : item.recordKind === 'REVIEW' ? '독립 검토' : item.recordKind === 'OVERRIDE_PROPOSAL' ? '수동 판단 제안' : '자동 평가'}</strong><p>{item.assessmentStatus ? severityText(item.severity, item.assessmentStatus) : item.decision ?? '기록'} · {item.ruleId ?? '—'} · {item.policyVersion ?? '—'}</p><p className="caption">{scanDate(item.assessedAt ?? item.createdAt)}</p>{item.reasonCode && <p>{riskReason(item.reasonCode)}</p>}</li>)}</ol>{!history.data.items.length && <p>이 위치에 저장된 평가 이력이 없어요.</p>}<div className="row"><button className="btn outline" disabled={page === 0} onClick={() => { const next = new URLSearchParams(params); next.set('assessmentPage', String(page)); setParams(next) }}>이전</button><span>{page + 1}</span><button className="btn outline" disabled={(page + 1) * history.data.size >= history.data.total} onClick={() => { const next = new URLSearchParams(params); next.set('assessmentPage', String(page + 2)); setParams(next) }}>다음</button></div></>}
    </> : experience && !evidenceMode ? <>
      <SecretRiskExperience experience={experience} process={risk.data.assessmentProcess} location={location?.occurrenceId === occurrenceId ? location : undefined} credentialSetId={credentialSetId} canSupplement={risk.data.capabilities.canSubmitEvidence === true} onAction={(action, type) => action === 'REQUEST_VALIDATION' ? validate() : openEvidence(type ?? (action === 'REVIEW_ACCESS' ? 'ACCESS_SCOPE' : ''))} />
      {effective && (effective.held || experience.summary.status === 'STALE') && <details className="secret-risk-technical"><summary>유지 중인 이전 판단</summary><AssessmentResult label={effective.held ? '현재 유지 중인 이전 판단' : '이전 적용 판단'} assessment={effective} /></details>}
      {risk.data.lastConfirmedSeverity && <details className="secret-risk-technical"><summary>과거 확정 등급</summary><p className="caption">{severityText(risk.data.lastConfirmedSeverity.severity)} · {scanDate(risk.data.lastConfirmedSeverity.assessedAt)}</p></details>}
    </> : <>
      {!experience && <><div className="secret-risk-results single"><AssessmentResult label={sameResult ? "현재 판단" : "현재 적용 판단"} assessment={effective ?? automatic ?? null} /></div>{!sameResult && automatic && <details className="secret-risk-technical"><summary>최근 자동 평가</summary><AssessmentResult label="최근 자동 평가" assessment={automatic} /></details>}
      {risk.data.lastConfirmedSeverity && (!sameResult || risk.data.lastConfirmedSeverity.assessmentId !== effective?.assessmentId) && <p className="caption">마지막 확정 등급 {severityText(risk.data.lastConfirmedSeverity.severity)} · 평가 #{risk.data.lastConfirmedSeverity.assessmentId} · {scanDate(risk.data.lastConfirmedSeverity.assessedAt)}</p>}
      {typeof risk.data.freshness === 'object' && risk.data.freshness.currentEligible === false && <p className="notice">최근 자동 평가의 근거가 현재 기준과 달라요. 현재 유지 중인 판단과 구분해 주세요.</p>}
      {risk.data.legacyExposureAssessment?.needsReconfirmation && <p className="notice">이전 노출 판단은 보존돼 있어요. 현재 범위의 확인 근거가 부족해 다시 확인해야 해요.</p>}
      </>}
      <SecretRiskContext context={risk.data.analysisContext} occurrenceId={occurrenceId} evidenceRevision={risk.data.evidenceRevision} onClassifyAsset={risk.data.capabilities.canSubmitEvidence && risk.data.evidenceForms?.some((form) => form.evidenceType === 'ASSET_CLASSIFICATION') ? () => setAssetRequest((current) => ({ occurrenceId, sequence: current.sequence + 1, evidenceType: 'ASSET_CLASSIFICATION' })) : undefined} />
      {experience?.support.permissionAssistance.status !== 'UNSUPPORTED' && <SecretPermissionAssistance key={occurrenceId} occurrenceId={occurrenceId} location={location} evidenceRevision={risk.data.evidenceRevision} onReload={() => void risk.refetch()} onSupplement={risk.data.capabilities.canSubmitEvidence ? (evidenceType) => setAssetRequest((current) => ({ occurrenceId, sequence: current.sequence + 1, evidenceType })) : undefined} onValidate={validate} />}
      {!experience && missing.length > 0 && <div className="secret-risk-missing"><h3>확인이 필요한 정보</h3><ul>{missing.map((label) => <li key={label}>{label}</li>)}</ul></div>}
      {risk.data.positiveCapabilities?.length ? <div className="notice"><h3>확인된 권한</h3><ul>{risk.data.positiveCapabilities.map((code) => <li key={code}>{riskOptionLabel(code)}</li>)}</ul><p>전체 대상·제한의 확인 범위는 아래 근거를 참고하세요.</p></div> : null}
      <details className="secret-risk-technical"><summary>평가에 사용한 사실·검증 범위</summary>{axes.length ? <dl className="secret-risk-axes">{axes.map(([axis, label]) => { const input = risk.data.inputs?.[axis]; return <div key={axis}><dt>{label}</dt><dd>{riskAxisValue(axis, input)}{input && typeof input === 'object' && <small>{input.observedAt ? scanDate(input.observedAt) : '—'} · {input.verificationLevel ? verificationLabel(input.verificationLevel) : '관측 범위 확인'}{input.freshness === 'STALE' && ' · 근거 오래됨'}</small>}</dd></div> })}</dl> : <p>아직 이 위치에 저장된 평가 입력이 없어요.</p>}<p className="caption">유효성은 위험도를 자동으로 올리거나 내리지 않아요.</p><p className="caption">조회 {scanDate(risk.data.readAt)} · 근거 버전 {risk.data.evidenceRevision}</p></details>
      <details className="secret-risk-technical"><summary>추가 자료 {risk.data.evidenceSummary?.length ?? 0}개</summary>{risk.data.evidenceSummary?.length ? <ul className="secret-risk-history">{risk.data.evidenceSummary.map((evidence) => <li key={evidence.evidenceId}><strong>{riskEvidenceLabels[evidence.type ?? evidence.evidenceType ?? evidence.kind ?? ''] ?? '판단 근거'}</strong><p>{riskEvidenceState(evidence.verificationLevel, evidence.status)} · {evidence.observedAt ? scanDate(evidence.observedAt) : '—'}</p>{evidence.currentEligible === false && <p>현재 적용 불가 · 과거 자료</p>}</li>)}</ul> : <p>등록된 추가 자료가 없어요.</p>}</details>
      <details ref={actions} className="secret-risk-technical"><summary>근거 보완·재평가·독립 검토</summary><SecretRiskActions key={occurrenceId} occurrenceId={occurrenceId} risk={risk.data} refreshing={risk.isFetching} evidenceType={assetFocus ? assetRequest.evidenceType : ''} evidenceFocus={assetFocus} onReload={() => void risk.refetch()} /></details>
    </>}
  </section>
}
