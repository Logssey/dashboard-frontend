import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/Badge'
import { EmptyState } from '@/components/EmptyState'
import { fetchIacRemediations } from './api'
import { remediationText } from './labels'

/** 할 수 있는 조치 (S-01 G). 많이 끊는 순서. 수정 PR 생성은 다음 단계(FR-D2) */
export function RemediationSection() {
  const remediations = useQuery({ queryKey: ['iac', 'remediations'], queryFn: fetchIacRemediations })

  return (
    <section className="card list-card" aria-labelledby="iac-remediations-title">
      <div className="card-head">
        <h2 id="iac-remediations-title">할 수 있는 조치</h2>
        <span className="caption">많은 경로를 끊는 순서</span>
      </div>
      {remediations.isPending ? (
        <div className="iac-card-body"><div className="skeleton" /></div>
      ) : remediations.isError ? (
        <p className="notice error iac-card-body">조치 목록을 불러오지 못했어요.</p>
      ) : remediations.data.length === 0 ? (
        <EmptyState title="제안할 조치 없음" description="열린 경로와 State 읽기 주체에서 끊을 지점을 찾지 못했어요." />
      ) : (
        <div className="table-scroll" tabIndex={0} role="region" aria-label="조치 표. 좁은 화면에서는 가로로 스크롤하세요.">
          <table>
            <thead>
              <tr>
                <th scope="col">조치</th>
                <th scope="col">끊는 경로</th>
                <th scope="col">방법</th>
                <th scope="col">출처</th>
              </tr>
            </thead>
            <tbody>
              {remediations.data.map((item) => {
                const text = remediationText(item.templateKey)
                return (
                  <tr key={item.action}>
                    <td><strong>{text.title}</strong></td>
                    <td>
                      <div className="row">
                        <span>{item.pathsCut}개</span>
                        {item.tier1PathsCut > 0 && <Badge label={`1등급 ${item.tier1PathsCut}`} tone="critical" />}
                      </div>
                    </td>
                    <td className="muted">{text.how}</td>
                    <td><Badge label={item.source === 'STATE' ? 'State' : '경로'} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
