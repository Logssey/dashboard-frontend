import { Fragment, useState } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/Badge'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { PageHeader } from '@/components/PageHeader'
import { fetchIacPaths, fetchIacPullRequests, fetchIacSummary, triggerIacJob } from './api'
import { GateSection } from './GateSection'
import { JobSection } from './JobSection'
import { PathDrawer } from './PathDrawer'
import { PullRequestDrawer } from './PullRequestDrawer'
import { RemediationSection } from './RemediationSection'
import { StateSection } from './StateSection'
import {
  IAC_POLICY_URL, formatDateTime, hopLabel, pullRequestBadge, pullRequestChanges, ruleTitle, severityLabel, severityTone, shortSha, tierLabel,
} from './labels'
import type { IacPath, IacPullRequestSummary, IacSeverity } from './types'
import './iac.css'

const severities: IacSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

function Loading() {
  return <div className="skeleton" />
}

/** 아직 계산하지 않는 지표는 0 이 아니라 — 로 둔다 */
function metricValue(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : value
}

/** IaC 보안 탭 (S-01, security-solution-docs iac-security dashboard-flow). 계산은 백엔드가 하고 화면은 보여주기만 한다 */
export function IacPage() {
  const summary = useQuery({ queryKey: ['iac', 'summary'], queryFn: fetchIacSummary })
  const paths = useInfiniteQuery({
    queryKey: ['iac', 'paths', 'OPEN'],
    queryFn: ({ pageParam }) => fetchIacPaths({ status: 'OPEN', cursor: pageParam }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
  })
  const openPaths = paths.data?.pages.flatMap((page) => page.items) ?? []
  const [selectedPathId, setSelectedPathId] = useState<number | null>(null)
  const pullRequests = useQuery({ queryKey: ['iac', 'prs'], queryFn: fetchIacPullRequests })
  const [selectedPr, setSelectedPr] = useState<number | null>(null)
  const queryClient = useQueryClient()
  // 수집(COLLECT_GRAPH)은 배포된 클러스터에서만 돌릴 수 있어, 지금 있는 그래프로 경로와 State 를 다시 계산한다
  const checkNow = useMutation({
    mutationFn: () => Promise.all([triggerIacJob('enrich-graph'), triggerIacJob('check-state')]),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['iac', 'jobs'] }),
  })

  return (
    <>
      <PageHeader title="IaC 보안" description="인프라 코드 변경이 만드는 공격 경로와 State·드리프트를 확인하세요." />

      {/* A 상단 상태줄 */}
      <div className="iac-status-bar">
        <Badge label="매일 03:00 수집 · PR 마다 분석" tone="primary" />
        <span className="caption">마지막 전체 점검 {formatDateTime(summary.data?.lastFullCheckAt ?? null)}</span>
        <span className="caption">그래프 기준 {formatDateTime(summary.data?.graphAsOf ?? null)}</span>
        <div className="iac-status-actions">
          <a className="btn outline" href={IAC_POLICY_URL} target="_blank" rel="noopener noreferrer">규칙 보기</a>
          <button className="btn primary" onClick={() => checkNow.mutate()} disabled={checkNow.isPending}>
            {checkNow.isPending ? '등록 중…' : '지금 점검'}
          </button>
        </div>
      </div>
      {checkNow.isSuccess && (
        <p className="notice page-notice" role="status">점검을 등록했어요. 아래 "검사 주기와 상태"에서 진행을 볼 수 있어요.</p>
      )}
      {checkNow.isError && <p className="notice error page-notice" role="alert">점검을 등록하지 못했어요.</p>}
      {summary.data?.graphStale && (
        <p className="notice page-notice" role="status">
          자산 그래프가 24시간보다 오래됐어요. 아래 경로는 기준 시각의 상태예요.
        </p>
      )}
      {summary.isError && <p className="notice error page-notice" role="alert">IaC 현황을 불러오지 못했어요.</p>}

      <div className="stack">
        {/* B 지표 4개 */}
        <section aria-label="IaC 지표">
          <div className="iac-metrics">
            <article className="card iac-metric">
              <span className="caption">1등급까지 열린 경로</span>
              <strong>{summary.isPending ? '—' : metricValue(summary.data?.metrics.tier1OpenPaths)}<small>개</small></strong>
              <span className="caption">전체 열린 경로 {metricValue(summary.data?.metrics.openPaths)}개</span>
            </article>
            <article className="card iac-metric">
              <span className="caption">실제 드리프트</span>
              <strong>{metricValue(summary.data?.metrics.drifts)}<small>건</small></strong>
              <span className="caption">코드 밖에서 바뀐 리소스 (노이즈 제외)</span>
            </article>
            <article className="card iac-metric">
              <span className="caption">State 속 실제 시크릿</span>
              <strong>{metricValue(summary.data?.metrics.stateSecrets)}<small>건</small></strong>
              <span className="caption">tfstate 에 평문으로 남은 값</span>
            </article>
            <article className="card iac-metric">
              <span className="caption">② 위반 (main 기준)</span>
              <strong>{metricValue(summary.data?.metrics.gateViolations)}<small>건</small></strong>
              <span className="caption">plan 전 검사에서 걸린 규칙</span>
            </article>
          </div>
          {summary.data && (
            <div className="iac-severity-row" aria-label="열린 발견 건 심각도별 건수">
              {severities.map((severity) => (
                <Badge key={severity} label={`${severityLabel[severity]} ${summary.data.severityCounts[severity] ?? 0}`}
                  tone={severityTone[severity]} />
              ))}
            </div>
          )}
        </section>

        {/* C 지금 열린 공격 경로 */}
        <section className="card list-card" aria-labelledby="iac-paths-title">
          <div className="card-head">
            <h2 id="iac-paths-title">지금 열린 공격 경로</h2>
            <span className="caption">인터넷에서 등급이 매겨진 데이터까지 · 6단계 이내</span>
          </div>
          {paths.isPending ? (
            <div className="iac-card-body"><Loading /></div>
          ) : paths.isError ? (
            <p className="notice error iac-card-body">열린 경로를 불러오지 못했어요.</p>
          ) : openPaths.length === 0 ? (
            <EmptyState title="1등급 데이터까지 열린 경로 없음"
              description={`마지막 계산 ${formatDateTime(summary.data?.lastFullCheckAt ?? null)}`} />
          ) : (
            <PathTable items={openPaths} onSelect={setSelectedPathId} />
          )}
          {paths.hasNextPage && (
            <div className="table-foot">
              <button className="btn" onClick={() => paths.fetchNextPage()} disabled={paths.isFetchingNextPage}>
                더 보기 <Icon name="chevron" />
              </button>
            </div>
          )}
        </section>

        {/* D ① PR 경로 미리보기 */}
        <section className="card list-card" aria-labelledby="iac-prs-title">
          <div className="card-head">
            <h2 id="iac-prs-title">PR 검사 결과</h2>
            <span className="caption">PR 마다 최신 커밋 기준 · 최근 50개</span>
          </div>
          {pullRequests.isPending ? (
            <div className="iac-card-body"><Loading /></div>
          ) : pullRequests.isError ? (
            <p className="notice error iac-card-body">PR 검사 결과를 불러오지 못했어요.</p>
          ) : pullRequests.data.length === 0 ? (
            <EmptyState title="검사한 PR 없음" description="인프라 레포에 PR 이 올라오면 여기에 판정이 보여요." />
          ) : (
            <PullRequestTable items={pullRequests.data} onSelect={setSelectedPr} />
          )}
        </section>

        {/* E ② plan 전 검사 */}
        <GateSection />

        {/* F ③ State·드리프트 */}
        <StateSection />

        {/* G 할 수 있는 조치 */}
        <RemediationSection />

        {/* H 검사 주기와 상태 */}
        <JobSection />
      </div>
      <PathDrawer pathId={selectedPathId} onClose={() => setSelectedPathId(null)} />
      <PullRequestDrawer number={selectedPr} onClose={() => setSelectedPr(null)} />
    </>
  )
}

