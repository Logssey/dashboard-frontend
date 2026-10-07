import type { PriorityFinding } from '@/api/types'
import { environmentLabel, severityLabel, severityTone } from '@/lib/labels'
import { Badge } from './Badge'

/** 자산 칸: "이름 · 종류", 자산이 없으면 빈칸 (02 기능 설계 3.5) */
export function assetText(finding: PriorityFinding): string {
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
            return (
              <tr key={item.eventId}>
                <td>
                  <Badge label={severityLabel[item.severity]} tone={severityTone[item.severity]} />
                </td>
                <td>
                  <button className="finding-link" onClick={() => onSelect(item)}>
                    {item.title}
                  </button>
                  <span className="asset">{assetText(item)}</span>
                </td>
                <td>{environmentLabel[item.environment]}</td>
                <td className="muted">{item.ownerTeam}</td>
                <td>
                  <span className={`status ${reviewed ? 'done' : ''}`.trim()}>{reviewed ? '검토 완료' : '미검토'}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
