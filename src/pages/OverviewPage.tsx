import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchAssets, fetchPriorityFindings, fetchRiskTrend, fetchSummary } from '@/api/overview'
import type { OverviewPartSummary, PriorityFinding } from '@/api/types'
import { Badge } from '@/components/Badge'
import { DetailDrawer } from '@/components/DetailDrawer'
import { EmptyState } from '@/components/EmptyState'
import { EnvironmentSelect } from '@/components/EnvironmentSelect'
import { FindingTable } from '@/components/FindingTable'
import { Icon } from '@/components/Icon'
import { PageHeader } from '@/components/PageHeader'
import { SecurityScoreAssets, SecurityScoreCard, useSecurityScore } from '@/components/SecurityScoreCard'
import { TrendChart } from '@/components/TrendChart'
import { providerLabel } from '@/lib/labels'
import { scanDate } from '@/lib/secretScan'
import { useEnvironmentStore } from '@/store/environment'

function Loading() {
  return <div className="skeleton" />
}

function LoadError() {
  return <p className="notice error">데이터를 불러오지 못했어요.</p>
}

/** 통합 현황 (02 기능 설계 3). 계산은 모두 백엔드가 하고 화면은 받은 값을 보여주기만 한다 */
export function OverviewPage() {
  const environment = useEnvironmentStore((state) => state.environment)
  const [selected, setSelected] = useState<PriorityFinding | null>(null)
  const priorityRef = useRef<HTMLElement>(null)

  const summary = useQuery({ queryKey: ['overview', 'summary', environment], queryFn: () => fetchSummary(environment) })
  const trend = useQuery({ queryKey: ['overview', 'risk-trend', environment], queryFn: () => fetchRiskTrend(environment) })
  const assets = useQuery({ queryKey: ['overview', 'assets', environment], queryFn: () => fetchAssets(environment) })
  const priority = useQuery({
    queryKey: ['overview', 'priority-findings', environment],
    queryFn: () => fetchPriorityFindings(environment),
  })

  const focusFirstPriority = () => {
    priorityRef.current?.querySelector<HTMLElement>('.finding-link')?.focus()
  }

  const trendDays = trend.data?.days ?? []
  const firstTotal = trendDays[0]?.total ?? 0
  const lastTotal = trendDays.at(-1)?.total ?? 0

  return (
    <>
      <PageHeader
        title="통합 대시보드"
        description="우리 서비스의 보안 상태를 한눈에 확인하세요."
        actions={
          <>
            <Link className="btn primary" to="/configuration">
              인프라 살펴보기 <Icon name="chevron" />
            </Link>
          </>
        }
      />
      <div className="scope-bar">
        <EnvironmentSelect />
        <span className="caption">선택 환경의 조회 결과{summary.data?.lastCollectedAt ? ` · 최근 관측 ${scanDate(summary.data.lastCollectedAt)}` : ''}</span>
      </div>

      <div className="stack">
        <div className="dashboard-grid">
          <article className="card">
            <div className="row between">
              <p className="hero-label">지금 확인할 위험</p>
              <span className="muted">
                <Icon name="shield" />
              </span>
            </div>
            {summary.isPending ? (
              <Loading />
            ) : summary.isError ? (
              <LoadError />
            ) : (
              <>
                <div className="row between hero-value">
                  <div className="row">
                    <strong className="hero-number">
                      {summary.data.unreviewedCriticalCount}
                      <span className="unit">개</span>
                    </strong>
                    <Badge label="Critical" tone="critical" />
                  </div>
                  <button
                    className="btn soft"
                    onClick={focusFirstPriority}
                    disabled={summary.data.unreviewedCriticalCount === 0}
                  >
                    위험 확인하기 <Icon name="chevron" />
                  </button>
                </div>
                <p className="caption">우선순위가 높은 위험부터 차근차근 검토해 보세요.</p>
                <div className="mini-stats">
                  <div>
                    <span className="caption">전체 탐지</span>
                    <strong>
                      {summary.data.totalCount}
                      <span className="unit">건</span>
                    </strong>
                  </div>
                  <div>
                    <span className="caption">확인·조치 필요</span>
                    <strong>
                      {summary.data.unreviewedCount}
                      <span className="unit">건</span>
                    </strong>
                  </div>
                  <div>
                    <span className="caption">연결 자산</span>
                    <strong>
                      {summary.data.connectedAssetCount}
                      <span className="unit">개</span>
                    </strong>
                  </div>
                </div>
              </>
            )}
          </article>

          <SecurityScoreCard />

          <article className="card">
            <div className="card-head">
              <h2>위험은 어떻게 변했을까요?</h2>
              <span className="caption">최근 {trendDays.length || 7}일</span>
            </div>
            <p className="caption">지금 열린 위험을 처음 발견한 날짜로 나눈 추이예요. 미평가·평가 대상 외도 전체 건수에 포함해요.</p>
            {trend.isPending ? (
              <Loading />
            ) : trend.isError ? (
              <LoadError />
            ) : (
              <>
                <TrendChart days={trendDays} />
                <div className="row between chart-footer caption">
                  <span>현재 조회 권한·환경 기준</span>
                  <span>
                    {firstTotal}건 → <strong className="accent">{lastTotal}건</strong>
                  </span>
                </div>
              </>
            )}
          </article>

          <article className="card">
            <div className="card-head">
              <h2>연결된 자산</h2>
              <span className="caption">{assets.data ? `${assets.data.totalCount}개` : ''}</span>
            </div>
            {assets.isPending ? (
              <Loading />
            ) : assets.isError ? (
              <LoadError />
            ) : (
              assets.data.providers.map((item) => (
                <div className="provider" key={item.provider}>
                  <span className="provider-icon">
                    <Icon name={providerLabel[item.provider].icon} />
                  </span>
                  <div>
                    {providerLabel[item.provider].name}
                    <small>{item.description}</small>
                  </div>
                  <strong>{item.count}</strong>
                </div>
              ))
            )}
            <p className="caption">각 보안 기능이 실제로 점검한 자산 기준이에요. 키 발견 위치 수와는 달라요.</p>
          </article>
        </div>

        {summary.isSuccess && summary.data.parts && <PartTable parts={summary.data.parts} />}

        <SecurityScoreAssets />

        {summary.isSuccess && summary.data.secretIntegration && <section className="notice" aria-label="시크릿 통합 집계 범위">{summary.data.secretIntegration.status === 'AVAILABLE' ? <>통합 조회 범위의 시크릿 대응 {summary.data.secretIntegration.total ?? '—'}건을 포함해요.{summary.data.secretIntegration.unassessedCount != null && summary.data.secretIntegration.unassessedCount > 0 ? ` 미평가 ${summary.data.secretIntegration.unassessedCount}건은 등급 점수에서 제외해요.` : ''}{summary.data.secretIntegration.notApplicableCount != null && summary.data.secretIntegration.notApplicableCount > 0 ? ` 평가 대상 외 ${summary.data.secretIntegration.notApplicableCount}건은 등급 점수에서 제외해요.` : ''}{summary.data.secretIntegration.restrictedCoverage ? ' 열람 가능한 위치 기준이에요.' : ''} <Link to="/secrets">시크릿 현황</Link></> : <>시크릿 대응 건은 조회 권한이 없어 집계에 포함하지 않았어요.</>}</section>}

        <section className="card list-card" id="priority" ref={priorityRef}>
          <div className="card-head">
            <div>
              <h2>먼저 확인하면 좋아요</h2>
              <p className="section-intro">검토·조치가 필요한 항목을 적용 등급이 높은 순서로 모았어요.</p>
            </div>
            {priority.data && <Badge label={`${priority.data.unreviewedCount}건`} />}
          </div>
          {priority.isPending ? (
            <div style={{ padding: '0 28px' }}>
              <Loading />
            </div>
          ) : priority.isError ? (
            <div style={{ padding: '0 28px 20px' }}>
              <LoadError />
            </div>
          ) : priority.data.items.length ? (
            <FindingTable items={priority.data.items} onSelect={setSelected} />
          ) : (
            <EmptyState title="검토할 항목이 없어요" description="선택한 환경의 항목을 모두 검토했어요." />
          )}
          <div className="table-foot">탐지 내용을 누르면 해당 보안 기능 화면에서 근거와 대응을 확인할 수 있어요.</div>
        </section>
      </div>

      <DetailDrawer finding={selected} onClose={() => setSelected(null)} />
    </>
  )
}

