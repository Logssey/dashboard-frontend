import { Link, useLocation } from 'react-router-dom'
import type { CaseFilters, SecretCaseItem } from '@/api/secretCases'
import { caseAssigneeLabel, caseDetailPath, caseStageLabels } from '@/lib/secretResponse'
import { scanDate } from '@/lib/secretScan'
import { validRemediationSummary } from './SecretRemediationSummary'

export function SecretActionList({ items, filters }: { items: SecretCaseItem[]; filters: CaseFilters }) {
  const location = useLocation()
  return <div className="table-scroll" role="region" aria-label="시크릿 조치 목록"><table>
    <thead><tr><th>대상</th><th>담당자</th><th>진행 상태</th><th>조치 후 검사</th><th>최근 기록</th></tr></thead>
    <tbody>{items.map(item => {
      const summary = item.remediationSummary
      return <tr key={item.caseId}>
        <td><Link id={`case-link-${item.caseId}`} className="finding-link" state={{ from: location.pathname + location.search }} to={caseDetailPath(item.caseId, filters)}>CASE-{item.caseId} · {item.maskedLabel}</Link><span className="asset">열람 가능한 위치 {item.visibleOccurrenceCount}곳</span></td>
        <td>{caseAssigneeLabel(item.assigneeDisplayName, item.assigneeTeam, item.assigneeUserId)}</td>
        <td>{caseStageLabels[item.stage] ?? '상태 확인 필요'}</td>
        <td>{validRemediationSummary(summary) ? <><span>미발견 {summary.postActionMissingLocationCount} / 필수 {summary.requiredLocationCount}곳</span><span className="asset">다시 발견 {summary.postActionRedetectedCount}곳 · {summary.restrictedCoverage ? '열람 범위 기준 · ' : ''}키 폐기 여부는 별도 확인</span></> : '상세 화면에서 확인'}</td>
        <td>{item.updatedAt ? scanDate(item.updatedAt) : '변경 시각 비공개'}</td>
      </tr>
    })}</tbody>
  </table></div>
}
