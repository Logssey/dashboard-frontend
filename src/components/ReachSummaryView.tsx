import { securitySeverityLabel } from '@/lib/securityLabels'
import type { ReactNode } from 'react'
import type { ReachDeployment, ReachReviewState, ReachSeverity, ReachStatus, ReachSummary } from '@/api/reach'
import { formatKst, fraction, judgedCount, matrixCell, notAnalyzedReasonParts } from '@/lib/reach'
import {
  reachDeploymentLabel,
  reachDeploymentOrder,
  reachNotAnalyzedReasonLabel,
  reachReviewLabel,
  reachReviewOrder,
  reachSeverityOrder,
  reachStatusLabel,
  reachStatusOrder,
} from '@/lib/reachLabels'
import { ReachReviewBadge, ReachStatusBadge } from './ReachBadges'
import { VULNERABILITY_SCANS_PATH, VULNERABILITY_WORKLOADS_PATH } from '@/lib/reachRoutes'

/** 요약에서 목록으로 넘어갈 때 거는 필터 */
export interface ReachSummaryLink {
  status?: ReachStatus[]
  severity?: ReachSeverity[]
  reviewState?: ReachReviewState[]
  deployment?: ReachDeployment[]
}

/** 배포 상태 칸 설명 (API-08 byDeployment, PRD FR-04) */
const deploymentHint: Record<ReachDeployment, string> = {
  RUNNING: '운영에서 실행 중인 이미지에 있음',
  NOT_RUNNING: '실행 중인 이미지에 없음',
  UNKNOWN: '수집이 오래됐거나 확인할 수 없음',
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
export function ReachSummaryView({ summary, onOpen, onNavigate, scanAction }: {
  summary: ReachSummary
  onOpen: (link: ReachSummaryLink) => void
  /** 워크로드·검사 화면으로 이동. 없으면 이동 버튼을 그리지 않는다 */
  onNavigate?: (path: string) => void
  /** 기준 검사 줄마다 붙일 버튼 ([다시 대조]). 기준 검사는 모두 PR이 아닌 성공 검사이다 */
  scanAction?: (scanId: number) => ReactNode
}) {
  const { byStatus } = summary
  const judged = judgedCount(byStatus)
  const reasons = notAnalyzedReasonParts(summary.byNotAnalyzedReason, reachNotAnalyzedReasonLabel)
  const judgedDescription =
    judged === 0
      ? '판정한 취약점 없음'
      : byStatus.UNREACHABLE === judged
        ? '모두 취약 조건 미충족'
        : `호출 가능 ${byStatus.REACHABLE} · 미확인 ${byStatus.UNKNOWN} · 취약 조건 미충족 ${byStatus.UNREACHABLE}`
  const severityParts = reachSeverityOrder
    .filter((severity) => summary.bySeverity[severity] > 0)
    .map((severity) => `${securitySeverityLabel[severity] ?? severity} ${summary.bySeverity[severity]}`)

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
          label="호출 가능"
          value={byStatus.REACHABLE}
          description={byStatus.REACHABLE > 0 ? `먼저 고칠 것 · 판정한 ${judged}건 중` : `판정한 ${judged}건 중`}
          alert={byStatus.REACHABLE > 0}
          onClick={() => onOpen({ status: ['REACHABLE'] })}
        />
        <KpiCard label="판단 정보 부족" value={byStatus.UNKNOWN} description="추가 정보 확인 필요" onClick={() => onOpen({ status: ['UNKNOWN'] })} />
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
            <h2>상태 × 위험도</h2>
            <span className="caption">칸을 누르면 그 조건의 취약점을 봐요</span>
          </div>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="판정 상태와 위험도별 취약점 수">
            <table className="reach-matrix">
              <thead>
                <tr>
                  <th scope="col">상태</th>
                  {reachSeverityOrder.map((severity) => (
                    <th key={severity} scope="col">{securitySeverityLabel[severity] ?? severity}</th>
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
            <h2>담당자 검토</h2>
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
            검토 상태는 도구 판정을 바꾸지 않아요. 확정·임시 판단은 사람이 근거를 보고 남긴 기록이에요.
          </p>
        </section>
      </div>

      <section className="card">
        <div className="card-head reach-flow-head">
          <h2>판정 흐름</h2>
          <span className="caption">
            분석한 취약점 비율 <strong>{fraction(summary.coverage.judged, summary.coverage.total)}</strong>
            {' · '}
            취약 조건이 성립하지 않는 비율 <strong>{fraction(summary.noiseReduction.unreachable, summary.noiseReduction.judged)}</strong>
          </span>
        </div>
        <div className="reach-flow">
          <button type="button" className="reach-flow-box" onClick={() => onOpen({})}>
            <span className="caption">스캐너 결과</span>
            <strong>{summary.totals.findings}건</strong>
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
            <span className="caption">호출 가능</span>
            <strong>{byStatus.REACHABLE}건</strong>
            <span className="caption">먼저 고칠 것</span>
          </button>
        </div>
        <button type="button" className="reach-flow-box reach-flow-branch" onClick={() => onOpen({ status: ['NOT_ANALYZED'] })}>
          <span className="caption">분석 대상 아님</span>
          <strong>{byStatus.NOT_ANALYZED}건</strong>
          <span className="caption">{reasons.join(' · ') || '—'}</span>
        </button>
        <p className="caption reach-note">
          분석한 취약점 비율은 전체 취약점 중 분석 결과가 있는 비율입니다. 취약 조건이 성립하지 않는 비율은 분석한 취약점만 기준으로 계산하며, 분석하지 못한 항목은 제외합니다.
        </p>
      </section>

      <div className="reach-summary-grid">
        <section className="card">
          <h2>이미지 실행 상태</h2>
          <div className="reach-flow reach-summary-deployment">
            {reachDeploymentOrder.map((deployment) => (
              <button key={deployment} type="button" className="reach-flow-box" onClick={() => onOpen({ deployment: [deployment] })}>
                <span className="caption">{reachDeploymentLabel[deployment]}</span>
                <strong>{summary.byDeployment[deployment] ?? 0}건</strong>
                <span className="caption">{deploymentHint[deployment]}</span>
              </button>
            ))}
          </div>
          <p className="caption">클러스터 수집기가 조회한 실행 중 이미지(digest)와 검사한 이미지를 맞춰 본 결과예요.</p>
          {onNavigate && (
            <button type="button" className="btn outline small" onClick={() => onNavigate(VULNERABILITY_WORKLOADS_PATH)}>
              워크로드 보기
            </button>
          )}
        </section>
        <section className="card">
          <h2>검사 정보</h2>
          {summary.scope.scanId != null ? (
            <p className="caption">이 요약은 검사 #{summary.scope.scanId} 기준이에요. 집계 {formatKst(summary.generatedAt)}</p>
          ) : summary.basis?.scans.length ? (
            <ul className="reach-basis-scans">
              {summary.basis.scans.map((scan) => (
                <li key={scan.scanId}>
                  <strong>{scan.app}</strong> {scan.targetType === 'IMAGE' ? '이미지' : '저장소'}{' '}
                  {onNavigate ? (
                    <button type="button" className="btn soft small" onClick={() => onNavigate(`${VULNERABILITY_SCANS_PATH}?scan=${scan.scanId}`)}>
                      검사 #{scan.scanId}
                    </button>
                  ) : (
                    `검사 #${scan.scanId}`
                  )}
                  <span className="caption"> · {scan.running ? '운영에서 실행 중' : scan.targetType === 'IMAGE' ? '최신 빌드(실행 중 아님·모름)' : '최신 커밋'}</span>
                  {scanAction && <span className="reach-basis-action">{scanAction(scan.scanId)}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="caption">앱·대상 종류마다 PR이 아닌 최신 성공 검사를 모아 집계했어요. 집계 {formatKst(summary.generatedAt)}</p>
          )}
          {onNavigate && (
            <div className="row">
              {summary.scope.scanId != null && (
                <button type="button" className="btn outline small"
                  onClick={() => onNavigate(`${VULNERABILITY_SCANS_PATH}?scan=${summary.scope.scanId}`)}>
                  검사 #{summary.scope.scanId} 상세
                </button>
              )}
              <button type="button" className="btn outline small" onClick={() => onNavigate(VULNERABILITY_SCANS_PATH)}>
                검사 이력
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
