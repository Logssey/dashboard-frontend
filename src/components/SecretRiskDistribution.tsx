import { Link } from 'react-router-dom'
import type { CaseRiskSeverity, WorkbenchFilters, WorkbenchSummary } from '@/api/secretSummary'
import { caseRiskQueuePath, caseRiskSeverityLabels, caseRiskValidityLabels, riskSeverities, riskValidities, validRiskCount } from '@/lib/secretRiskDistribution'
import { summaryReason } from '@/lib/secretWorkbench'
import './secret-risk-distribution.css'

export function SecretRiskDistribution({ summary, filters }: { summary: WorkbenchSummary; filters: WorkbenchFilters }) {
  const cases = summary.caseSummary, matrix = cases.severityValidityMatrix
  const grades = riskSeverities.filter((grade) => grade !== 'NOT_APPLICABLE')
  const available = cases.severityStatus === 'AVAILABLE' && !!cases.severityCounts && grades.every((grade) => validRiskCount(cases.severityCounts?.[grade]))
  const matrixAvailable = available && matrix?.status === 'AVAILABLE' && matrix.unit === 'ResponseCase' && matrix.scope === 'currentCases' && Array.isArray(matrix.cells)
    && riskSeverities.every((severity) => riskValidities.every((validity) => matrix.cells.filter((cell) => cell.severity === severity && cell.validity === validity).length === 1 && validRiskCount(matrix.cells.find((cell) => cell.severity === severity && cell.validity === validity)?.value)))
  const maximum = Math.max(1, ...grades.map((grade) => cases.severityCounts?.[grade] ?? 0))
  const excluded = cases.notApplicableCaseCount
  const valueLink = (value: number, severity: CaseRiskSeverity, validity?: typeof riskValidities[number]) => value > 0 ? <Link to={caseRiskQueuePath(filters, summary.snapshotId, severity, validity)} aria-label={`${caseRiskSeverityLabels[severity]}${validity ? ` · ${caseRiskValidityLabels[validity]}` : ''} 대응 ${value}건 보기`}>{value}<span className="secret-risk-count-unit">건</span></Link> : <span className="secret-risk-zero">0<span className="secret-risk-count-unit">건</span></span>
  return <section className="secret-risk-distribution" aria-label="대응 위험 분포">
    <article className="card secret-risk-grade-chart"><div className="secret-overview-section-title"><div><h2>어떤 위험부터 확인할까요?</h2><p>현재 대응 건의 적용 등급이에요.</p></div><span className="secret-risk-unit">대응 건 기준</span></div>
      {!available ? <p className="secret-risk-unavailable">{summaryReason(cases.severityStatus)}</p> : <><ul className="secret-risk-grade-list">{grades.map((grade) => { const value = cases.severityCounts![grade]; return <li key={grade} className={`risk-${grade.toLowerCase()}`}><span>{caseRiskSeverityLabels[grade]}</span><div className="secret-risk-grade-track"><span style={{ width: `${100 * value / maximum}%` }} /></div>{valueLink(value, grade)}</li> })}</ul>
      {validRiskCount(excluded) && excluded > 0 && <p className="secret-risk-excluded">심각도 평가 대상 외 {valueLink(excluded, 'NOT_APPLICABLE')} <span>등급 분포에서 제외해요.</span></p>}
      <p className="caption">미평가는 낮은 위험을 뜻하지 않아요. 유지 중인 등급은 상세에서 근거를 확인하세요.</p></>}
    </article>
    <article className="card secret-risk-matrix"><div className="secret-overview-section-title"><div><h2>심각도와 키 유효성</h2><p>숫자를 누르면 같은 기준의 대응 건을 열어요.</p></div></div>
      {!matrixAvailable || !matrix ? <p className="secret-risk-unavailable">{summaryReason(matrix?.status)}</p> : <><div className="table-scroll" tabIndex={0} role="region" aria-label="심각도와 키 유효성별 대응 건수"><table><thead><tr><th scope="col">심각도</th>{riskValidities.map((validity) => <th scope="col" key={validity}>{caseRiskValidityLabels[validity]}</th>)}</tr></thead><tbody>{riskSeverities.map((severity) => <tr key={severity} className={`risk-${severity.toLowerCase()}`}><th scope="row">{caseRiskSeverityLabels[severity]}</th>{riskValidities.map((validity) => <td key={validity}>{valueLink(matrix.cells.find((cell) => cell.severity === severity && cell.validity === validity)!.value, severity, validity)}</td>)}</tr>)}</tbody></table></div><p className="caption">한 대응 건은 한 칸에만 집계해요. 유효성 확인은 노출·악용 판단과 별개예요.</p>{validRiskCount(matrix.staleValidationCaseCount) && matrix.staleValidationCaseCount > 0 && <p className="secret-risk-stale">검증 기한이 지난 {matrix.staleValidationCaseCount}건은 확인 불가에 포함해요.</p>}</>}
    </article>
  </section>
}