function PathTable({ items, onSelect }: { items: IacPath[]; onSelect: (pathId: number) => void }) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="열린 공격 경로 표. 좁은 화면에서는 가로로 스크롤하세요.">
      <table>
        <thead>
          <tr>
            <th scope="col">심각도</th>
            <th scope="col">경로</th>
            <th scope="col">대상</th>
            <th scope="col">마지막 확인</th>
            <th scope="col"><span className="sr-only">상세</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((path) => (
            <tr key={path.pathId}>
              <td>
                <Badge label={severityLabel[path.severity]} tone={severityTone[path.severity]} />
              </td>
              <td>
                <div className="iac-hops">
                  {path.hops.map((hop, index) => {
                    const label = hopLabel(hop)
                    return (
                      <Fragment key={`${hop.id}-${index}`}>
                        {index > 0 && <span className="iac-hop-arrow" aria-hidden="true">→</span>}
                        <span className="iac-hop" title={hop.id}>
                          <b>{label.kind}</b>
                          {label.name && <span>{label.name}</span>}
                        </span>
                      </Fragment>
                    )
                  })}
                </div>
              </td>
              <td>
                <Badge label={tierLabel(path.tier)} tone={path.tier === 1 ? 'critical' : 'high'} />
                <span className="asset">{path.target.kind}</span>
              </td>
              <td className="muted">{formatDateTime(path.lastSeenAt)}</td>
              <td>
                <button className="btn" onClick={() => onSelect(path.pathId)} aria-label={`경로 #${path.pathId} 끊을 지점 보기`}>
                  끊을 지점
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PullRequestTable({ items, onSelect }: { items: IacPullRequestSummary[]; onSelect: (number: number) => void }) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="PR 검사 결과 표. 좁은 화면에서는 가로로 스크롤하세요.">
      <table>
        <thead>
          <tr>
            <th scope="col">판정</th>
            <th scope="col">PR</th>
            <th scope="col">변화</th>
            <th scope="col">사유</th>
            <th scope="col">검사 시각</th>
            <th scope="col"><span className="sr-only">상세</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((pr) => {
            const changes = pullRequestChanges(pr)
            return (
              <tr key={pr.number}>
                <td>
                  <div className="row">
                    <Badge {...pullRequestBadge(pr)} />
                    {pr.highestSeverity && <Badge label={severityLabel[pr.highestSeverity]} tone={severityTone[pr.highestSeverity]} />}
                  </div>
                </td>
                <td>
                  <strong>#{pr.number}</strong> <span className="caption"><code>{shortSha(pr.headSha)}</code></span>
                </td>
                <td>{changes.length > 0 ? changes.join(' · ') : <span className="muted">변화 없음</span>}</td>
                <td>{pr.reason ? ruleTitle[pr.reason] ?? pr.reason : <span className="muted">—</span>}</td>
                <td className="muted">{formatDateTime(pr.checkedAt)}</td>
                <td>
                  <button className="btn" onClick={() => onSelect(pr.number)} aria-label={`PR #${pr.number} 검사 결과 보기`}>
                    상세
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
