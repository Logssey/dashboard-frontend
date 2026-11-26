import { useEffect, useRef, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { fetchConnectionSetupOptions, fetchManagedConnections, testSecretConnection, type ManagedSecretConnection, type ScanAttempt, type SecretConnectionTestResult } from '@/api/secretConnections'
import { requestSecretScan } from '@/api/secretRuns'
import { PageHeader } from '@/components/PageHeader'
import { SecretDetailPanel } from '@/components/SecretDetailPanel'
import { SecretFilterDisclosure } from '@/components/SecretFilterDisclosure'
import { SecretOperationsHealth } from '@/components/SecretOperationsHealth'
import { SecretScanProgress } from '@/components/SecretScanProgress'
import { SecretConnectionValidationSettings } from '@/components/SecretConnectionValidationSettings'
import { SecretConnectionManager } from '@/components/SecretConnectionManager'
import { positiveId, scanDate, scanPlatforms, scanReason, scanRunStatus, scanStatus } from '@/lib/secretScan'
import './secret-connections.css'
import './secret-scan.css'
import './secret-scope-workspace.css'

export function AttemptLink({ attempt }: { attempt: ScanAttempt | null | undefined; origin?: string }) {
  return attempt ? <><Link to={`/secrets/history/${attempt.runId}`}>SCAN-{attempt.runId} · {scanRunStatus(attempt.runStatus ?? attempt.status)}</Link><small>{scanDate(attempt.finishedAt ?? attempt.requestedAt)}</small></> : <>확인 기록 없음</>
}

function probeLabel(status?: string) {
  return status === 'CONNECTED' ? '연결 확인됨' : status === 'FAILED' ? '연결 확인 실패' : status === 'UNAVAILABLE' ? '연결 확인 불가' : '연결 테스트 전'
}
const blockedLabel = (reason?: string | null) => ({
  OPERATIONS_ROLE_REQUIRED: '연결 운영 권한이 필요해요.', PROVIDER_UNSUPPORTED: '현재 수집을 지원하지 않는 플랫폼이에요.',
  CONNECTION_PAUSED: '일시중지된 연결이에요.', NO_SCAN_TARGETS: '검사할 대상을 등록하세요.',
  INVALID_APPROVED_SCOPE: '등록된 검사 대상 형식을 확인하세요.', NOTION_COLLECTION_DISABLED: scanReason('NOTION_COLLECTION_DISABLED'),
} as Record<string, string>)[reason ?? ''] ?? '연결 권한과 설정을 확인하세요.'

function ConnectionCard({ connection, selected, result, testing, error, onTest, onSelect, onScan, onValidationSettings, onSettings }: {
  connection: ManagedSecretConnection; selected: boolean; result?: SecretConnectionTestResult;
  testing: boolean; error?: string; onTest: (id: number) => void;
  onSelect: (connection: ManagedSecretConnection) => void; onScan: (connection: ManagedSecretConnection) => void;
  onValidationSettings: (connectionId: number) => void;
  onSettings: (connectionId: number) => void;
}) {
  const probe = result && (!connection.latestProbe || Date.parse(result.checkedAt) >= Date.parse(connection.latestProbe.checkedAt)) ? result : connection.latestProbe
  const name = connection.safeDisplayAlias ?? `${scanPlatforms[connection.provider]} 연결`
  return <article className={`secret-connection-card${selected ? ' selected' : ''}`}>
    <button className="secret-connection-select" data-connection-id={connection.connectionId} type="button" aria-pressed={selected} aria-controls="secret-selected-scan" onClick={() => onSelect(connection)}>
      <span className={`secret-provider-mark ${connection.provider.toLowerCase()}`} aria-hidden="true">{connection.provider === 'GITHUB' ? 'GH' : connection.provider === 'AWS' ? 'aws' : 'N'}</span>
      <span><strong>{scanPlatforms[connection.provider] ?? '수집 연결'}</strong><span>{name}</span></span>
      <span className={`secret-connection-state ${connection.connectionStatus === 'ACTIVE' ? '' : 'inactive'}`}>{connection.connectionStatus === 'ACTIVE' ? '사용 중' : connection.connectionStatus === 'PAUSED' ? '일시중지' : '확인 필요'}</span>
    </button>
    <p className="secret-connection-target-count">검사 대상 {connection.approvedScopeCount}개{connection.activeJob && <span> · {scanStatus(connection.activeJob.status)}</span>}</p>
    {selected && !!connection.targetSummary?.length && <ul className="secret-connection-targets">{connection.targetSummary.slice(0, 2).map((target) => <li key={target}>{target}</li>)}</ul>}
      <div className={`secret-connection-probe ${probe?.status.toLowerCase() ?? 'unavailable'}`} role="status">
        <strong>{probeLabel(probe?.status)}</strong>
        {probe?.checkedAt && <span>{scanDate(probe.checkedAt)}</span>}
        {probe?.reasonCode && <p>{scanReason(probe.reasonCode)}</p>}
      </div>
    {error && <p className="secret-connection-test-error" role="alert">{error}</p>}
    <div className="secret-connection-actions">
      <button className="btn secret-connection-test-button" disabled={testing || !connection.capabilities?.canTest} onClick={() => onTest(connection.connectionId)}>{testing ? '연결 확인 중…' : '연결 테스트'}</button>
      <button className="btn primary" disabled={!connection.activeJob && !connection.capabilities?.canRun} onClick={() => onScan(connection)}>{connection.activeJob ? '검사 진행 중' : '검사 요청'}</button>
      <Link className="btn outline" to={`/secrets/connections/${connection.connectionId}/scopes`}>검사 대상</Link>
      <button className="btn outline" onClick={() => onValidationSettings(connection.connectionId)}>키 검증 설정</button>
      {(connection.provider === 'GITHUB' || connection.provider === 'AWS') && <button className="btn outline" onClick={() => onSettings(connection.connectionId)}>설정</button>}
    </div>
    {selected && <>
      {!connection.capabilities?.canRun && !connection.activeJob && <p className="caption">{blockedLabel(connection.scanBlockedReasonCode)}</p>}
      {!connection.capabilities?.canTest && <p className="caption">연결 테스트 · {blockedLabel(connection.testBlockedReasonCode)}</p>}
      <details className="secret-connection-explanation"><summary>검사 일정·최근 성공</summary><dl className="secret-connection-facts">
        <dt>최근 시도</dt><dd><AttemptLink attempt={connection.lastFullScanAttempt} /></dd>
        <dt>최근 전체 성공</dt><dd><AttemptLink attempt={connection.lastSuccessfulFullScan} /></dd>
        <dt>다음 정기 검사</dt><dd>{connection.nextDueAt ? scanDate(connection.nextDueAt) : '예정 시각 미확인'}</dd>
      </dl></details>
    </>}
  </article>
}

export function SecretConnectionsPage() {
  const [params, setParams] = useSearchParams()
  const page = (positiveId(params.get('page')) ?? 1) - 1
  const status = params.get('status') ?? ''
  const requestedConnection = positiveId(params.get('connectionId'))
  const requestedRun = positiveId(params.get('runId'))
  const validationConnectionId = positiveId(params.get('validationConnectionId'))
  const valid = ['', 'ACTIVE', 'PAUSED', 'ERROR'].includes(status)
    && (!params.get('connectionId') || requestedConnection != null)
    && (!params.get('runId') || requestedRun != null)
    && (!params.has('validationConnectionId') || validationConnectionId != null)
  const client = useQueryClient()
  const mounted = useRef(true)
  const [results, setResults] = useState<Record<number, SecretConnectionTestResult>>({})
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [confirmConnection, setConfirmConnection] = useState<ManagedSecretConnection | null>(null)
  const [manager, setManager] = useState<{ connectionId: number | null } | null>(() => valid && params.get('settings') === 'policy' && requestedConnection ? { connectionId: requestedConnection } : null)
  useEffect(() => {
    if (valid && params.get('settings') === 'policy' && requestedConnection) setManager({ connectionId: requestedConnection })
  }, [valid, requestedConnection, params.get('settings')])
  const [showOperations, setShowOperations] = useState(false)
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1000px)').matches)
  const progressPanel = useRef<HTMLElement>(null)
  const returnFocusConnection = useRef<number | null>(null)
  const request = useRef({ connectionId: 0, key: '' })
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1000px)')
    const update = () => setCompact(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (compact && requestedRun) progressPanel.current?.focus()
  }, [compact, requestedRun])

  const connections = useQuery({
    queryKey: ['secret-connections-manage', page, status, ''],
    queryFn: () => fetchManagedConnections(page, status, ''),
    enabled: valid,
    placeholderData: keepPreviousData,
    retry: false,
    refetchInterval: (query) => query.state.error ? false : query.state.data?.items.some((item) => item.activeJob) ? 10_000 : false,
    refetchIntervalInBackground: false,
  })
  const setup = useQuery({ queryKey: ['secret-connection-setup-options'], queryFn: fetchConnectionSetupOptions, retry: false, refetchOnWindowFocus: false })
  const items = connections.data?.items ?? []
  const selected = requestedConnection ? items.find((item) => item.connectionId === requestedConnection) : items.find((item) => item.activeJob) ?? items.find((item) => item.connectionStatus === 'ACTIVE') ?? items[0]
  const runId = requestedRun ?? selected?.activeJob?.runId ?? selected?.lastFullScanAttempt?.runId

  useEffect(() => {
    if (!compact || requestedRun || returnFocusConnection.current == null || !connections.isSuccess) return
    const button = document.querySelector<HTMLButtonElement>(`[data-connection-id="${returnFocusConnection.current}"]`)
    if (!button) return
    button.focus()
    returnFocusConnection.current = null
  }, [compact, requestedRun, connections.data, connections.isSuccess])

  useEffect(() => {
    if (!params.has('origin')) return
    const next = new URLSearchParams(params)
    next.delete('origin')
    setParams(next, { replace: true })
  }, [params, setParams])

  const selectConnection = (connection: ManagedSecretConnection) => {
    const next = new URLSearchParams(params)
    next.delete('origin')
    next.set('connectionId', String(connection.connectionId))
    const latest = connection.activeJob?.runId ?? connection.lastFullScanAttempt?.runId
    if (latest) next.set('runId', String(latest))
    else next.delete('runId')
    setParams(next)
  }
  const openValidationSettings = (connectionId: number) => {
    const next = new URLSearchParams(params)
    next.set('validationConnectionId', String(connectionId))
    setParams(next)
  }
  const closeValidationSettings = () => {
    const next = new URLSearchParams(params)
    next.delete('validationConnectionId')
    setParams(next)
  }
  const changeStatus = (value: string) => {
    const next = new URLSearchParams()
    if (value) next.set('status', value)
    next.set('page', '1')
    setParams(next)
  }
  const showConnections = () => {
    returnFocusConnection.current = requestedConnection ?? selected?.connectionId ?? null
    const next = new URLSearchParams(params)
    next.delete('runId')
    setParams(next)
  }
  const test = useMutation({
    mutationFn: testSecretConnection,
    onMutate: (id) => setErrors((current) => ({ ...current, [id]: '' })),
    onSuccess: (result) => {
      setResults((current) => ({ ...current, [result.connectionId]: result }))
      void client.invalidateQueries({ queryKey: ['secret-connections-manage'] })
    },
    onError: (error, id) => setErrors((current) => ({ ...current, [id]: error instanceof ApiError && error.status === 403 ? '연결 테스트 권한을 확인하세요.' : error instanceof ApiError && error.status === 409 ? '연결의 중지 상태와 설정을 확인하세요.' : '연결 테스트를 마치지 못했어요. 다시 확인해 주세요.' })),
  })
  const start = useMutation({
    mutationFn: requestSecretScan,
    onSuccess: (accepted, variables) => {
      void client.invalidateQueries({ queryKey: ['secret-connections-manage'] })
      void client.invalidateQueries({ queryKey: ['secret-runs'] })
      if (!mounted.current) return
      setConfirmConnection(null)
      request.current = { connectionId: 0, key: '' }
      const next = new URLSearchParams(params)
      next.delete('origin')
      next.set('connectionId', String(variables.connectionId))
      next.set('runId', String(accepted.runId))
      setParams(next)
    },
  })
  const openScan = (connection: ManagedSecretConnection) => {
    if (connection.activeJob) { selectConnection(connection); return }
    if (request.current.connectionId !== connection.connectionId || !request.current.key) request.current = { connectionId: connection.connectionId, key: crypto.randomUUID() }
    start.reset()
    setConfirmConnection(connection)
  }
  const completed = () => {
    for (const key of ['secret-connections-manage', 'secret-runs', 'secret-summary', 'secrets', 'secret-review-queue', 'secret-cases']) void client.invalidateQueries({ queryKey: [key] })
  }
  const showManagedConnection = async (connectionId: number) => {
    let targetPage = 0
    let listing = await fetchManagedConnections(targetPage)
    client.setQueryData(['secret-connections-manage', targetPage, '', ''], listing)
    while (!listing.items.some((item) => item.connectionId === connectionId) && (targetPage + 1) * listing.size < listing.total) {
      targetPage += 1
      listing = await fetchManagedConnections(targetPage)
      client.setQueryData(['secret-connections-manage', targetPage, '', ''], listing)
    }
    if (!listing.items.some((item) => item.connectionId === connectionId)) throw new ApiError(404, null, '')
    if (!mounted.current) return
    setManager(null)
    setParams(new URLSearchParams({ page: String(targetPage + 1), connectionId: String(connectionId) }))
  }

  return <>
    <PageHeader title="연결 및 설정" description="연결과 검사 대상을 확인하고 실제 검사 진행을 추적하세요." actions={<>
      {setup.data?.enabled && setup.data.canCreate && <button className="btn primary" onClick={() => setManager({ connectionId: null })}>+ 연결 추가</button>}
      <Link className="btn outline" to="/secrets/connections/policies">보관 규칙</Link>
      <button className="btn outline" disabled={connections.isFetching} onClick={() => void connections.refetch()}>새로고침</button>
    </>} />
    <SecretFilterDisclosure label="연결 조회" fields={[{ key: 'status', label: '연결 상태', options: { '': '전체 상태', ACTIVE: '활성', PAUSED: '일시중지', ERROR: '확인 필요' }, defaultValue: '' }]}
      values={{ status }} busy={connections.isFetching} onApply={(next) => changeStatus(next.status)} onReset={() => changeStatus('')} />
    {!valid ? <p className="notice error" role="alert">조회 주소를 확인해 주세요. <button className="btn outline" onClick={() => setParams(new URLSearchParams())}>조건 초기화</button></p>
      : connections.isPending ? <p className="card secret-scan-message" role="status">연결 정보를 불러오는 중이에요.</p>
      : connections.isError ? <div className="secret-connection-page-error" role="alert"><p>{connections.error instanceof ApiError && connections.error.status === 403 ? '연결 정보를 조회할 권한이 없어요.' : '연결 목록을 불러오지 못했어요.'}</p><button className="btn outline" onClick={() => void connections.refetch()}>다시 조회</button></div>
      : <div className={`secret-connection-workspace${requestedRun ? ' show-run' : ''}`}>
        <section aria-label="검사 연결 목록" aria-busy={connections.isFetching}>
          {!items.length ? <div className="secret-connection-empty"><strong>조건에 맞는 연결이 없어요.</strong><p>{status ? '연결 상태 조건을 초기화하거나 등록된 연결을 확인하세요.' : '연결과 수집 자격 증명을 등록하면 검사를 시작할 수 있어요.'}</p>{status && <button className="btn outline" onClick={() => changeStatus('')}>조건 초기화</button>}</div>
            : <div className="secret-connection-list">{items.map((connection) => <ConnectionCard key={connection.connectionId} connection={connection} selected={selected?.connectionId === connection.connectionId}
              result={results[connection.connectionId]} error={errors[connection.connectionId]} testing={test.isPending && test.variables === connection.connectionId}
              onSelect={selectConnection} onTest={(id) => test.mutate(id)} onScan={openScan} onValidationSettings={openValidationSettings} onSettings={(connectionId) => setManager({ connectionId })} />)}</div>}
          {connections.isSuccess && connections.data.total > connections.data.size && <div className="table-foot secret-table-foot"><span>연결 {connections.data.total}개</span><div className="row">
            <button className="btn outline" disabled={page === 0} onClick={() => { const next = new URLSearchParams(params); next.set('page', String(page)); setParams(next) }}>이전</button>
            <span>{page + 1} / {Math.max(1, Math.ceil(connections.data.total / connections.data.size))}</span>
            <button className="btn outline" disabled={(page + 1) * connections.data.size >= connections.data.total || connections.isPlaceholderData} onClick={() => { const next = new URLSearchParams(params); next.set('page', String(page + 2)); setParams(next) }}>다음</button>
          </div></div>}
        </section>
        <aside ref={progressPanel} id="secret-selected-scan" tabIndex={-1} aria-label="선택한 검사 실행">
          {compact && requestedRun && <button className="btn outline secret-connection-back" onClick={showConnections}>연결 목록으로</button>}
          {(!compact || requestedRun) && (runId ? <SecretScanProgress key={runId} runId={runId} expectedConnectionId={selected?.connectionId ?? requestedConnection ?? undefined} onComplete={completed} /> : <section className="secret-scan-execution-panel secret-scan-execution-placeholder"><h2>검사 진행</h2><p>{selected ? '이 연결의 검사를 요청하면 단계별 진행과 실행 내역을 확인할 수 있어요.' : '검사할 연결을 선택하세요.'}</p>{selected?.capabilities?.canRun && <button className="btn primary" onClick={() => openScan(selected)}>검사 요청</button>}</section>)}
        </aside>
      </div>}
    <SecretDetailPanel open={confirmConnection != null} title="검사 요청" closeLabel="검사 요청 닫기" className="secret-scan-request-dialog" onClose={() => { if (!start.isPending) setConfirmConnection(null) }}>
      {confirmConnection && <div className="secret-connection-scan-confirm"><h3>{scanPlatforms[confirmConnection.provider]} 연결을 검사할까요?</h3><p>{confirmConnection.safeDisplayAlias ?? `연결 #${confirmConnection.connectionId}`}</p><p>승인된 검사 대상 {confirmConnection.approvedScopeCount}개에서 내용을 읽고 키를 탐지해요.</p>
        {start.isError && <p className="notice error" role="alert">{start.error instanceof ApiError && start.error.status === 409 ? '진행 중인 검사와 현재 승인 대상을 확인하세요.' : start.error instanceof ApiError && start.error.status === 403 ? '검사 실행 권한을 확인하세요.' : '요청 결과를 확인하지 못했어요. 다시 요청하면 같은 등록 요청을 확인해요.'}</p>}
        <div className="row"><button className="btn outline" disabled={start.isPending} onClick={() => setConfirmConnection(null)}>취소</button><button className="btn primary" disabled={start.isPending} onClick={() => start.mutate({ connectionId: confirmConnection.connectionId, idempotencyKey: request.current.key })}>{start.isPending ? '등록 중…' : '검사 시작'}</button></div>
      </div>}
    </SecretDetailPanel>
    <SecretDetailPanel open={validationConnectionId != null} title="키 검증 설정" closeLabel="키 검증 설정 닫기" className="secret-connection-validation-dialog" onClose={closeValidationSettings}>
      {validationConnectionId != null && <SecretConnectionValidationSettings key={validationConnectionId} connectionId={validationConnectionId} />}
    </SecretDetailPanel>
    {manager && <SecretConnectionManager connectionId={manager.connectionId} onClose={() => { setManager(null); if (params.get('settings') === 'policy') { const next = new URLSearchParams(params); next.delete('settings'); setParams(next, { replace: true }) } }} onChanged={() => { void client.invalidateQueries({ queryKey: ['secret-connections-manage'] }); completed() }} onReady={showManagedConnection} />}
    <details className="secret-connection-operations" onToggle={(event) => setShowOperations(event.currentTarget.open)}><summary>워커 운영 상태</summary>{showOperations && <SecretOperationsHealth />}</details>
  </>
}
