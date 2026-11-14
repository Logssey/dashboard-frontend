import type { ReachReviewState, ReachSeverity, ReachStatus, ReachSummary } from '@/api/reach'
import { fraction, judgedCount, matrixCell, notAnalyzedReasonParts } from '@/lib/reach'
import {
  reachNotAnalyzedReasonLabel,
  reachReviewLabel,
  reachReviewOrder,
  reachSeverityOrder,
  reachStatusLabel,
  reachStatusOrder,
} from '@/lib/reachLabels'
import { ReachReviewBadge, ReachStatusBadge } from './ReachBadges'

/** 요약에서 목록으로 넘어갈 때 거는 필터 */
export interface ReachSummaryLink {
  status?: ReachStatus[]
  severity?: ReachSeverity[]
  reviewState?: ReachReviewState[]
}

function KpiCard({ label, value, description, alert = false, onClick }: {
  label: string
  value: number
  description: string
  alert?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className={`card reach-kpi ${alert ? 'alert' : ''}`.trim()} onClick={onClick}>
      <span className="muted">{label}</span>
      <span className="metric-number">
        {value}
        <span className="unit">건</span>
      </span>
      <span className="caption">{description}</span>
    </button>
  )
}

/** SCR-01 요약. 숫자는 백엔드 요약(API-08)을 그대로 쓰고 0도 그대로 쓴다. "안전" 같은 문구를 쓰지 않는다 */
export function ReachSummaryView({ summary, onOpen }: { summary: ReachSummary; onOpen: (link: ReachSummaryLink) => void }) {
  const { byStatus } = summary
  const judged = judgedCount(byStatus)
  const reasons = notAnalyzedReasonParts(summary.byNotAnalyzedReason, reachNotAnalyzedReasonLabel)
  const judgedDescription =
    judged === 0
      ? '판정한 Finding 없음'
      : byStatus.UNREACHABLE === judged
        ? '모두 도달 불가'
        : `도달 가능 ${byStatus.REACHABLE} · 미확인 ${byStatus.UNKNOWN} · 도달 불가 ${byStatus.UNREACHABLE}`
  const severityParts = reachSeverityOrder
    .filter((severity) => summary.bySeverity[severity] > 0)
    .map((severity) => `${severity} ${summary.bySeverity[severity]}`)

  return (
    <div className="stack">
      <div className="reach-kpi-grid">
        <KpiCard
          label="판정 완료"
          value={judged}
          description={judgedDescription}
          onClick={() => onOpen({ status: ['REACHABLE', 'UNKNOWN', 'UNREACHABLE'] })}
        />
        <KpiCard
          label="도달 가능"
          value={byStatus.REACHABLE}
          description={byStatus.REACHABLE > 0 ? `먼저 고칠 것 · 판정한 ${judged}건 중` : `판정한 ${judged}건 중`}
          alert={byStatus.REACHABLE > 0}
          onClick={() => onOpen({ status: ['REACHABLE'] })}
        />
        <KpiCard label="미확인" value={byStatus.UNKNOWN} description="사람 확인 필요" onClick={() => onOpen({ status: ['UNKNOWN'] })} />
        <KpiCard
          label="분석 대상 아님"
          value={byStatus.NOT_ANALYZED}
          description={reasons.length ? reasons.join(' · ') : '없음'}
          onClick={() => onOpen({ status: ['NOT_ANALYZED'] })}
        />
      </div>

      <div className="reach-summary-grid">
        <section className="card list-card">
          <div className="card-head">
            <h2>상태 × 심각도</h2>
            <span className="caption">칸을 누르면 그 조건의 Finding을 봐요</span>
          </div>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="판정 상태와 심각도별 Finding 수">
            <table className="reach-matrix">
              <thead>
                <tr>
                  <th scope="col">상태</th>
                  {reachSeverityOrder.map((severity) => (
                    <th key={severity} scope="col">{severity}</th>
                  ))}
                  <th scope="col">합계</th>
                </tr>
              </thead>
              <tbody>
                {reachStatusOrder.map((status) => (
                  <tr key={status}>
                    <th scope="row">
                      <ReachStatusBadge status={status} />
                    </th>
                    {reachSeverityOrder.map((severity) => {
                      const count = matrixCell(summary, status, severity)
                      return (
                        <td key={severity}>
                          <button
                            type="button"
                            className="reach-cell"
                            disabled={count === 0}
                            aria-label={`${reachStatusLabel[status]} ${severity} ${count}건`}
                            onClick={() => onOpen({ status: [status], severity: [severity] })}
                          >
                            {count}
                          </button>
                        </td>
                      )
                    })}
                    <td className="reach-total">{byStatus[status]}</td>
                  </tr>
                ))}
                <tr className="reach-sum-row">
                  <th scope="row">합계</th>
                  {reachSeverityOrder.map((severity) => (
                    <td key={severity}>{summary.bySeverity[severity]}</td>
                  ))}
                  <td className="reach-total">{summary.totals.findings}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>사람 검토</h2>
          </div>
          <div className="reach-review-counts">
            {reachReviewOrder.map((state) => (
              <button key={state} type="button" className="reach-review-count" onClick={() => onOpen({ reviewState: [state] })}>
                <ReachReviewBadge state={state} />
                <strong>{summary.byReviewState[state]}</strong>
                <span className="caption">{reachReviewLabel[state]}</span>
              </button>
            ))}
          </div>
          <p className="caption reach-note">
            검토 상태는 도구 판정을 바꾸지 않아요. 확정·잠정은 사람이 근거를 보고 남긴 기록이에요.
          </p>
        </section>
      </div>

      <section className="card">
        <div className="card-head reach-flow-head">
          <h2>판정 흐름</h2>
          <span className="caption">
            판정 범위(M-02) <strong>{fraction(summary.coverage.judged, summary.coverage.total)}</strong>
            {' · '}
            노이즈 감소율(M-01) <strong>{fraction(summary.noiseReduction.unreachable, summary.noiseReduction.judged)}</strong>
          </span>
        </div>
        <div className="reach-flow">
          <button type="button" className="reach-flow-box" onClick={() => onOpen({})}>
            <span className="caption">스캐너 결과</span>
            <strong>{summary.totals.findings}행</strong>
            <span className="caption">{severityParts.join(' · ') || '—'}</span>
          </button>
          <span className="reach-flow-arrow" aria-hidden="true">→</span>
          <button
            type="button"
            className="reach-flow-box"
            onClick={() => onOpen({ status: ['REACHABLE', 'UNKNOWN', 'UNREACHABLE'] })}
          >
            <span className="caption">판정</span>
            <strong>{judged}건</strong>
            <span className="caption">{judgedDescription}</span>
          </button>
          <span className="reach-flow-arrow" aria-hidden="true">→</span>
          <button type="button" className="reach-flow-box" onClick={() => onOpen({ status: ['REACHABLE'] })}>
            <span className="caption">도달 가능</span>
            <strong>{byStatus.REACHABLE}건</strong>
            <span className="caption">먼저 고칠 것</span>
          </button>
        </div>
        <button type="button" className="reach-flow-box reach-flow-branch" onClick={() => onOpen({ status: ['NOT_ANALYZED'] })}>
          <span className="caption">분석 대상 아님</span>
          <strong>{byStatus.NOT_ANALYZED}행</strong>
          <span className="caption">{reasons.join(' · ') || '—'}</span>
        </button>
        <p className="caption reach-note">
          판정 범위 = 판정한 Finding ÷ 전체 Finding. 노이즈 감소율 = 도달 불가 ÷ 판정한 Finding. 분석 대상 아님은 줄었다고 세지 않아요.
        </p>
      </section>

      <div className="reach-summary-grid">
        <section className="card reach-unconnected">
          <h2>배포 상태(L1)</h2>
          <p className="caption">아직 연결되지 않았어요. 워크로드 조회(API-07)가 생기면 실행 중인 이미지와 스캔 대상을 비교해 보여줘요. (FR-04 [부분])</p>
        </section>
        <section className="card reach-unconnected">
          <h2>스캔 정보</h2>
          <p className="caption">아직 연결되지 않았어요. 스캔 상태(API-03)가 생기면 SBOM 생성 → CVE 대조 → L1 → L2 → 보고서 단계를 보여줘요. (FR-01 [계획])</p>
        </section>
      </div>
    </div>
  )
}
