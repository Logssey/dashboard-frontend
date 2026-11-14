import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchReachWorkloads, type ReachObservation, type ReachWorkload } from '@/api/reach'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { ReachDeploymentBadge, ReachScanMatchBadge } from '@/components/ReachBadges'
import { compareWorkloads, formatKst, shortDigest, shortRevision, summarizeWorkloads } from '@/lib/reach'
import { labelOf, reachSourceLabel } from '@/lib/reachLabels'
import { VULNERABILITY_SCANS_PATH } from '@/lib/reachRoutes'
import './reach.css'

// SCR-04 워크로드·배포 확인 (/vulnerabilities/workloads). API-07이 주는 마지막 조회 결과를 보인다.
// 클러스터를 직접 조회하지 않는다. 요약 카드를 누르면 표를 그 묶음으로 거르고, 고른 묶음은 주소 쿼리(match)에 남긴다

type MatchView = 'MATCH' | 'ATTENTION'

const WORKLOADS_QUERY_KEY = ['reach-workloads']

function readView(value: string | null): MatchView | null {
  return value === 'MATCH' || value === 'ATTENTION' ? value : null
}

function inView(item: ReachWorkload, view: MatchView | null): boolean {
  if (view === 'MATCH') return item.scanMatch.status === 'MATCH'
  if (view === 'ATTENTION') return item.scanMatch.status !== 'MATCH'
  return true
}

/** 스캔 화면의 새 스캔 대화상자를 이 이미지로 채워서 연다 (SCR-04-07) */
export function scanRequestLink(item: ReachWorkload): string {
  const params = new URLSearchParams({ new: 'image', repository: item.image.repository, digest: item.image.digest })
  if (item.app) params.set('app', item.app)
  return `${VULNERABILITY_SCANS_PATH}?${params}`
}

/** SCR-04-02 안내 띠. 네임스페이스마다 조회 시각과 방식, 48시간이 지났으면 "오래됨" */
function ObservationBand({ observations }: { observations: ReachObservation[] }) {
  const stale = observations.some((observation) => !observation.fresh)
  return (
    <div className={`notice reach-observations ${stale ? 'warning' : ''}`.trim()} role="status">
      <ul className="reach-observation-list">
        {observations.map((observation) => (
          <li key={`${observation.cluster}/${observation.namespace}`}>
            <span className="badge reach-method">{labelOf(reachSourceLabel, observation.source)}</span>{' '}
            <strong>
              {observation.cluster} / {observation.namespace}
            </strong>{' '}
            조회 {formatKst(observation.observedAt)}
            {!observation.fresh && <span className="badge reach-flag differs">오래됨</span>}
          </li>
        ))}
      </ul>
      <p className="caption">
        {observations.some((observation) => observation.source === 'MANUAL')
          ? '운영 파드의 imageID를 kubectl로 조회해 올린 결과예요. 자동 수집은 아직 연결되지 않았어요.'
          : '클러스터 안 수집기가 조회한 결과예요.'}
        {stale && ' 48시간이 지난 조회는 실행 여부를 "확인 못 함"으로 보여요.'}
      </p>
    </div>
  )
}

function SummaryCards({ items, view, onView }: { items: ReachWorkload[]; view: MatchView | null; onView: (view: MatchView | null) => void }) {
  const counts = summarizeWorkloads(items)
  const toggle = (next: MatchView) => onView(view === next ? null : next)
  return (
    <div className="reach-workload-cards">
      <div className="card metric reach-workload-card">
        <span className="caption">실행 중 워크로드</span>
        <strong className="reach-big">{counts.workloads}</strong>
        <span className="caption">준비된 파드 {counts.readyPods}개</span>
      </div>
      <button
        type="button"
        className={`card metric reach-workload-card reach-kpi ${view === 'MATCH' ? 'active' : ''}`.trim()}
        aria-pressed={view === 'MATCH'}
        onClick={() => toggle('MATCH')}
      >
        <span className="caption">스캔한 digest와 일치</span>
        <strong className="reach-big">{counts.match}</strong>
        <span className="caption">스캔 판정을 그대로 쓸 수 있어요</span>
      </button>
      <button
        type="button"
        className={`card metric reach-workload-card reach-kpi ${counts.mismatch ? 'alert' : ''} ${view === 'ATTENTION' ? 'active' : ''}`.trim()}
        aria-pressed={view === 'ATTENTION'}
        onClick={() => toggle('ATTENTION')}
      >
        <span className="caption">스캔 없음 · 불일치</span>
        <strong className="reach-big">
          {counts.noScan} · {counts.mismatch}
        </strong>
        <span className="caption">배포된 이미지를 스캔해야 해요</span>
      </button>
    </div>
  )
}

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      className="btn outline small reach-copy"
      aria-label={`${label} 복사`}
      onClick={() => void navigator.clipboard?.writeText(value)}
    >
      복사
    </button>
  )
}

