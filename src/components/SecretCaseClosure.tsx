import { useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import type { SecretCaseDetail } from '@/api/secretCases'
import { fetchClosureChecks, resolveSecretResponse, type ClosureChecks, type ClosureLocationGroup } from '@/api/secretClosure'
import { closureCheckLabels, closureReasonLabel, closureStatusLabels, coverageLevelLabels, eligibleResolution, resolutionEvidenceIds } from '@/lib/secretClosure'
import { idempotencyFor, safeMutationMessage } from '@/lib/secretEvidence'
import { scanDate } from '@/lib/secretScan'

export interface ResponsePanelProps { detail: SecretCaseDetail; onReload: () => void; onStale: () => void; disabled: boolean; onCompleted?: (kind: string, runId?: number, canViewRun?: boolean) => void }
export function useResponseCommandFailure(onStale: () => void) {
  return (error: Error) => { if (error instanceof ApiError && [403, 409].includes(error.status)) onStale() }
}
function LocationGroup({ label, group }: { label: string; group: ClosureLocationGroup | null | undefined }) {
  if (!group) return null
  return <details className="secret-response-disclosure"><summary>{label} · 허용된 위치 {group.visibleCount}곳</summary>{group.items.length === 0 ? <p className="caption">현재 열람 범위의 해당 위치가 없어요.</p> : <ul className="secret-investigation-history">{group.items.map((location) => <li key={location.occurrenceId}><strong>{location.safeLocationLabel}</strong>{location.reasonCode && <span>{closureReasonLabel(location.reasonCode)}</span>}</li>)}</ul>}</details>
}
function ResolutionForm({ checks, detail, onReload, onStale, disabled }: ResponsePanelProps & { checks: ClosureChecks }) {
  const [level, setLevel] = useState(''), [confirmed, setConfirmed] = useState(false)
  const key = useRef({ payload: '', key: '' })
  const failure = useResponseCommandFailure(onStale)
  const resolution = useMutation({ mutationFn: () => { const body = { decision: 'RESOLVE' as const, expectedCaseVersion: detail.version, closureCheckVersion: checks.closureCheckVersion!, evidenceIds: resolutionEvidenceIds(checks, level), coverageLevel: level }; return resolveSecretResponse(detail.caseId, { ...body, idempotencyKey: idempotencyFor(key, body) }) }, onSuccess: onReload, onError: failure })
  const levels = checks.allowedCoverageLevels.filter((value) => Object.hasOwn(coverageLevelLabels, value))
  const option = checks.coverageOptions.find((item) => item.level === level)
  return <section className="secret-governance-form"><h3>해결 확인</h3><p className="caption">서버가 확인한 수준만 선택할 수 있어요. 누락·미판정 위치를 임의로 제외할 수 없어요.</p><label>확인 수준<select className="select" value={level} onChange={(e) => { setLevel(e.target.value); setConfirmed(false) }}><option value="">확인 수준 선택</option>{levels.map((value) => <option key={value} value={value}>{coverageLevelLabels[value]}</option>)}</select></label>{level === 'LIMITED' && <p className="notice">수동 근거와 확인한 범위 안에서만 종료해요. 공급자 폐기 상태의 자동 확인은 포함되지 않아요.</p>}{level === 'SIMULATION' && <p className="notice">입증된 합성 표본의 사용 종료 근거예요. 실제 공급자 키의 폐기 확인은 별도로 필요해요.</p>}{option?.limitations.length ? <ul className="caption">{option.limitations.map((code) => <li key={code}>{closureReasonLabel(code)}</li>)}</ul> : null}<label className="secret-check-label"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> 위치별 확인 결과와 선택한 수준의 한계를 확인했어요.</label><button className="btn primary" disabled={disabled || resolution.isPending || !eligibleResolution(checks, detail.version, level, confirmed)} onClick={() => resolution.mutate()}>{resolution.isPending ? '저장 중…' : '해결 확인 저장'}</button>{resolution.isError && <p className="notice error" role="alert">{safeMutationMessage(resolution.error)}</p>}</section>
}
export function SecretCaseClosure(props: ResponsePanelProps) {
  const { detail, onReload } = props
  const checks = useQuery({ queryKey: ['secret-case-closure', detail.caseId], queryFn: () => fetchClosureChecks(detail.caseId), retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false })
  if (checks.isPending) return <p role="status">현재 해결 조건을 확인하는 중이에요.</p>
  if (checks.isError) return <div className="notice error" role="alert"><p>해결 조건을 불러오지 못했어요. 미발견 기록만으로 해결을 판단하지 않아요.</p><button className="btn outline" onClick={() => void checks.refetch()}>조건 다시 조회</button></div>
  const data = checks.data
  if (data.caseId !== detail.caseId) return <p className="notice error" role="alert">해결 조건의 대상이 현재 대응 건과 다릅니다.</p>
  const current = data.caseVersion === detail.version
  return <section><div className="secret-response-section-heading"><h3>현재 해결 조건</h3><span className="caption">확인 {scanDate(data.checkedAt)}</span></div>{data.restrictedCoverage && <p className="notice">허용된 위치의 근거만 보여요. 건 전체의 해결에는 모든 필수 위치에 권한 있는 보안 담당자의 확인이 필요해요.</p>}{data.caseVersion !== null && !current && <p className="notice error" role="alert">대응 건이 변경됐어요. <button className="btn outline" onClick={onReload}>현재 근거 다시 확인</button></p>}
    {data.lastResolution && <section className="secret-response-stored-decision"><h4>저장된 해결 판단</h4><p><strong>{coverageLevelLabels[data.lastResolution.coverageLevel] ?? '과거 해결 · 확인 수준 미기록'}</strong> · {scanDate(data.lastResolution.decidedAt)}</p>{data.lastResolution.coverageLevel === 'LIMITED' && <p className="caption">저장 당시의 제한 확인이에요. 공급자 폐기를 자동 검증했다는 뜻은 아니에요.</p>}{data.lastResolution.coverageLevel === 'SIMULATION' && <p className="caption">입증된 합성 표본의 사용 종료 근거예요. 실제 공급자 키의 해결에는 별도 근거가 필요해요.</p>}{data.lastResolution.coverageLevel === 'UNKNOWN_LEGACY' && <p className="notice">과거 기록의 검증 근거를 확인할 수 없어요. 현재 기준의 해결로 재해석하지 않아요.</p>}{data.lastResolution.limitations.length > 0 && <ul className="caption">{data.lastResolution.limitations.map((code) => <li key={code}>{closureReasonLabel(code)}</li>)}</ul>}</section>}
    {data.lastDismissal && <section className="secret-response-stored-decision"><h4>저장된 교정 종료</h4><p>{closureReasonLabel(data.lastDismissal.reasonCode)} · {scanDate(data.lastDismissal.decidedAt)}</p><p className="caption">해결·위험 수용과 별도이며 원래 판정과 조치 기록은 보존돼요.</p></section>}
    <div className="table-scroll" tabIndex={0} role="region" aria-label="대응 건 해결 조건"><table><thead><tr><th>확인 조건</th><th>결과</th><th>필요한 근거·한계</th></tr></thead><tbody>{data.closureChecks.map((check, index) => <tr key={`${check.code}:${check.occurrenceId ?? index}`}><td>{closureCheckLabels[check.code] ?? '해결 조건'}{check.occurrenceId && <span className="asset">위치 #{check.occurrenceId}</span>}</td><td>{closureStatusLabels[check.status] ?? '확인 필요'}</td><td>{closureReasonLabel(check.reasonCode)}</td></tr>)}</tbody></table></div>
    {data.canResolve && data.capabilities.canResolve && current && data.allowedCoverageLevels.length > 0 ? <ResolutionForm key={`${data.closureCheckVersion}:${detail.version}`} {...props} checks={data} /> : <p className="notice">현재 근거와 권한으로 해결을 확정할 수 없어요. 위의 부족한 근거를 확인하세요.</p>}
    <LocationGroup label="필수 대응 위치" group={data.requiredResponseLocations} /><LocationGroup label="아직 건에 연결하지 않은 노출" group={data.unlinkedAbnormalLocations} /><LocationGroup label="현재 미판정 위치" group={data.unassessedCurrentLocations} /><LocationGroup label="보관 허용·메타데이터" group={data.authorizedStorageLocations} /><LocationGroup label="과거 발견·현재 미발견" group={data.historicalMissingLocations} />{data.otherOriginNotice && <p className="caption">다른 출처의 결과는 이 대응 건의 해결에 합산하지 않아요.</p>}
  </section>
}
