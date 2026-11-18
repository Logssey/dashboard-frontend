import type { ReachFindingListItem } from '@/api/reach'
import { nearestFixedVersion, packageGroup } from '@/lib/reach'
import { l3DiffersFromL2 } from '@/lib/reachL3'
import { labelOf, reachNotAnalyzedReasonLabel, reachResetReasonLabel, reachStatusLabel } from '@/lib/reachLabels'
import { ReachDeploymentBadge, ReachL3Badge, ReachMethodTag, ReachReviewBadge, ReachSeverityChip, ReachStatusBadge } from './ReachBadges'

/** 근거 요약 칸: 분석 대상 아님은 사유를 쓰고, 판정 제안이 있으면 "제안(확정 대기)"와 함께 쓴다 (SCR-02 열 정의) */
export function reachEvidenceText(item: ReachFindingListItem): string {
  const { verdict, review } = item
  const base =
    verdict.status === 'NOT_ANALYZED' && verdict.notAnalyzedReason
      ? `${labelOf(reachNotAnalyzedReasonLabel, verdict.notAnalyzedReason)}. ${verdict.summary}`
      : verdict.summary
  if (!review.proposal) return base
  return `${base} · 제안(확정 대기): ${labelOf(reachStatusLabel, review.proposal.status)} — ${review.proposal.summary}`
}

/** SCR-02 Finding 표. 같은 CVE라도 패키지 사본이 다르면 다른 행이다 */
export function ReachFindingTable({ items, onSelect }: { items: ReachFindingListItem[]; onSelect: (id: number) => void }) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Finding 표. 좁은 화면에서는 가로로 스크롤하세요.">
      <table className="reach-table">
        <thead>
          <tr>
            <th scope="col">심각도</th>
            <th scope="col">CVE</th>
            <th scope="col">패키지·버전</th>
            <th scope="col">상태</th>
            <th scope="col">방식</th>
            <th scope="col">검토</th>
            <th scope="col">배포</th>
            <th scope="col" title="L3: 이미지를 실제로 띄워 시나리오를 보냈을 때 취약 코드가 실행됐는지. 판정을 바꾸지 않는 근거예요">실행</th>
            <th scope="col">근거 요약</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const fix = nearestFixedVersion(item.component.version, item.vulnerability.fixedVersions)
            return (
              <tr key={item.id} className="reach-row" onClick={() => onSelect(item.id)}>
                <td>
                  <ReachSeverityChip severity={item.vulnerability.severity} />
                </td>
                <td>
                  <button
                    type="button"
                    className="finding-link reach-cve"
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelect(item.id)
                    }}
                  >
                    {item.vulnerability.id}
                  </button>
                </td>
                <td title={item.component.purl}>
                  <strong>{item.component.name}</strong>
                  <span className="caption reach-group"> · {packageGroup(item.component.purl)}</span>
                  <span className="asset">
                    {item.component.version}
                    {fix ? ` → ${fix}` : ''}
                  </span>
                </td>
                <td>
                  <ReachStatusBadge status={item.verdict.status} />
                </td>
                <td>
                  <ReachMethodTag method={item.verdict.method} />
                </td>
                <td>
                  <ReachReviewBadge state={item.review.reviewState} />
                  {item.review.disagreesWithTool && <span className="badge reach-flag">≠ 불일치</span>}
                  {item.review.resetReason && (
                    <span className="badge reach-flag">{labelOf(reachResetReasonLabel, item.review.resetReason)}</span>
                  )}
                </td>
                <td>
                  <ReachDeploymentBadge deployment={item.deployment} />
                </td>
                <td>
                  <ReachL3Badge l3={item.l3} />
                  {l3DiffersFromL2(item.verdict.status, item.l3) && <span className="badge reach-flag differs">≠ 판정</span>}
                </td>
                <td>
                  <div className="reach-evidence-cell">{reachEvidenceText(item)}</div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
