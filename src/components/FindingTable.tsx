import type { PriorityFinding } from '@/api/types'
import { partPriorityPath, priorityEnvironment, priorityFindingKey, prioritySeverity, priorityStatus, secretPriorityPath } from '@/lib/overviewPresentation'
import { Link } from 'react-router-dom'
import { Badge } from './Badge'

/** 자산 칸: "이름 · 종류", 자산이 없으면 빈칸 (02 기능 설계 3.5) */
export function assetText(finding: PriorityFinding): string {
  if (finding.sourceType === 'PART_FINDING') return [finding.displayId, finding.evidence].filter(Boolean).join(' · ')
  return finding.asset ? `${finding.asset.name} · ${finding.asset.assetType}` : ''
}

export function FindingTable({ items, onSelect }: { items: PriorityFinding[]; onSelect: (finding: PriorityFinding) => void }) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="탐지 결과 표. 좁은 화면에서는 가로로 스크롤하세요.">
      <table>
        <thead>
          <tr>
            <th scope="col">심각도</th>
            <th scope="col">탐지 내용 / 자산</th>
            <th scope="col">환경</th>
            <th scope="col">담당 팀</th>
            <th scope="col">상태</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const reviewed = item.reviewStatus === 'REVIEWED'
            const grade = prioritySeverity(item), secretPath = secretPriorityPath(item) ?? partPriorityPath(item)
            return (
              <tr key={priorityFindingKey(item)}>
                <td>
                  <Badge label={grade.label} tone={grade.tone} />
                </td>
                <td>
                  {secretPath ? <Link className="finding-link" to={secretPath}>{item.title}</Link> : item.sourceType === 'SECRET_CASE' || item.sourceType === 'PART_FINDING' ? <span>{item.title}</span> : <button className="finding-link" onClick={() => onSelect(item)}>
                    {item.title}
                  </button>}
                  <span className="asset">{assetText(item)}</span>
                </td>
                <td>{priorityEnvironment(item.environment)}</td>
                <td className="muted">{item.ownerTeam}</td>
                <td>
                  <span className={`status ${reviewed && item.sourceType !== 'SECRET_CASE' ? 'done' : ''}`.trim()}>{priorityStatus(item)}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
