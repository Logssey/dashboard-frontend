import { Fragment, useCallback, useMemo } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import {
  fetchReachScan,
  fetchReachScans,
  type ReachScan,
  type ReachScanFilter,
  type ReachScanStatus,
  type ReachTrigger,
} from '@/api/reach'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { ReachScanStatusBadge } from '@/components/ReachBadges'
import { ReachNewScanDialog } from '@/components/ReachNewScanDialog'
import { ReachRescanButton } from '@/components/ReachRescanButton'
import { canRescan, emptyNewScanForm, formatKst, hasActiveScan, type NewScanForm, scanCountsText, scanTargetRef } from '@/lib/reach'
import {
  labelOf,
  reachScanStatusLabel,
  reachScanStatusOrder,
  reachL3Label,
  reachL3Order,
  reachStageLabel,
  reachStageStatusLabel,
  reachStatusLabel,
  reachStatusOrder,
  reachToolLabel,
  reachTriggerLabel,
  reachTriggerOrder,
} from '@/lib/reachLabels'
import { VULNERABILITY_FINDINGS_PATH } from '@/lib/reachRoutes'
import { CiChecksTab, parseCheckId } from './ReachCiChecksTab'
import './reach.css'

// SCR-05 스캔 실행·이력 (/vulnerabilities/scans). 왼쪽은 이력 표(API-02), 오른쪽은 고른 스캔의 상세(API-03).
// 필터·고른 스캔·새 스캔 대화상자는 주소 쿼리에 둔다. 워크로드 화면의 [스캔 요청]이 new=image&repository=&digest=로 연다.
// 탭(SCR-05-02)은 주소 쿼리 tab=ci로 남긴다. CI 검사 탭(SCR-05-10)은 API-12 목록 조회가 없어(미결 7) 검사 ID(check)로 한 건씩 본다

const POLL_MS = 10_000
/** 앱 코드 형식 (명세 3-2). 어떤 코드가 있는지는 설치 설정이 정하고 서버가 확인한다 */
const APP_CODE = /^[A-Z][A-Z0-9_]{0,9}$/
/** 새 스캔 대화상자를 여는 주소 쿼리 */
const NEW_SCAN_KEYS = ['new', 'app', 'repository', 'digest', 'repo', 'commit', 'path'] as const
const CLOSED_NEW_SCAN = Object.fromEntries(NEW_SCAN_KEYS.map((key) => [key, null])) as Record<string, null>

type UrlChanges = Record<string, string | null>

function parseList<T extends string>(value: string | null, allowed: readonly T[]): T[] {
  if (!value) return []
  return value.split(',').filter((item): item is T => (allowed as readonly string[]).includes(item))
}

function parseId(value: string | null): number | null {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

/** 주소 쿼리 new=image|repo와 미리 채울 값으로 대화상자 초기값을 만든다. 없으면 닫힌 상태(null) */
export function readNewScan(params: URLSearchParams): NewScanForm | null {
  const kind = params.get('new')
  if (kind !== 'image' && kind !== 'repo') return null
  const app = params.get('app')
  return {
    ...emptyNewScanForm,
    type: kind === 'repo' ? 'REPO' : 'IMAGE',
    app: app && APP_CODE.test(app) ? app : '',
    repository: params.get('repository') ?? '',
    digest: params.get('digest') ?? '',
    repoName: params.get('repo') ?? '',
    commit: params.get('commit') ?? '',
    path: params.get('path') ?? '',
  }
}

/** 실패한 스캔을 같은 대상으로 다시 요청할 때 대화상자에 넣을 주소 쿼리 (SCR-05-08 [다시 실행]) */
export function rerunParams(scan: ReachScan): UrlChanges {
  const { target } = scan
  if (target.type === 'IMAGE' && target.image) {
    return { new: 'image', app: target.app, repository: target.image.repository, digest: target.image.digest }
  }
  return { new: 'repo', app: target.app, repo: target.repo?.name ?? null, commit: target.repo?.commit ?? null, path: target.repo?.path ?? null }
}

function FilterSelect<T extends string>({ label, value, options, optionLabel, onChange }: {
  label: string
  value: T | undefined
  options: readonly T[]
  optionLabel: (value: T) => string
  onChange: (value: T | null) => void
}) {
  return (
    <select className="select" aria-label={label} value={value ?? ''} onChange={(event) => onChange(event.target.value ? (event.target.value as T) : null)}>
      <option value="">{`모든 ${label}`}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {optionLabel(option)}
        </option>
      ))}
    </select>
  )
}