const PART_STATUS: Record<OverviewPartSummary['status'], { label: string; tone: string }> = {
  CONNECTED: { label: '연결됨', tone: 'success' },
  NO_DATA: { label: '결과 없음', tone: '' },
  NOT_AUTHORIZED: { label: '권한 없음', tone: '' },
  ERROR: { label: '불러오기 실패', tone: 'critical' },
}

const NUM = { textAlign: 'right' } as const

/** 보안 기능별로 몇 건이 점수에 반영됐는지 (같은 원인을 묶은 건수) */
function PartTable({ parts }: { parts: OverviewPartSummary[] }) {
  const score = useSecurityScore()
  // 감점은 보안 점수(ADR-D012, 운영 환경)에서 그 기능의 위험만으로 계산한 값이다. 기능별 감점을 더해도 전체 감점과 같지 않다
  const penalty = (part: string) => {
    const found = score.data?.parts.find((p) => p.part === part)
    return found && found.status === 'CONNECTED' ? `−${found.penalty}` : '—'
  }
  return (
    <section className="card list-card" aria-labelledby="overview-parts-title">
      <div className="card-head">
        <div>
          <h2 id="overview-parts-title">보안 기능별 반영 현황</h2>
          <p className="section-intro">각 기능에서 지금 열린 위험을 같은 원인끼리 묶어 셌어요. 감점은 보안 점수(운영 환경)에서 그 기능의 위험만으로 깎이는 값이에요.</p>
        </div>
      </div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="보안 기능별 반영 현황 표. 좁은 화면에서는 가로로 스크롤하세요.">
        <table>
          <thead>
            <tr>
              <th scope="col">보안 기능</th>
              <th scope="col">상태</th>
              <th scope="col" style={NUM}>Critical</th>
              <th scope="col" style={NUM}>High</th>
              <th scope="col" style={NUM}>Medium</th>
              <th scope="col" style={NUM}>Low</th>
              <th scope="col" style={NUM}>미평가</th>
              <th scope="col" style={NUM}>합계</th>
              <th scope="col" style={NUM}>감점(운영)</th>
              <th scope="col">기준 시각</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((part) => {
              const status = PART_STATUS[part.status] ?? PART_STATUS.ERROR
              const counted = part.status === 'CONNECTED'
              return (
                <tr key={part.part}>
                  <td>{part.link ? <Link className="finding-link" to={part.link}>{part.label}</Link> : part.label}</td>
                  <td><Badge label={status.label} tone={status.tone} /></td>
                  <td style={NUM}>{counted ? part.critical : '—'}</td>
                  <td style={NUM}>{counted ? part.high : '—'}</td>
                  <td style={NUM}>{counted ? part.medium : '—'}</td>
                  <td style={NUM}>{counted ? part.low : '—'}</td>
                  <td style={NUM}>{counted ? part.unassessed : '—'}</td>
                  <td style={NUM}><strong>{counted ? part.total : '—'}</strong></td>
                  <td style={NUM}>{penalty(part.part)}</td>
                  <td className="caption">{part.dataAsOf ? scanDate(part.dataAsOf) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
