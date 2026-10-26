import { useCallback, useEffect, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchReachFindings, fetchReachSummary, type ReachFindingFilter, type ReachSummary } from '@/api/reach'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { ReachFindingDrawer } from '@/components/ReachFindingDrawer'
import { ReachFindingTable } from '@/components/ReachFindingTable'
import { ReachStatusBadge } from '@/components/ReachBadges'
import { type ReachSummaryLink, ReachSummaryView } from '@/components/ReachSummaryView'
import { formatKst } from '@/lib/reach'
import {
  reachDeploymentLabel,
  reachDeploymentOrder,
  reachReviewLabel,
  reachReviewOrder,
  reachSeverityOrder,
  reachStatusLabel,
  reachStatusOrder,
} from '@/lib/reachLabels'
import { VULNERABILITY_FINDINGS_PATH } from '@/lib/reachRoutes'
import './reach.css'

// 취약점 관리(Reach). 사이드바 하위 메뉴로 요약(/vulnerabilities)과 Finding 목록(/vulnerabilities/findings)을 나눈다.
// 목록의 필터와 열린 Finding은 주소 쿼리에 둔다 (SCR-02-03 "고른 값은 주소 쿼리에 남는다")

const FILTER_KEYS = ['status', 'severity', 'review', 'deployment', 'cve'] as const
const SUMMARY_QUERY_KEY = ['reach-summary']

type UrlChanges = Record<string, string | null>

function parseList<T extends string>(value: string | null, allowed: readonly T[]): T[] {
  if (!value) return []
  return value.split(',').filter((item): item is T => (allowed as readonly string[]).includes(item))
}

function parseId(value: string | null): number | null {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function readFilter(params: URLSearchParams): ReachFindingFilter {
  return {
    status: parseList(params.get('status'), reachStatusOrder),
    severity: parseList(params.get('severity'), reachSeverityOrder),
    reviewState: parseList(params.get('review'), reachReviewOrder),
    deployment: parseList(params.get('deployment'), reachDeploymentOrder),
    cveContains: params.get('cve') ?? '',
  }
}

function hasFilter(filter: ReachFindingFilter): boolean {
  return Boolean(
    filter.status.length || filter.severity.length || filter.reviewState.length || filter.deployment.length || filter.cveContains.trim(),
  )
}

/** 백엔드는 API를 하나씩 붙인다. 지금 화면에서 예시 값으로 그린 부분만 알린다 */
function SampleNotice({ parts }: { parts: Array<string | null> }) {
  const shown = parts.filter((part): part is string => Boolean(part))
  if (!shown.length) return null
  return (
    <p className="notice page-notice" role="status">
      백엔드에 아직 없는 Reach API가 있어 일부를 API 명세의 예시 값(PoC 결과 23행)으로 보여주고 있어요:{' '}
      <strong>{shown.join(', ')}</strong>. 실제 판정 결과가 아니에요.
    </p>
  )
}

function ScopeLine({ summary }: { summary: ReachSummary | undefined }) {
  if (!summary) return null
  return (
    <p className="caption reach-scope">
      기준 스캔 #{summary.scope.scanId ?? '—'} · 집계 {formatKst(summary.generatedAt)}
    </p>
  )
}

function Loading() {
  return (
    <div className="reach-loading" role="status" aria-live="polite">
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="skeleton" />
      ))}
      <span className="reach-sr-only">불러오는 중</span>
    </div>
  )
}

/** 드롭다운 하나는 값 하나를 고른다. 요약에서 여러 값으로 넘어오면 "n개 선택"으로 보인다 */
function FilterSelect<T extends string>({ label, values, options, optionLabel, onChange }: {
  label: string
  values: T[]
  options: readonly T[]
  optionLabel: (value: T) => string
  onChange: (value: T | null) => void
}) {
  const current = values.length === 1 ? values[0] : values.length > 1 ? '__multi' : ''
  return (
    <select
      className="select"
      aria-label={label}
      value={current}
      onChange={(event) => onChange(event.target.value ? (event.target.value as T) : null)}
    >
      <option value="">{`모든 ${label}`}</option>
      {values.length > 1 && (
        <option value="__multi" disabled>
          {`${label} ${values.length}개 선택`}
        </option>
      )}
      {options.map((option) => (
        <option key={option} value={option}>
          {optionLabel(option)}
        </option>
      ))}
    </select>
  )
}