/** 결과 글. 좁은 칸에서도 "도달 가 / 능 0"처럼 낱말 중간에서 끊기지 않게 마디마다 묶는다 */
function CountsText({ scan }: { scan: ReachScan }) {
  const parts = scanCountsText(scan).split(' · ')
  return (
    <span className="reach-counts">
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && ' · '}
          <span className="reach-nowrap">{part}</span>
        </Fragment>
      ))}
    </span>
  )
}

export function ReachScanTable({ items, selectedId, onSelect }: { items: ReachScan[]; selectedId: number | null; onSelect: (id: number) => void }) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="스캔 이력 표. 좁은 화면에서는 가로로 스크롤하세요.">
      <table className="reach-table">
        <thead>
          <tr>
            <th scope="col">시작</th>
            <th scope="col">대상</th>
            <th scope="col">트리거</th>
            <th scope="col">상태</th>
            <th scope="col">결과</th>
          </tr>
        </thead>
        <tbody>
          {items.map((scan) => (
            <tr
              key={scan.id}
              className={`reach-row ${scan.id === selectedId ? 'selected' : ''}`.trim()}
              aria-selected={scan.id === selectedId}
              onClick={() => onSelect(scan.id)}
            >
              <td className="reach-nowrap">{formatKst(scan.startedAt ?? scan.createdAt).replace(' KST', '')}</td>
              <td>
                <button
                  type="button"
                  className="finding-link"
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect(scan.id)
                  }}
                >
                  #{scan.id} {scan.target.displayName}
                </button>
                <span className="asset">
                  {scan.target.type === 'IMAGE' ? '이미지' : '레포'} · {scanTargetRef(scan)}
                </span>
              </td>
              <td>{labelOf(reachTriggerLabel, scan.trigger)}</td>
              <td>
                <ReachScanStatusBadge status={scan.scanStatus} />
              </td>
              <td>
                <CountsText scan={scan} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** SCR-05-05~08 스캔 상세. onRescanned를 주면 성공한 스캔에 [다시 대조]가 보인다 */
export function ReachScanDetail({ scan, onRerun, onRescanned }: {
  scan: ReachScan
  onRerun: () => void
  onRescanned?: (created: ReachScan) => void
}) {
  const tools = Object.entries(scan.tools ?? {}).filter(([, value]) => value)
  const stages = scan.stages ?? []
  return (
    <div className="reach-scan-detail">
      <div className="reach-section">
        <div className="row reach-title-row">
          <h2>스캔 #{scan.id}</h2>
          <ReachScanStatusBadge status={scan.scanStatus} />
        </div>
        <p>
          <strong>{scan.target.displayName}</strong>
          <span className="asset reach-mono" title={scan.target.image?.digest ?? scan.target.repo?.commit}>
            {scanTargetRef(scan)}
          </span>
        </p>
        <dl className="reach-kv">
          <dt>앱</dt>
          <dd>{scan.target.app}</dd>
          <dt>트리거</dt>
          <dd>{labelOf(reachTriggerLabel, scan.trigger)}</dd>
          <dt>요청</dt>
          <dd>{formatKst(scan.createdAt)}</dd>
          <dt>시작</dt>
          <dd>{formatKst(scan.startedAt)}</dd>
          <dt>끝</dt>
          <dd>{formatKst(scan.finishedAt)}</dd>
          {scan.rescanOf && (
            <>
              <dt>재대조</dt>
              <dd>스캔 #{scan.rescanOf}의 SBOM을 다시 씀</dd>
            </>
          )}
        </dl>
      </div>

      <section className="reach-section">
        <h3>단계</h3>
        {stages.length === 0 ? (
          <p className="caption">
            {scan.scanStatus === 'QUEUED'
              ? '아직 시작하지 않았어요.'
              : scan.scanStatus === 'RUNNING'
                ? '단계 기록을 기다리는 중이에요.'
                : '이 스캔에는 단계 기록이 없어요.'}
          </p>
        ) : (
          <ol className="reach-stages">
            {stages.map((stage) => (
              <li key={stage.name} className={`reach-stage ${String(stage.status).toLowerCase()}`}>
                <span className="reach-stage-name">{labelOf(reachStageLabel, stage.name)}</span>
                <span className="caption">
                  {labelOf(reachStageStatusLabel, stage.status)}
                  {stage.durationSeconds !== undefined && ` · ${stage.durationSeconds}초`}
                </span>
                {stage.message && <span className="reach-stage-message">{stage.message}</span>}
              </li>
            ))}
          </ol>
        )}
      </section>

      {(scan.scanStatus === 'QUEUED' || scan.scanStatus === 'RUNNING') && (
        <p className="notice" role="status">
          {scan.scanStatus === 'QUEUED'
            ? '스캔 실행기(GitHub 워크플로)가 가져가면 진행 중으로 바뀌어요. 실행기가 연결되지 않은 환경에서는 대기에 머물러요.'
            : '스캔이 진행 중이에요.'}{' '}
          10초마다 상태를 다시 받아요.
        </p>
      )}

      {scan.l3 && (
        <section className="reach-section">
          <h3>실제 실행 (L3)</h3>
          {scan.l3.runStatus === 'FAILED' ? (
            <p className="notice">
              이 스캔에서 앱을 띄워 보는 단계가 실패했어요. 스캔 결과에는 영향이 없어요.
              {scan.l3.error && <span className="asset">{scan.l3.error}</span>}
            </p>
          ) : (
            <p>
              {reachL3Order.map((level) => (
                <span key={level} className="reach-l3-count">
                  <span className="caption">{reachL3Label[level]}</span> <strong>{scan.l3?.counts?.[level] ?? 0}</strong>
                </span>
              ))}
              <span className="asset">
                시나리오 {scan.l3.scenario} · {formatKst(scan.l3.observedAt)}
              </span>
            </p>
          )}
        </section>
      )}

      {scan.failure && (
        <p className="notice error" role="status">
          실패: {scan.failure.code}
          {scan.failure.stage && ` (${labelOf(reachStageLabel, scan.failure.stage)})`}
          {scan.failure.message && ` — ${scan.failure.message}`}
        </p>
      )}

      {tools.length > 0 && (
        <section className="reach-section">
          <h3>도구·DB 버전</h3>
          <dl className="reach-kv">
            {tools.map(([name, value]) => (
              <div key={name} className="reach-kv-row">
                <dt>{labelOf(reachToolLabel, name)}</dt>
                <dd>{name.endsWith('At') ? formatKst(value) : value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="reach-section">
        <h3>결과</h3>
        {scan.counts ? (
          <>
            <p>
              <CountsText scan={scan} />
            </p>
            <ul className="reach-count-list">
              {reachStatusOrder.map((status) => (
                <li key={status}>
                  <span className="caption">{labelOf(reachStatusLabel, status)}</span> <strong>{scan.counts!.byStatus[status] ?? 0}</strong>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="caption">{scan.scanStatus === 'FAILED' ? '실패한 스캔은 결과가 없어요.' : '스캔이 끝나면 결과를 보여줘요.'}</p>
        )}
        <div className="row reach-scan-actions">
          {scan.scanStatus === 'SUCCEEDED' && (
            <Link className="btn soft small" to={`${VULNERABILITY_FINDINGS_PATH}?scan=${scan.id}`}>
              결과 보기
            </Link>
          )}
          {onRescanned && canRescan(scan) && <ReachRescanButton key={scan.id} scanId={scan.id} onCreated={onRescanned} />}
          {scan.scanStatus === 'FAILED' && (
            <button type="button" className="btn outline small" onClick={onRerun}>
              다시 실행
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

function ScanDetailPanel({ scanId, onRerun, onRescanned, onClose }: {
  scanId: number
  onRerun: (scan: ReachScan) => void
  onRescanned: (created: ReachScan) => void
  onClose: () => void
}) {
  const detail = useQuery({
    queryKey: ['reach-scan', scanId],
    queryFn: () => fetchReachScan(scanId),
    refetchInterval: (query) => {
      const status = query.state.data?.data.scanStatus
      return status === 'QUEUED' || status === 'RUNNING' ? POLL_MS : false
    },
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  })
  const scan = detail.data?.data
  return (
    <aside className="card reach-scan-panel" aria-label="스캔 상세">
      <div className="row reach-panel-head">
        <span className="caption">스캔 상세</span>
        <button type="button" className="btn outline small" onClick={onClose}>
          닫기
        </button>
      </div>
      {detail.isPending && <div className="skeleton" />}
      {detail.isError && <p className="notice error">스캔 #{scanId}을 불러오지 못했어요. 지워졌거나 없는 스캔일 수 있어요.</p>}
      {scan && <ReachScanDetail scan={scan} onRerun={() => onRerun(scan)} onRescanned={onRescanned} />}
    </aside>
  )
}

export function VulnerabilityScansPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const filter: ReachScanFilter = {
    scanStatus: parseList(searchParams.get('status'), reachScanStatusOrder),
    trigger: parseList(searchParams.get('trigger'), reachTriggerOrder),
  }
  const selectedId = parseId(searchParams.get('scan'))
  const tab = searchParams.get('tab') === 'ci' ? 'ci' : 'history'
  const checkId = parseCheckId(searchParams.get('check'))
  // 대화상자는 초기값이 바뀔 때만 다시 채운다. 렌더마다 새 객체를 주면 입력 중인 값이 지워진다
  const newScanKey = NEW_SCAN_KEYS.map((key) => searchParams.get(key) ?? '').join('\n')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const newScan = useMemo(() => readNewScan(searchParams), [newScanKey])

  const scans = useInfiniteQuery({
    queryKey: ['reach-scans', filter],
    queryFn: ({ pageParam }) => fetchReachScans(filter, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.data.hasNext ? last.data.nextCursor : undefined),
    refetchInterval: (query) => (hasActiveScan(query.state.data?.pages.flatMap((page) => page.data.items) ?? []) ? POLL_MS : false),
  })
  const items = scans.data?.pages.flatMap((page) => page.data.items) ?? []
  const total = scans.data?.pages[0]?.data.totalCount
  const filtered = filter.scanStatus.length > 0 || filter.trigger.length > 0

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
  const closeNewScan = () => update(CLOSED_NEW_SCAN, { replace: true })

  return (
    <>
      <PageHeader
        title="스캔"
        description="스캔을 요청하고 진행 상태와 이력을 확인하세요."
        actions={
          <button type="button" className="btn primary" onClick={() => update({ new: 'image' })}>
            새 스캔
          </button>
        }
      />
      {scans.data?.pages.some((page) => page.sample) && (
        <p className="notice page-notice" role="status">
          백엔드에 스캔 이력 API(API-02)가 없어 API 명세의 예시 값(PoC 스캔 1건)으로 보여주고 있어요. 실제 실행 기록이 아니에요.
        </p>
      )}

      <div className="tabs reach-tabs" role="tablist" aria-label="스캔">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          className={`tab reach-tab ${tab === 'history' ? 'active' : ''}`.trim()}
          onClick={() => update({ tab: null }, { replace: true })}
        >
          스캔 이력
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'ci'}
          className={`tab reach-tab ${tab === 'ci' ? 'active' : ''}`.trim()}
          onClick={() => update({ tab: 'ci' }, { replace: true })}
        >
          CI 검사
        </button>
      </div>

      {tab === 'ci' && (
        <CiChecksTab
          checkId={checkId}
          onCheck={(id) => update({ check: id ? String(id) : null })}
          onShowPrScans={() => update({ tab: null, check: null, trigger: 'PR', status: null })}
        />
      )}

      {tab === 'history' && (
        <div className={`reach-scans-layout ${selectedId ? 'with-detail' : ''}`.trim()}>
          <section className="card list-card">
            <div className="toolbar reach-filters">
              <div className="row reach-filter-row">
                <FilterSelect
                  label="상태"
                  value={filter.scanStatus.length === 1 ? filter.scanStatus[0] : undefined}
                  options={reachScanStatusOrder}
                  optionLabel={(value: ReachScanStatus) => reachScanStatusLabel[value]}
                  onChange={(value) => update({ status: value })}
                />
                <FilterSelect
                  label="트리거"
                  value={filter.trigger.length === 1 ? filter.trigger[0] : undefined}
                  options={reachTriggerOrder}
                  optionLabel={(value: ReachTrigger) => reachTriggerLabel[value]}
                  onChange={(value) => update({ trigger: value })}
                />
              </div>
              <button type="button" className="btn outline small" onClick={() => update({ status: null, trigger: null })} disabled={!filtered}>
                필터 초기화
              </button>
            </div>

            {scans.isError && (
              <p className="notice error reach-table-notice" role="alert">
                스캔 이력을 불러오지 못했어요.{' '}
                <button type="button" className="btn outline small" onClick={() => void scans.refetch()}>
                  다시 시도
                </button>
              </p>
            )}
            {scans.isPending && (
              <div className="reach-loading" role="status" aria-live="polite">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="skeleton" />
                ))}
                <span className="reach-sr-only">불러오는 중</span>
              </div>
            )}
            {scans.isSuccess && items.length === 0 &&
              (filtered ? (
                <EmptyState title="조건에 맞는 스캔이 없어요" description="필터를 바꾸거나 초기화해 보세요." />
              ) : (
                <EmptyState title="아직 스캔이 없어요" description="[새 스캔]에서 실행 중인 이미지를 골라 스캔해 보세요." />
              ))}
            {items.length > 0 && (
              <ReachScanTable items={items} selectedId={selectedId} onSelect={(id) => update({ scan: String(id) }, { replace: true })} />
            )}
            {items.length > 0 && (
              <div className="table-foot reach-table-foot">
                <span>
                  {total !== undefined && total !== null ? `${total}건 중 ${items.length}건 표시` : `${items.length}건 표시`}
                  {hasActiveScan(items) && ' · 진행 중인 스캔은 10초마다 다시 받아요'}
                </span>
                {scans.hasNextPage && (
                  <button type="button" className="btn outline small" onClick={() => void scans.fetchNextPage()} disabled={scans.isFetchingNextPage}>
                    {scans.isFetchingNextPage ? '불러오는 중…' : '더 보기'}
                  </button>
                )}
              </div>
            )}
          </section>

          {selectedId && (
            <ScanDetailPanel
              scanId={selectedId}
              onClose={() => update({ scan: null }, { replace: true })}
              onRerun={(scan) => update(rerunParams(scan))}
              onRescanned={(created) => update({ scan: String(created.id) }, { replace: true })}
            />
          )}
        </div>
      )}

      <ReachNewScanDialog
        initial={newScan}
        onClose={closeNewScan}
        onCreated={(scan) => {
          void queryClient.invalidateQueries({ queryKey: ['reach-scans'] })
          update({ ...CLOSED_NEW_SCAN, scan: String(scan.id) }, { replace: true })
        }}
      />
    </>
  )
}
