import { type FormEvent, useEffect, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api/client'
import {
  fetchReachCiCheck,
  fetchReachCiChecks,
  type ReachCiCheck,
  type ReachCiCheckFilter,
  type ReachScanStatus,
  type ReachTrigger,
} from '@/api/reach'
import { EmptyState } from '@/components/EmptyState'
import { ReachScanStatusBadge } from '@/components/ReachBadges'
import { formatKst } from '@/lib/reach'
import {
  labelOf,
  reachCiPolicyLabel,
  reachGateConditionLabel,
  reachGateResultLabel,
  reachStatusLabel,
  reachScanStatusLabel,
  reachScanStatusOrder,
  reachStatusOrder,
  reachTriggerLabel,
  reachTriggerOrder,
} from '@/lib/reachLabels'
import { VULNERABILITY_FINDINGS_PATH, VULNERABILITY_SCANS_PATH } from '@/lib/reachRoutes'

// SCR-05-10 CI 검사 탭. CI가 GitHub OIDC로 검사를 등록하고 결과를 올린다(FR-11, API-12·13).
// 검사 목록(API-12 목록)에서 고르거나 검사 ID로 찾는다. 고른 검사 ID는 스캔 화면 주소 쿼리 check에 둔다

const POLL_MS = 10_000

/** CI 실행 상태. 동작 = 서비스 레포 워크플로(deploy/reach/ci/reach.yml)가 돈다. 준비·계획은 새 경로를 더할 때를 위해 남겨 둔다(지금 쓰는 줄 없음) */
export type CiPlanStatus = 'WORKING' | 'READY' | 'PLANNED'

export const CI_PLAN_STATUS_LABEL: Record<CiPlanStatus, string> = { WORKING: '동작', READY: '준비', PLANNED: '계획' }

/** 실행 경로 (화면 명세 "CI 검사 탭 배치", PRD FR-11). 네 경로 모두 운영에서 돈다 */
export const CI_PLAN: { mode: ReachTrigger; when: string; what: string; status: CiPlanStatus; note?: string }[] = [
  { mode: 'PR', when: 'PR마다', what: '레포 SBOM으로 CVE 대조와 L2 판정. 기준 스캔에 없던 Finding만 게이트로 본다', status: 'WORKING' },
  {
    mode: 'IMAGE_BUILD',
    when: 'CI/CD가 PR 이미지를 ECR에 올린 뒤',
    what: '이미지 SBOM 생성·대조·L2 판정. 서비스 레포에 시나리오가 있으면 그 이미지를 띄워 L3 실제 실행까지 기록한다',
    status: 'WORKING',
  },
  {
    mode: 'SCHEDULE',
    when: '하루 1번',
    what: '실행 중인 이미지마다 보관한 SBOM을 그날의 취약점 DB·판정 데이터로 다시 대조한다. L3는 보관한 실행 기록으로 다시 맞춘다',
    status: 'WORKING',
  },
  {
    mode: 'MANUAL',
    when: '필요할 때',
    what: '[새 스캔]·[다시 대조]로 요청하면 서비스 레포의 워크플로가 돌아 결과를 올린다. 앱은 띄우지 않는다',
    status: 'WORKING',
  },
]

/** 검사 ID 입력값. 양의 정수만 받는다 */
export function parseCheckId(value: string | null): number | null {
  const text = (value ?? '').trim().replace(/^#/, '')
  if (!/^\d+$/.test(text)) return null
  const id = Number(text)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

const DETAIL_ID = 'reach-ci-detail'

const isRunning = (check: ReachCiCheck) => check.scanStatus === 'QUEUED' || check.scanStatus === 'RUNNING'

function GateBadge({ result }: { result: string }) {
  return <span className={`badge reach-pill reach-gate ${result.toLowerCase()}`}>{labelOf(reachGateResultLabel, result)}</span>
}

/** API-12 결과 한 건 */
export function CiCheckResult({ check }: { check: ReachCiCheck }) {
  const { gate } = check
  const pr = check.pullRequest
  const running = isRunning(check)
  return (
    <div className="reach-ci-result stack">
      <div className="row reach-ci-head">
        <h3 className="reach-ci-title">검사 #{check.id}</h3>
        {gate ? <GateBadge result={gate.result} /> : <ReachScanStatusBadge status={check.scanStatus} />}
        <span className="badge reach-method">{labelOf(reachTriggerLabel, check.mode)}</span>
        <span className="badge reach-method">{labelOf(reachCiPolicyLabel, check.policy)}</span>
      </div>

      <dl className="reach-ci-facts">
        <div>
          <dt>레포</dt>
          <dd>{check.repository}</dd>
        </div>
        {check.headCommit && (
          <div>
            <dt>커밋</dt>
            <dd>
              <code className="reach-mono" title={check.headCommit}>
                {check.headCommit.slice(0, 7)}
              </code>
            </dd>
          </div>
        )}
        {pr && (
          <div>
            <dt>PR</dt>
            <dd>
              #{pr.number}
              {pr.headRef && pr.baseRef && (
                <span className="caption">
                  {' '}
                  {pr.headRef} → {pr.baseRef}
                </span>
              )}
            </dd>
          </div>
        )}
        <div>
          <dt>스캔</dt>
          <dd>
            <Link className="reach-link" to={`${VULNERABILITY_SCANS_PATH}?scan=${check.scanId}`}>
              스캔 #{check.scanId}
            </Link>{' '}
            <ReachScanStatusBadge status={check.scanStatus} />
          </dd>
        </div>
        <div>
          <dt>기준 스캔</dt>
          <dd>
            {check.baselineScanId ? (
              <Link className="reach-link" to={`${VULNERABILITY_SCANS_PATH}?scan=${check.baselineScanId}`}>
                스캔 #{check.baselineScanId}
              </Link>
            ) : (
              <span className="caption">없음 · 모든 Finding을 새 것으로 봐요</span>
            )}
          </dd>
        </div>
        {check.finishedAt && (
          <div>
            <dt>끝난 시각</dt>
            <dd>{formatKst(check.finishedAt)}</dd>
          </div>
        )}
      </dl>

      {gate ? (
        <>
          <section className="reach-ci-section">
            <h4>새 Finding {gate.newFindings.total}건</h4>
            <ul className="reach-ci-counts">
              {reachStatusOrder.map((status) => (
                <li key={status}>
                  <span className="caption">{labelOf(reachStatusLabel, status)}</span>
                  <strong>{gate.newFindings.byStatus[status] ?? 0}</strong>
                </li>
              ))}
            </ul>
          </section>
          <section className="reach-ci-section">
            <h4>게이트 이유</h4>
            {gate.reasons.length === 0 ? (
              <p className="caption">걸린 조건이 없어요.</p>
            ) : (
              <ul className="reach-ci-reasons">
                {gate.reasons.map((reason) => (
                  <li key={reason.condition}>
                    <strong>{labelOf(reachGateConditionLabel, reason.condition)}</strong> {reason.count}건
                    <span className="caption"> · {reason.summary}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="caption">
              CI 종료 코드 {gate.exitCode}
              {check.policy === 'REPORT_ONLY' && ' · 리포트 전용이라 이유가 있어도 PR을 막지 않아요'}
            </p>
          </section>
          <div className="row reach-ci-actions">
            <Link className="btn outline small" to={`${VULNERABILITY_FINDINGS_PATH}?scan=${check.scanId}`}>
              이 검사의 Finding 보기
            </Link>
          </div>
        </>
      ) : (
        <p className="notice" role="status">
          {running
            ? '분석 결과가 아직 올라오지 않았어요. 10초마다 다시 확인해요.'
            : '스캔이 실패해 게이트 결과가 없어요. 스캔 상세에서 실패한 단계를 확인하세요.'}
        </p>
      )}
    </div>
  )
}

function CheckLookup({ checkId, onCheck }: { checkId: number | null; onCheck: (id: number | null) => void }) {
  const [text, setText] = useState(checkId ? String(checkId) : '')
  const [invalid, setInvalid] = useState(false)
  useEffect(() => setText(checkId ? String(checkId) : ''), [checkId])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const id = parseCheckId(text)
    setInvalid(id === null)
    if (id !== null) onCheck(id)
  }

  return (
    <form className="row reach-ci-lookup" onSubmit={submit}>
      <label className="reach-ci-lookup-label" htmlFor="reach-ci-check-id">
        검사 ID
      </label>
      <input
        id="reach-ci-check-id"
        className="input"
        inputMode="numeric"
        placeholder="예: 12"
        value={text}
        aria-invalid={invalid}
        aria-describedby="reach-ci-check-help"
        onChange={(event) => setText(event.target.value)}
      />
      <button type="submit" className="btn primary small">
        결과 보기
      </button>
      {checkId && (
        <button type="button" className="btn outline small" onClick={() => onCheck(null)}>
          지우기
        </button>
      )}
      <p id="reach-ci-check-help" className={`caption reach-ci-help ${invalid ? 'error' : ''}`.trim()}>
        {invalid ? '검사 ID는 숫자예요.' : '검사 ID를 알면 바로 찾을 수 있어요(CI 로그 요약의 링크에 있어요).'}
      </p>
    </form>
  )
}

function CheckResultCard({ checkId }: { checkId: number }) {
  const check = useQuery({
    queryKey: ['reach-ci-check', checkId],
    queryFn: () => fetchReachCiCheck(checkId),
    refetchInterval: (query) => {
      const status = query.state.data?.scanStatus
      return status === 'QUEUED' || status === 'RUNNING' ? POLL_MS : false
    },
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  })
  if (check.isPending) return <div className="skeleton" role="status" aria-label="불러오는 중" />
  if (check.isError) {
    const notFound = check.error instanceof ApiError && check.error.status === 404
    return (
      <p className="notice error" role="alert">
        {notFound ? `검사 #${checkId}을 찾을 수 없어요. 검사 ID를 확인하세요.` : `검사 #${checkId}을 불러오지 못했어요.`}
      </p>
    )
  }
  return <CiCheckResult check={check.data} />
}

/** 검사 목록 표 (API-12 목록). 줄을 누르면 그 검사를 고른다 */
export function CiCheckTable({
  items,
  selectedId,
  onSelect,
}: {
  items: ReachCiCheck[]
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="CI 검사 목록 표. 좁은 화면에서는 가로로 스크롤하세요.">
      <table className="reach-table reach-ci-list">
        <thead>
          <tr>
            <th scope="col">검사</th>
            <th scope="col">레포</th>
            <th scope="col">실행</th>
            <th scope="col">PR</th>
            <th scope="col">커밋</th>
            <th scope="col">결과</th>
            <th scope="col">등록</th>
          </tr>
        </thead>
        <tbody>
          {items.map((check) => {
            const pr = check.pullRequest
            return (
              <tr
                key={check.id}
                className={`reach-row ${check.id === selectedId ? 'selected' : ''}`.trim()}
                aria-selected={check.id === selectedId}
                onClick={() => onSelect(check.id)}
              >
                <td>
                  <button
                    type="button"
                    className="finding-link"
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelect(check.id)
                    }}
                  >
                    #{check.id}
                  </button>
                </td>
                <td>{check.repository}</td>
                <td>{labelOf(reachTriggerLabel, check.mode)}</td>
                <td>
                  {pr ? (
                    <>
                      #{pr.number}
                      {pr.headRef && pr.baseRef && (
                        <span className="caption reach-nowrap">
                          {' '}
                          {pr.headRef} → {pr.baseRef}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="caption">—</span>
                  )}
                </td>
                <td>
                  {check.headCommit ? (
                    <code className="reach-mono" title={check.headCommit}>
                      {check.headCommit.slice(0, 7)}
                    </code>
                  ) : (
                    <span className="caption">—</span>
                  )}
                </td>
                <td>{check.gate ? <GateBadge result={check.gate.result} /> : <ReachScanStatusBadge status={check.scanStatus} />}</td>
                <td className="reach-nowrap">{check.createdAt ? formatKst(check.createdAt).replace(' KST', '') : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const EMPTY_FILTER: ReachCiCheckFilter = { mode: [], scanStatus: [] }

function CheckList({ selectedId, onSelect }: { selectedId: number | null; onSelect: (id: number) => void }) {
  const [filter, setFilter] = useState<ReachCiCheckFilter>(EMPTY_FILTER)
  const checks = useInfiniteQuery({
    queryKey: ['reach-ci-checks', filter],
    queryFn: ({ pageParam }) => fetchReachCiChecks(filter, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hasNext ? (last.nextCursor ?? undefined) : undefined),
    // 진행 중인 검사가 있으면 결과가 올라올 때까지 다시 받는다
    refetchInterval: (query) => (query.state.data?.pages.some((page) => page.items.some(isRunning)) ? POLL_MS : false),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  })
  const items = checks.data?.pages.flatMap((page) => page.items) ?? []
  const total = checks.data?.pages[0]?.totalCount
  const filtered = filter.mode.length > 0 || filter.scanStatus.length > 0
  const noListApi = checks.error instanceof ApiError && checks.error.status === 404

  return (
    <section className="card list-card">
      <div className="toolbar reach-filters">
        <div className="row reach-filter-row">
          <strong>검사 목록</strong>
          <select
            className="select"
            aria-label="실행"
            value={filter.mode[0] ?? ''}
            onChange={(event) => setFilter({ ...filter, mode: event.target.value ? [event.target.value as ReachTrigger] : [] })}
          >
            <option value="">모든 실행</option>
            {reachTriggerOrder.map((mode) => (
              <option key={mode} value={mode}>
                {labelOf(reachTriggerLabel, mode)}
              </option>
            ))}
          </select>
          <select
            className="select"
            aria-label="상태"
            value={filter.scanStatus[0] ?? ''}
            onChange={(event) =>
              setFilter({ ...filter, scanStatus: event.target.value ? [event.target.value as ReachScanStatus] : [] })
            }
          >
            <option value="">모든 상태</option>
            {reachScanStatusOrder.map((status) => (
              <option key={status} value={status}>
                {reachScanStatusLabel[status]}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn outline small" onClick={() => setFilter(EMPTY_FILTER)} disabled={!filtered}>
          필터 초기화
        </button>
      </div>

      {checks.isError &&
        (noListApi ? (
          <p className="notice reach-table-notice" role="status">
            이 서버에는 검사 목록 API가 없어요. 검사 ID로 찾으세요.
          </p>
        ) : (
          <p className="notice error reach-table-notice" role="alert">
            검사 목록을 불러오지 못했어요.{' '}
            <button type="button" className="btn outline small" onClick={() => void checks.refetch()}>
              다시 시도
            </button>
          </p>
        ))}
      {checks.isPending && (
        <div className="reach-loading" role="status" aria-live="polite">
          {[0, 1, 2].map((row) => (
            <div key={row} className="skeleton" />
          ))}
          <span className="reach-sr-only">불러오는 중</span>
        </div>
      )}
      {checks.isSuccess &&
        items.length === 0 &&
        (filtered ? (
          <EmptyState title="조건에 맞는 검사가 없어요" description="필터를 바꾸거나 초기화해 보세요." />
        ) : (
          <EmptyState title="아직 CI 검사가 없어요" description="서비스 레포의 Reach 워크플로가 PR마다 검사를 등록해요." />
        ))}
      {items.length > 0 && <CiCheckTable items={items} selectedId={selectedId} onSelect={onSelect} />}
      {items.length > 0 && (
        <div className="table-foot reach-table-foot">
          <span>
            {total !== undefined && total !== null ? `${total}건 중 ${items.length}건 표시` : `${items.length}건 표시`}
            {items.some(isRunning) && ' · 진행 중인 검사는 10초마다 다시 받아요'}
          </span>
          {checks.hasNextPage && (
            <button type="button" className="btn outline small" onClick={() => void checks.fetchNextPage()} disabled={checks.isFetchingNextPage}>
              {checks.isFetchingNextPage ? '불러오는 중…' : '더 보기'}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

export function CiChecksTab({
  checkId,
  onCheck,
  onShowPrScans,
}: {
  checkId: number | null
  onCheck: (id: number | null) => void
  onShowPrScans: () => void
}) {
  const select = (id: number) => {
    onCheck(id)
    // 목록에서 고르면 위의 결과 카드로 올라간다
    if (typeof document !== 'undefined') {
      requestAnimationFrame(() => document.getElementById(DETAIL_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }
  return (
    <div className="stack">
      <section className="card reach-ci-card" id={DETAIL_ID}>
        <p className="notice" role="status">
          CI가 PR마다 검사를 등록하고 결과를 올려요(GitHub OIDC). 아래 목록에서 고르거나 검사 ID로 찾으세요. PR 검사가 만든
          스캔은{' '}
          <button type="button" className="reach-row-button reach-link" onClick={onShowPrScans}>
            스캔 이력의 PR 트리거
          </button>
          로도 볼 수 있어요.
        </p>
        <CheckLookup checkId={checkId} onCheck={onCheck} />
        {checkId && <CheckResultCard checkId={checkId} />}
      </section>

      <CheckList selectedId={checkId} onSelect={select} />

      <section className="card list-card">
        <div className="toolbar reach-filters">
          <strong>실행 경로</strong>
          <span className="caption">처음에는 리포트 전용으로 돌리고, 게이트 전환 시점은 팀이 정해요(ARD Q-07)</span>
        </div>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="CI 실행 경로 표. 좁은 화면에서는 가로로 스크롤하세요.">
          <table className="reach-table reach-ci-plan">
            <thead>
              <tr>
                <th scope="col">실행</th>
                <th scope="col">언제</th>
                <th scope="col">하는 일</th>
                <th scope="col">상태</th>
              </tr>
            </thead>
            <tbody>
              {CI_PLAN.map((row) => (
                <tr key={row.mode}>
                  <td>
                    <strong>{labelOf(reachTriggerLabel, row.mode)}</strong>
                  </td>
                  <td>{row.when}</td>
                  <td>{row.what}</td>
                  <td>
                    <span className={`badge ${row.status === 'WORKING' ? 'success' : 'reach-flag'}`}>
                      {CI_PLAN_STATUS_LABEL[row.status]}
                    </span>
                    {row.note && <span className="caption"> {row.note}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