/** SCR-01 요약 (/vulnerabilities). 카드·표 칸을 누르면 그 조건으로 Finding 목록을 연다 */
export function VulnerabilitySummaryPage() {
  const navigate = useNavigate()
  const summary = useQuery({ queryKey: SUMMARY_QUERY_KEY, queryFn: fetchReachSummary })
  const summaryData = summary.data?.data

  const openFindings = (link: ReachSummaryLink) => {
    const params = new URLSearchParams()
    if (link.status?.length) params.set('status', link.status.join(','))
    if (link.severity?.length) params.set('severity', link.severity.join(','))
    if (link.reviewState?.length) params.set('review', link.reviewState.join(','))
    const query = params.toString()
    navigate(query ? `${VULNERABILITY_FINDINGS_PATH}?${query}` : VULNERABILITY_FINDINGS_PATH)
  }

  return (
    <>
      <PageHeader title="취약점 관리" description="스캐너가 찾은 취약점이 실제로 우리 코드에 닿는지, 판정 근거와 함께 확인하세요." />
      <SampleNotice parts={[summary.data?.sample ? '요약' : null]} />
      <ScopeLine summary={summaryData} />
      {summary.isPending && <Loading />}
      {summary.isError && (
        <p className="notice error" role="alert">
          요약을 불러오지 못했어요.{' '}
          <button type="button" className="btn outline small" onClick={() => void summary.refetch()}>
            다시 시도
          </button>
        </p>
      )}
      {summaryData && <ReachSummaryView summary={summaryData} onOpen={openFindings} />}
    </>
  )
}

