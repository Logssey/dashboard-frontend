import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/Badge'
import { fetchIacGates } from './api'
import { formatDateTime, ruleTitle } from './labels'

/** ② plan 전 검사 (S-01 E). 관문은 순서대로 돌고 하나라도 차단되면 뒤 관문은 돌지 않는다 */
export function GateSection() {
  const gates = useQuery({ queryKey: ['iac', 'gates'], queryFn: fetchIacGates })
  const data = gates.data
  const checked = data?.mainCheckedAt != null

  return (
    <section className="card list-card" aria-labelledby="iac-gates-title">
      <div className="card-head">
        <h2 id="iac-gates-title">② plan 전 검사</h2>
        <span className="caption">main 기준 {formatDateTime(data?.mainCheckedAt ?? null)} · PR 차단은 최근 7일</span>
      </div>
      {gates.isPending ? (
        <div className="iac-card-body"><div className="skeleton" /></div>
      ) : gates.isError || !data ? (
        <p className="notice error iac-card-body">관문 상태를 불러오지 못했어요.</p>
      ) : (
        <div className="iac-card-body">
          {!checked && <p className="notice">main 브랜치 검사 기록이 아직 없어요. main 위반 수는 PR 검사만으로는 알 수 없어요.</p>}
          <ol className="iac-gates">
            {data.stages.map((stage) => (
              <li key={stage.stage}>
                <div className="row">
                  <span className="caption">관문 {stage.stage}</span>
                  {!checked ? (
                    <Badge label="기록 없음" />
                  ) : stage.mainOpen > 0 ? (
                    <Badge label={`main 위반 ${stage.mainOpen}`} tone="critical" />
                  ) : (
                    <Badge label="main 통과" tone="success" />
                  )}
                </div>
                <strong>{stage.name}</strong>
                <span className="caption">PR 차단 {stage.prBlocked7d}건</span>
                <ul className="iac-gate-rules">
                  {stage.ruleIds.map((id) => <li key={id} title={id}>{ruleTitle[id] ?? id}</li>)}
                </ul>
              </li>
            ))}
          </ol>
          <h3 className="iac-supply">공급망 요약 (main)</h3>
          <dl className="facts iac-facts-wide">
            <dt>버전 미고정 프로바이더</dt>
            <dd>{checked ? data.supplyChain.unpinnedProviders : '—'}</dd>
            <dt>버전 미고정 모듈</dt>
            <dd>{checked ? data.supplyChain.unpinnedModules : '—'}</dd>
            <dt>내용이 바뀐 모듈</dt>
            <dd>{checked ? data.supplyChain.changedModules : '—'}</dd>
            <dt>lock 파일 변경</dt>
            <dd>{checked ? data.supplyChain.lockChanges : '—'}</dd>
          </dl>
        </div>
      )}
    </section>
  )
}
