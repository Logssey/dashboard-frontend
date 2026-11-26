import { Link } from 'react-router-dom'
import type { CaseRiskSeverity, WorkbenchFilters, WorkbenchSummary } from '@/api/secretSummary'
import { caseRiskQueuePath, caseRiskSeverityLabels, caseRiskValidityLabels, riskSeverities, riskValidities, validRiskCount } from '@/lib/secretRiskDistribution'
import { summaryReason, workbenchQueuePath } from '@/lib/secretWorkbench'
import './secret-risk-distribution.css'

export function SecretRiskDistribution({ summary, filters }: { summary: WorkbenchSummary; filters: WorkbenchFilters }) {
  const cases = summary.caseSummary
  const matrix = cases.severityValidityMatrix
  const grades = riskSeverities.filter((grade) => grade !== 'NOT_APPLICABLE')
  const available = cases.severityStatus === 'AVAILABLE' && !!cases.severityCounts
    && grades.every((grade) => validRiskCount(cases.severityCounts?.[grade]))
  const matrixAvailable = available && matrix?.status === 'AVAILABLE'
    && matrix.unit === 'ResponseCase' && matrix.scope === 'currentCases' && Array.isArray(matrix.cells)
    && riskSeverities.every((severity) => riskValidities.every((validity) => {
      const matchingCells = matrix.cells.filter((cell) => cell.severity === severity && cell.validity === validity)
      return matchingCells.length === 1 && validRiskCount(matchingCells[0].value)
    }))
  const gradedCount = available ? grades.reduce((total, grade) => total + cases.severityCounts![grade], 0) : null
  const maximum = Math.max(1, ...grades.map((grade) => cases.severityCounts?.[grade] ?? 0))
  const excluded = cases.notApplicableCaseCount
  const hasGradedCases = gradedCount !== null && gradedCount > 0
  const hasExcludedCases = validRiskCount(excluded) && excluded > 0
  const reviewPath = workbenchQueuePath(filters, 'REVIEW_REQUIRED', summary.snapshotId)

  const valueLink = (value: number, severity: CaseRiskSeverity, validity?: typeof riskValidities[number]) => value > 0
    ? <Link
        to={caseRiskQueuePath(filters, summary.snapshotId, severity, validity)}
        aria-label={`${caseRiskSeverityLabels[severity]}${validity ? ` · ${caseRiskValidityLabels[validity]}` : ''} 대응 ${value}건 보기`}
      >{value}<span className="secret-risk-count-unit">건</span></Link>
    : <span className="secret-risk-zero">0<span className="secret-risk-count-unit">건</span></span>

  return <section className="card secret-risk-distribution" aria-labelledby="secret-risk-title">
    <div className="secret-risk-heading">
      <h2 id="secret-risk-title">대응 건 위험도</h2>
      <p>현재 적용된 등급</p>
    </div>
    {!available ? <p className="secret-risk-unavailable">{summaryReason(cases.severityStatus)}</p> : <>
      {summary.partialCoverage === true && <p className="secret-risk-coverage">검사하지 못한 범위가 있어요. 최근 검사 상태에서 확인하세요.</p>}
      {summary.restrictedCoverage && <p className="secret-risk-coverage">열람 가능한 대응 건을 집계했어요.</p>}
      {hasGradedCases ? <>
        <ul className="secret-risk-grade-list" aria-label="위험도별 대응 건수">{grades.map((grade) => {
          const value = cases.severityCounts![grade]
          const content = <>
            <span className="secret-risk-grade-label">{caseRiskSeverityLabels[grade]}</span>
            <span className="secret-risk-grade-track" aria-hidden="true">
              <span style={{ width: `${100 * value / maximum}%` }} />
            </span>
            <span className="secret-risk-grade-value">{value}<span className="secret-risk-count-unit">건</span></span>
          </>
          return <li key={grade} className={`risk-${grade.toLowerCase()}`}>
            {value > 0 ? <Link
              className="secret-risk-grade-row"
              to={caseRiskQueuePath(filters, summary.snapshotId, grade)}
              aria-label={`${caseRiskSeverityLabels[grade]} 대응 ${value}건 보기`}
            >{content}</Link> : <span className="secret-risk-grade-row zero">{content}</span>}
          </li>
        })}</ul>
        <p className="caption">미평가 항목과 등급별 판단 근거는 상세에서 확인하세요.</p>
      </> : <div className="secret-risk-empty">
        <p>위험도를 집계할 대응 건이 없어요.</p>
        <Link to={reviewPath}>발견 검토 보기</Link>
      </div>}
      {hasExcludedCases && <p className="secret-risk-excluded">
        위험도 평가 대상 외 {valueLink(excluded, 'NOT_APPLICABLE')} <span>등급 분포에서 제외해요.</span>
      </p>}
      {(hasGradedCases || hasExcludedCases) && <details className="secret-risk-matrix">
        <summary>키 유효성별 상세 보기<span aria-hidden="true" /></summary>
        {!matrixAvailable || !matrix ? <p className="secret-risk-unavailable">{summaryReason(matrix?.status)}</p> : <>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="위험도와 키 유효성별 대응 건수">
            <table>
              <thead><tr>
                <th scope="col">위험도</th>
                {riskValidities.map((validity) => <th scope="col" key={validity}>{caseRiskValidityLabels[validity]}</th>)}
              </tr></thead>
              <tbody>{riskSeverities.map((severity) => <tr key={severity} className={`risk-${severity.toLowerCase()}`}>
                <th scope="row">{caseRiskSeverityLabels[severity]}</th>
                {riskValidities.map((validity) => <td key={validity}>
                  {valueLink(matrix.cells.find((cell) => cell.severity === severity && cell.validity === validity)!.value, severity, validity)}
                </td>)}
              </tr>)}</tbody>
            </table>
          </div>
          <p className="caption">한 대응 건은 한 칸에만 집계해요. 키 인증 확인은 노출·악용 판단과 별개예요.</p>
          {validRiskCount(matrix.staleValidationCaseCount) && matrix.staleValidationCaseCount > 0 && <p className="secret-risk-stale">
            검증 기한이 지난 {matrix.staleValidationCaseCount}건은 확인 불가에 포함해요.
          </p>}
        </>}
      </details>}
    </>}
  </section>
}
