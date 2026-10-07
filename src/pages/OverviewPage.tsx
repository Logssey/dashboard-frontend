import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchAssets, fetchPriorityFindings, fetchRiskTrend, fetchSummary } from '@/api/overview'
import type { PriorityFinding } from '@/api/types'
import { Badge } from '@/components/Badge'
import { DetailDrawer } from '@/components/DetailDrawer'
import { EmptyState } from '@/components/EmptyState'
import { EnvironmentSelect } from '@/components/EnvironmentSelect'
import { FindingTable } from '@/components/FindingTable'
import { Icon } from '@/components/Icon'
import { PageHeader } from '@/components/PageHeader'
import { ScoreRing } from '@/components/ScoreRing'
import { TrendChart } from '@/components/TrendChart'
import { COMING_SOON_MESSAGE, providerLabel } from '@/lib/labels'
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
    priorityRef.current?.querySelector<HTMLButtonElement>('.finding-link')?.focus()
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
            <button className="btn" onClick={() => window.alert(COMING_SOON_MESSAGE)}>
              <Icon name="download" />
              예시 데이터 내보내기
            </button>
            <Link className="btn primary" to="/configuration">
              인프라 살펴보기 <Icon name="chevron" />
            </Link>
          </>
        }
      />
      <div className="scope-bar">
        <EnvironmentSelect />
        <span className="caption">샘플 데이터 · 화면 검토용</span>
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
                    <span className="caption">미검토</span>
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

          <article className="card score-card">
            <div className="row between">
              <h2>우리 서비스의 보안 점수</h2>
              <Badge label="예시" tone="primary" />
            </div>
            {summary.isPending ? (
              <Loading />
            ) : summary.isError ? (
              <LoadError />
            ) : (
              <div className="row between">
                <div>
                  <strong className="score-number">{summary.data.securityScore}</strong>
                  <span className="unit">/ 100</span>
                  <p className="caption">
                    탐지된 위험을 기준으로
                    <br />
                    현재 상태를 확인하세요.
                  </p>
                </div>
                <ScoreRing score={summary.data.securityScore} />
              </div>
            )}
            <p className="caption">Critical −4점 · High −1점</p>
          </article>

          <article className="card">
            <div className="card-head">
              <h2>위험은 어떻게 변했을까요?</h2>
              <span className="caption">최근 {trendDays.length || 7}일</span>
            </div>
            <p className="caption">하루 동안 새로 탐지된 위험 건수예요.</p>
            {trend.isPending ? (
              <Loading />
            ) : trend.isError ? (
              <LoadError />
            ) : (
              <>
                <TrendChart days={trendDays} />
                <div className="row between chart-footer caption">
                  <span>샘플 데이터 기준</span>
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
            <p className="caption">샘플 자산 데이터입니다.</p>
          </article>
        </div>

        <section className="card list-card" id="priority" ref={priorityRef}>
          <div className="card-head">
            <div>
              <h2>먼저 확인하면 좋아요</h2>
              <p className="section-intro">미검토 항목 중 위험도가 높은 순서로 모았어요.</p>
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
          <div className="table-foot">탐지 내용을 누르면 근거와 권장 대응을 확인할 수 있어요.</div>
        </section>
      </div>

      <DetailDrawer finding={selected} onClose={() => setSelected(null)} />
    </>
  )
}