export function ReachWorkloadTable({ items }: { items: ReachWorkload[] }) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="워크로드 표. 좁은 화면에서는 가로로 스크롤하세요.">
      <table className="reach-table reach-workload-table">
        <thead>
          <tr>
            <th scope="col">워크로드</th>
            <th scope="col">앱</th>
            <th scope="col">이미지</th>
            <th scope="col">파드</th>
            <th scope="col">배포</th>
            <th scope="col">스캔 연결</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const revision = shortRevision(item.image.revision)
            return (
              <tr key={`${item.cluster}/${item.namespace}/${item.kind}/${item.name}/${item.container}/${item.image.digest}`}>
                <td>
                  <strong>{item.name}</strong>
                  <span className="asset">
                    {item.kind} · 컨테이너 {item.container} · {item.namespace}
                  </span>
                </td>
                <td>{item.app ?? <span className="caption">모름</span>}</td>
                <td title={item.image.digest}>
                  <span>
                    {item.image.repository}
                    {revision && <span className="caption"> : {revision}</span>}
                  </span>
                  <span className="asset reach-digest">
                    <code className="reach-mono">{shortDigest(item.image.digest)}</code>
                    <CopyButton value={item.image.digest} label="digest" />
                  </span>
                </td>
                <td>
                  <span title="이 digest를 돌리는 준비된 파드 수">{item.replicas.ready}</span>
                  {item.replicas.ready === 0 && <span className="badge reach-flag">준비 0</span>}
                </td>
                <td>
                  <ReachDeploymentBadge deployment={item.deployment} />
                </td>
                <td>
                  <div className="reach-match-cell">
                    <ReachScanMatchBadge status={item.scanMatch.status} />
                    {item.scanMatch.scanId !== undefined && (
                      <Link className="reach-link" to={`${VULNERABILITY_SCANS_PATH}?scan=${item.scanMatch.scanId}`}>
                        {item.scanMatch.status === 'MATCH' ? `스캔 #${item.scanMatch.scanId}` : `앱 최신 스캔 #${item.scanMatch.scanId}`}
                      </Link>
                    )}
                    {item.scanMatch.status !== 'MATCH' && (
                      <Link className="btn outline small" to={scanRequestLink(item)}>
                        스캔 요청
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function VulnerabilityWorkloadsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const view = readView(searchParams.get('match'))
  const workloads = useQuery({ queryKey: WORKLOADS_QUERY_KEY, queryFn: fetchReachWorkloads })
  const data = workloads.data?.data
  const items = data ? [...data.items].sort(compareWorkloads) : []
  const shown = items.filter((item) => inView(item, view))

  const setView = (next: MatchView | null) =>
    setSearchParams(
      (previous) => {
        const params = new URLSearchParams(previous)
        if (next) params.set('match', next)
        else params.delete('match')
        return params
      },
      { replace: true },
    )

  return (
    <>
      <PageHeader
        title="워크로드"
        description="운영 클러스터에서 실행 중인 이미지가 스캔한 이미지와 같은지 확인하세요."
        actions={
          <button type="button" className="btn outline small" onClick={() => void workloads.refetch()} disabled={workloads.isFetching}>
            {workloads.isFetching ? '불러오는 중…' : '새로 고침'}
          </button>
        }
      />
      {workloads.data?.sample && (
        <p className="notice page-notice" role="status">
          백엔드에 워크로드 API(API-07)가 아직 없어 API 명세의 예시 값(PoC 조회 결과)으로 보여주고 있어요. 실제 조회 결과가 아니에요.
        </p>
      )}

      {workloads.isPending && (
        <div className="reach-loading" role="status" aria-live="polite">
          {[0, 1, 2].map((row) => (
            <div key={row} className="skeleton" />
          ))}
          <span className="reach-sr-only">불러오는 중</span>
        </div>
      )}
      {workloads.isError && (
        <p className="notice error" role="alert">
          워크로드를 불러오지 못했어요.{' '}
          <button type="button" className="btn outline small" onClick={() => void workloads.refetch()}>
            다시 시도
          </button>
        </p>
      )}

      {data && data.observations.length === 0 && (
        <section className="card">
          <EmptyState
            title="클러스터 조회 기록이 없어요"
            description="운영 파드를 조회한 결과를 올리면(L1 수집 결과 올리기) 실행 중인 이미지와 스캔 연결을 여기에 보여줘요."
          />
        </section>
      )}

      {data && data.observations.length > 0 && (
        <div className="stack">
          <ObservationBand observations={data.observations} />
          <SummaryCards items={items} view={view} onView={setView} />
          <section className="card list-card">
            <div className="toolbar reach-filters">
              <span className="caption">
                {view ? `${items.length}개 중 ${shown.length}개` : `${items.length}개`} · 불일치 → 스캔 없음 → 일치 순
              </span>
              {view && (
                <button type="button" className="btn outline small" onClick={() => setView(null)}>
                  전체 보기
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <EmptyState title="실행 중인 워크로드가 없어요" description="조회한 네임스페이스에 Running 파드가 없었어요." />
            ) : (
              <ReachWorkloadTable items={shown} />
            )}
          </section>
          <p className="caption">
            한 줄은 워크로드 안의 컨테이너 이미지 하나예요. 배포 중에는 같은 워크로드에 이미지가 둘 보일 수 있어요. 파드 수는 그 이미지를
            돌리는 준비된 파드 수예요.
          </p>
        </div>
      )}
    </>
  )
}