/** SCR-02 Finding 목록 (/vulnerabilities/findings). 행을 누르면 오른쪽 상세 패널(SCR-03)을 연다 */
export function VulnerabilityFindingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const findingId = parseId(searchParams.get('finding'))
  const filter = readFilter(searchParams)
  const filtered = hasFilter(filter)

  const summary = useQuery({ queryKey: SUMMARY_QUERY_KEY, queryFn: fetchReachSummary })
  const findings = useInfiniteQuery({
    queryKey: ['reach-findings', filter],
    queryFn: ({ pageParam }) => fetchReachFindings(filter, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.data.hasNext ? last.data.nextCursor : undefined),
  })
  const summaryData = summary.data?.data
  const items = findings.data?.pages.flatMap((page) => page.data.items) ?? []
  const total = findings.data?.pages[0]?.data.totalCount

  const update = useCallback(
    (changes: UrlChanges, options?: { replace?: boolean }) =>
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous)
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        return next
      }, options),
    [setSearchParams],
  )
  const setOne = (key: string) => (value: string | null) => update({ [key]: value })
  const resetFilters = () => update(Object.fromEntries(FILTER_KEYS.map((key) => [key, null])))

  // CVE 검색은 입력이 멈추고 0.3초 뒤에 건다 (SCR-02-04)
  const [cveInput, setCveInput] = useState(filter.cveContains)
  useEffect(() => setCveInput(filter.cveContains), [filter.cveContains])
  useEffect(() => {
    if (cveInput === filter.cveContains) return
    // 공백은 요청할 때만 지운다. 여기서 지우면 입력 중인 글자가 바뀐다. 글자마다 방문 기록을 남기지 않는다
    const timer = window.setTimeout(() => update({ cve: cveInput || null }, { replace: true }), 300)
    return () => window.clearTimeout(timer)
  }, [cveInput, filter.cveContains, update])

  return (
    <>
      <PageHeader title="Finding 목록" description="판정 상태와 근거로 취약점을 걸러 보세요." />
      <SampleNotice
        parts={[
          summary.data?.sample ? '상태별 개수' : null,
          findings.data?.pages.some((page) => page.sample) ? 'Finding 목록' : null,
        ]}
      />
      <ScopeLine summary={summaryData} />

      <div className="stack">
        {summaryData && (
          <div className="reach-chips" role="group" aria-label="판정 상태별 개수 (대상 전체 기준)">
            {reachStatusOrder.map((status) => {
              const active = filter.status.length === 1 && filter.status[0] === status
              return (
                <button
                  key={status}
                  type="button"
                  className={`reach-chip ${active ? 'active' : ''}`.trim()}
                  aria-pressed={active}
                  onClick={() => update({ status: active ? null : status })}
                >
                  <ReachStatusBadge status={status} />
                  <strong>{summaryData.byStatus[status]}</strong>
                </button>
              )
            })}
          </div>
        )}

        <section className="card list-card">
          <div className="toolbar reach-filters">
            <div className="row reach-filter-row">
              <FilterSelect label="상태" values={filter.status} options={reachStatusOrder} optionLabel={(v) => reachStatusLabel[v]} onChange={setOne('status')} />
              <FilterSelect label="심각도" values={filter.severity} options={reachSeverityOrder} optionLabel={(v) => v} onChange={setOne('severity')} />
              <FilterSelect label="검토 상태" values={filter.reviewState} options={reachReviewOrder} optionLabel={(v) => reachReviewLabel[v]} onChange={setOne('review')} />
              <FilterSelect label="배포 상태" values={filter.deployment} options={reachDeploymentOrder} optionLabel={(v) => reachDeploymentLabel[v]} onChange={setOne('deployment')} />
              <input
                className="input reach-cve-input"
                type="search"
                placeholder="CVE 검색 (예: 89407)"
                aria-label="CVE 검색"
                value={cveInput}
                onChange={(event) => setCveInput(event.target.value)}
              />
            </div>
            <button type="button" className="btn outline small" onClick={resetFilters} disabled={!filtered}>
              필터 초기화
            </button>
          </div>

          {findings.isError && (
            <p className="notice error reach-table-notice" role="alert">
              Finding 목록을 불러오지 못했어요.{' '}
              <button type="button" className="btn outline small" onClick={() => void findings.refetch()}>
                다시 시도
              </button>
            </p>
          )}

          {findings.isPending && <Loading />}

          {findings.isSuccess && items.length === 0 && (
            filtered ? (
              <EmptyState title="조건에 맞는 Finding이 없어요" description="필터를 바꾸거나 초기화해 보세요." />
            ) : (
              <EmptyState title="이 대상에서 찾은 취약점이 없어요" description="스캔 결과가 들어오면 여기에 보여줘요." />
            )
          )}

          {items.length > 0 && (
            <ReachFindingTable items={items} onSelect={(id) => update({ finding: String(id) }, { replace: true })} />
          )}

          {items.length > 0 && (
            <div className="table-foot reach-table-foot">
              <span>{total !== undefined ? `${total}건 중 ${items.length}건 표시` : `${items.length}건 표시`}</span>
              {findings.hasNextPage && (
                <button
                  type="button"
                  className="btn outline small"
                  onClick={() => void findings.fetchNextPage()}
                  disabled={findings.isFetchingNextPage}
                >
                  {findings.isFetchingNextPage ? '불러오는 중…' : '더 보기'}
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {/* 상세 패널은 열고 닫을 때 방문 기록을 남기지 않는다 (뒤로 가기가 패널을 다시 열지 않게) */}
      <ReachFindingDrawer
        findingId={findingId}
        onClose={() => update({ finding: null }, { replace: true })}
        onShowSameCve={(cve) => setSearchParams(new URLSearchParams({ cve }))}
      />
    </>
  )
}
