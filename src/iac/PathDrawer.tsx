import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/Badge'
import { EmptyState } from '@/components/EmptyState'
import { fetchIacPath } from './api'
import { formatDateTime, hopLabel, remediationText, severityLabel, severityTone, tierLabel } from './labels'

/**
 * 열린 경로 상세 (S-01 C). 단계마다 다음 단계로 가는 관계를 보여주고, 끊을 수 있는 관계에 수정 방법을 붙인다.
 * 수정 PR 생성은 다음 단계(FR-D2)라 안내만 한다.
 */
export function PathDrawer({ pathId }: { pathId: number | null; onClose: () => void }) {
  const detail = useQuery({
    queryKey: ['iac', 'path', pathId],
    queryFn: () => fetchIacPath(pathId!),
    enabled: pathId !== null,
  })


  const path = detail.data?.path
  const cutPoints = detail.data?.cutPoints ?? []

  return (
    <section className="card security-detail-content">
      {pathId !== null && (
        <>
          <div className="drawer-head">
            <h2 id="iac-path-title">공격 경로 상세</h2>
          </div>

          <div className="drawer-body">
            {detail.isPending ? (
              <div className="skeleton" />
            ) : detail.isError || !path ? (
              <p className="notice error" role="alert">경로 상세를 불러오지 못했어요.</p>
            ) : (
              <>
                <div className="row">
                  <span className="caption">경로 #{path.pathId}</span>
                  <Badge label={severityLabel[path.severity]} tone={severityTone[path.severity]} />
                  <Badge label={tierLabel(path.tier)} tone={path.tier === 1 ? 'critical' : 'high'} />
                </div>
                <dl className="facts">
                  <dt>대상</dt>
                  <dd>{path.target.kind}</dd>
                  <dt>처음 확인</dt>
                  <dd>{formatDateTime(path.firstSeenAt)}</dd>
                  <dt>마지막 확인</dt>
                  <dd>{formatDateTime(path.lastSeenAt)}</dd>
                </dl>

                <section>
                  <h3>연결된 자산과 접근 순서</h3>
                  <ol className="iac-steps">
                    {path.hops.map((hop, index) => {
                      const label = hopLabel(hop)
                      const cut = cutPoints.find((point) => point.fromHop === index)
                      return (
                        <li key={`${hop.id}-${index}`}>
                          <span className="iac-hop" title={hop.id}>
                            <b>{label.kind}</b>
                            {label.name && <span>{label.name}</span>}
                          </span>
                          {cut && <Badge label="↓ 다음 자산으로의 접근 제한 가능" tone="primary" />}
                        </li>
                      )
                    })}
                  </ol>
                </section>

                <section>
                  <h3>수정할 지점</h3>
                  {cutPoints.length === 0 ? (
                    <EmptyState title="수정 방법 준비 중" description="이 경로에 맞는 수정 방법은 아직 제공되지 않습니다." />
                  ) : (
                    <ul className="iac-cuts">
                      {cutPoints.map((point) => {
                        const text = remediationText(point.templateKey)
                        const from = hopLabel(path.hops[point.fromHop]).kind
                        const to = hopLabel(path.hops[point.toHop]).kind
                        return (
                          <li key={`${point.fromHop}-${point.action}`}>
                            <span className="caption">{from} → {to}</span>
                            <strong>{text.title}</strong>
                            <p className="muted">{text.how}</p>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>
                <p className="notice">수정 PR 만들기는 준비 중이에요. 위 방법대로 인프라 코드를 고쳐 PR 을 올리면 PR 검사에서 경로 변화를 확인할 수 있어요.</p>
              </>
            )}
          </div>

          <div className="drawer-foot">
          </div>
        </>
      )}
    </section>
  )
}
