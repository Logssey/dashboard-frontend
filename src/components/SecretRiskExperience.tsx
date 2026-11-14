import { Link } from 'react-router-dom'
import type { RiskExperience } from '@/api/secretRisk'
import type { KeyLocation } from '@/api/secrets'
import { criterionStatusLabel, experienceReason, permissionSupportReason, priorityLabel, priorityReason, riskActionLabel } from '@/lib/secretRiskExperience'
import { riskAxisLabels, riskAxisValue, riskReason, severityText } from '@/lib/secretRisk'
import { scanDate } from '@/lib/secretScan'

interface Props {
  experience: RiskExperience
  location?: KeyLocation
  credentialSetId?: number
  canSupplement: boolean
  onAction: (action: string, evidenceType?: string | null) => void
}

export function SecretRiskExperience({ experience, location, credentialSetId, canSupplement, onAction }: Props) {
  if (experience.version !== 'risk-experience-v1') return <p className="notice">판단 설명을 현재 버전으로 불러오지 못했어요. 다시 조회하세요.</p>
  const summary = experience.summary
  const priority = experience.workPriority
  const supportReason = permissionSupportReason(experience)
  const questions = new Map<string, { action: string; evidenceType: string | null; codes: string[] }>()
  for (const fact of experience.missingFacts) {
    const key = JSON.stringify([fact.action, fact.evidenceType])
    const question = questions.get(key)
    if (question) {
      if (!question.codes.includes(fact.code)) question.codes.push(fact.code)
    } else questions.set(key, { action: fact.action, evidenceType: fact.evidenceType, codes: [fact.code] })
  }
  const missing = [...questions.values()]
  const first = missing.find((fact) => riskActionLabel(fact.action))
  const grade = summary.held ? severityText(summary.severity) : summary.status === 'CURRENT' ? severityText(summary.severity, summary.ruleId === 'R00' ? 'NOT_APPLICABLE' : undefined)
    : summary.status === 'STALE' ? '다시 확인 필요' : summary.status === 'METADATA_ONLY' ? '메타데이터' : '미평가'
  const canReview = location?.capabilities?.canReview === true
  const triagePath = location && credentialSetId && `/secrets/triage/${credentialSetId}?origin=${location.origin}&occurrence=${location.occurrenceId}`
  function actionControl(action: string, evidenceType?: string | null) {
    const label = riskActionLabel(action)
    if (!label) return null
    if (action === 'REVIEW_STORAGE_POLICY' && canReview && triagePath) return <Link className="btn outline" to={triagePath}>{label}</Link>
    if (action === 'COMPLETE_CREDENTIAL') return <p className="caption">승인된 원천에서 같은 키의 필수 구성과 발견 위치를 확인하세요.</p>
    if (action === 'REVIEW_STORAGE_POLICY') return <p className="caption">해당 위치의 보안 담당자에게 보관 정책과 판정 자료를 요청하세요.</p>
    if (action !== 'REQUEST_VALIDATION' && !canSupplement) return <p className="caption">이 위치의 보안 담당자에게 자료 확인을 요청하세요.</p>
    return <button type="button" className="btn outline" onClick={() => onAction(action, evidenceType)}>{label}</button>
  }
  return <div className="secret-risk-experience">
    <section className={`secret-risk-headline ${summary.status.toLowerCase()}`} aria-label="시크릿 노출 심각도 요약">
      <div className="secret-risk-headline-status"><h3>시크릿 노출 심각도</h3><strong>{grade}</strong><span>{summary.held ? '기존 높은 판단 유지 · 독립 검토 필요' : summary.status === 'CURRENT' ? '현재 근거 기준' : summary.status === 'STALE' ? '이전 평가와 현재 사실 구분' : summary.status === 'METADATA_ONLY' ? '원문 노출 평가 대상 아님' : '위험 없음으로 판단하지 않음'}</span></div>
      {summary.held && <p>최근 자동 평가 {severityText(summary.automaticSeverity, summary.ruleId === 'R00' ? 'NOT_APPLICABLE' : undefined)} · 현재 유지 판단과 구분해요.</p>}
      <p>{experienceReason(experience)}</p>
      {first && <div className="secret-risk-next"><div><span>다음 행동</span><strong>{riskReason(first.codes[0])}</strong></div>{actionControl(first.action, first.evidenceType)}</div>}
      <p className="caption">원문 관찰 {experience.sourcePresenceObservedAt ? scanDate(experience.sourcePresenceObservedAt) : '현재 관찰 시점 미확인'} · 판단 조회 {scanDate(experience.readAt)}</p>
    </section>

    <section className="secret-risk-priority" aria-label="업무 우선순위">
      <div><h3>업무 우선순위</h3><strong className={`secret-risk-priority-level ${priority.level.toLowerCase()}`}>{priorityLabel(priority.level)}</strong></div>
      <p className="caption">심각도와 별도로 정한 확인·계획 목표예요.</p>
      {priority.reasonCodes.map(priorityReason).filter(Boolean).length > 0 && <p>{[...new Set(priority.reasonCodes.map(priorityReason).filter(Boolean))].join(' · ')}</p>}
      {priority.level !== 'INVENTORY' && <dl><div><dt>담당 확인 목표</dt><dd>{priority.acknowledgeDueAt ? scanDate(priority.acknowledgeDueAt) : '기준 시각 확인 필요'}</dd></div>{priority.planDueAt && <div><dt>조치·자료 확보 계획</dt><dd>{scanDate(priority.planDueAt)}</dd></div>}</dl>}
      <details><summary>목표 시간의 기준</summary><p>{priority.targetBasis === 'GRADE_ACTIVATED' ? '현재 등급 적용' : priority.targetBasis === 'FIRST_OBSERVED' ? '최초 발견' : priority.targetBasis === 'PRIORITY_SIGNAL_OBSERVED' ? '우선 확인 신호 관측' : '업무 기준'} {priority.targetBasisAt ? `${scanDate(priority.targetBasisAt)}을 기준으로 계산해요.` : '시각 미확인 · 기한을 임의로 정하지 않아요.'} 해결 완료 기한과는 구분해요.</p><p>Asia/Seoul 월~금 09~18시의 운영 시간을 누적해요.{!priority.operatingHoursNow && ' 지금은 운영 시간 밖이에요. 표시한 다음 확인 목표를 확인하세요.'}</p>{!priority.holidayCalendarConfigured && <p>공휴일 캘린더는 연결되지 않았어요.</p>}</details>
    </section>

    <section className="secret-risk-facts" aria-label="판단에 필요한 확인 사실"><h3>확인한 사실</h3><p className="caption">값을 직접 지정하는 양식이 아니라, 이 위치의 근거 확인 상태예요.</p>
      <dl>{Object.keys(riskAxisLabels).map((axis) => {
        const criterion = experience.criteria.find((item) => item.axis === axis)
        return <div key={axis}><dt>{riskAxisLabels[axis]}</dt><dd><div><strong>{criterion ? riskAxisValue(axis, criterion.value) : '확인 정보 없음'}</strong><span className={`secret-risk-fact-status ${(criterion?.status ?? 'UNKNOWN').toLowerCase()}`}>{criterionStatusLabel(criterion?.status ?? 'UNKNOWN')}</span></div>{criterion?.reasonCodes.length ? <p>{[...new Set(criterion.reasonCodes.map(riskReason))].join(' ')}</p> : null}{axis === 'credential' && <small>구성 확인은 실제 발급·현재 인증 성공과 구분해요.</small>}{axis === 'validity' && <small>현재 인증 상태가 과거 노출 심각도를 자동으로 낮추지 않아요.</small>}</dd></div>
      })}</dl>
    </section>

    <section className="secret-risk-questions" aria-label="부족한 근거 확인"><h3>{missing.length ? '이 항목만 확인하세요' : '현재 부족한 근거 없음'}</h3>
      {missing.length ? <ul>{missing.map((question) => <li key={JSON.stringify([question.action, question.evidenceType])}><p>{[...new Set(question.codes.map(riskReason))].join(' ')}</p>{actionControl(question.action, question.evidenceType)}</li>)}</ul> : <p className="caption">추가 조치와 이전 노출 기록은 대응·평가 이력에서 확인하세요.</p>}
    </section>
    {supportReason && <p className="notice">{supportReason}</p>}
  </div>
}
