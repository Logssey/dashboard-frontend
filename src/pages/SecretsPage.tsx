import { useEffect, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import {
  fetchSecretConnections, fetchSecretRun, fetchSecrets, startSecretRun,
  type SecretFilter, type SecretItem, type SecretRunAccepted, type SecretRunStatus,
} from '@/api/secrets'
import { Badge } from '@/components/Badge'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { MetricCard } from '@/components/MetricCard'
import { PageHeader } from '@/components/PageHeader'
import { SecretDetailDrawer } from '@/components/SecretDetailDrawer'
import { componentStateLabel, credentialTypeLabel, issuerLabel, secretValidationLabel } from '@/lib/labels'

const koreaDate = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' })
const terminalStatuses = new Set<SecretRunStatus>(['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED'])

function runStatusText(status: SecretRunStatus): string {
  switch (status) {
    case 'PENDING': return '실행 대기 중'
    case 'RUNNING': return '수집·탐지 진행 중'
    case 'SUCCEEDED': return '검사 완료'
    case 'PARTIAL': return '일부 범위만 검사 완료'
    case 'FAILED': return '검사 실패'
    case 'CANCELLED': return '검사 취소'
    default: return '상태 확인 중'
  }
}

function stageText(status: string): string {
  switch (status) {
    case 'PENDING': return '대기'
    case 'RUNNING': return '진행 중'
    case 'SUCCEEDED': return '완료'
    case 'PARTIAL': return '일부 완료'
    case 'FAILED': return '실패'
    case 'SKIPPED': return '건너뜀'
    default: return '미확인'
  }
}

function scopeLabel(type: string): string {
  switch (type) {
    case 'IAM_ACCESS_KEY_METADATA': return 'IAM 접근키 메타데이터'
    case 'AWS_SECRETS_MANAGER_METADATA': return 'Secrets Manager 목록'
    case 'AWS_SSM_PARAMETER_METADATA': return 'SSM Parameter 목록'
    case 'AWS_S3_BUCKET_METADATA': return 'S3 버킷 목록'
    case 'AWS_SECRETS_MANAGER_VALUE': return 'Secrets Manager 값'
    case 'AWS_SSM_PARAMETER_VALUE': return 'SSM Parameter 값'
    case 'AWS_S3_OBJECT_CONTENT': return 'S3 객체 내용'
    case 'GITHUB_REPOSITORY_FILES': return 'GitHub 파일'
    default: return '미지원 범위'
  }
}

/** Secret 전용 목록과 비동기 실행 상태. 키 원문은 사용하지 않는다. */
export function SecretsPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filter, setFilter] = useState<SecretFilter>({ page: 0, size: 20, issuer: 'ALL', componentState: 'ALL' })
  const [connectionId, setConnectionId] = useState<number | null>(null)
  const [acceptedRun, setAcceptedRun] = useState<SecretRunAccepted | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const requestedRunId = Number(searchParams.get('run'))
  const runId = Number.isSafeInteger(requestedRunId) && requestedRunId > 0 ? requestedRunId : null

  const connections = useQuery({ queryKey: ['secret-connections'], queryFn: fetchSecretConnections })
  const activeConnections = connections.data?.items ?? []
  const selectedConnection = activeConnections.find((item) => item.connectionId === connectionId) ?? activeConnections[0]
  const secrets = useQuery({ queryKey: ['secrets', filter], queryFn: () => fetchSecrets(filter), placeholderData: keepPreviousData })
  const run = useQuery({
    queryKey: ['secret-run', runId],
    queryFn: () => fetchSecretRun(runId!),
    enabled: runId !== null,
    refetchInterval: (query) => query.state.error || terminalStatuses.has(query.state.data?.status ?? 'UNKNOWN') ? false : 3000,
  })
  const currentStatus = run.data?.status ?? (acceptedRun?.runId === runId ? acceptedRun.status : null)
  const isRunning = runId !== null && (!currentStatus || !terminalStatuses.has(currentStatus))
  const startRun = useMutation({
    mutationFn: startSecretRun,
    onSuccess: (accepted) => {
      setAcceptedRun(accepted)
      setSearchParams({ run: String(accepted.runId) }, { replace: true })
    },
  })

  useEffect(() => {
    if (runId !== null && run.data?.runId === runId && terminalStatuses.has(run.data.status)) {
      void queryClient.invalidateQueries({ queryKey: ['secrets'] })
      void queryClient.invalidateQueries({ queryKey: ['secret-detail'] })
    }
  }, [queryClient, runId, run.data?.runId, run.data?.status])

  const pageCount = secrets.data ? Math.ceil(secrets.data.total / filter.size) : 0
  const noConnections = connections.isSuccess && activeConnections.length === 0

  return (
    <>
      <PageHeader title="시크릿 보안" description="키 후보와 접근키 메타데이터, 검증 상태를 확인하세요." actions={
        <button className="btn primary" onClick={() => selectedConnection && startRun.mutate(selectedConnection.connectionId)}
          disabled={!selectedConnection || startRun.isPending || isRunning}>
          <Icon name="search" />{startRun.isPending ? '등록 중…' : isRunning ? '검사 진행 중' : '지금 검사'}
        </button>
      } />

      <div className="scope-bar secret-scope-bar">
        <label className="row" htmlFor="secret-connection">
          <span className="caption">수집 연결</span>
          <select id="secret-connection" className="select" value={selectedConnection?.connectionId ?? ''}
            onChange={(event) => setConnectionId(Number(event.target.value))}
            disabled={connections.isPending || !activeConnections.length || isRunning}>
            {connections.isPending && <option value="">연결 확인 중</option>}
            {noConnections && <option value="">사용 가능한 연결 없음</option>}
            {activeConnections.map((connection) => (
              <option key={connection.connectionId} value={connection.connectionId}>
                {connection.displayName} · {issuerLabel[connection.provider]} · 승인 범위 {connection.approvedScopeCount}개
              </option>
            ))}
          </select>
        </label>
        <span className="caption">선택한 승인 범위만 검사해요.</span>
      </div>
      {connections.isError && <p className="notice error page-notice" role="alert">
        {connections.error instanceof ApiError && connections.error.status === 403
          ? '연결 조회와 수동 검사는 관리자 권한이 필요해요.' : '수집 연결을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'}
      </p>}
      {noConnections && <p className="notice page-notice">승인 범위가 있는 활성 수집 연결이 없어요. 연결을 등록한 뒤 검사할 수 있어요.</p>}
      {startRun.isError && <p className="notice error page-notice" role="alert">
        {startRun.error instanceof ApiError && startRun.error.status === 409
          ? '선택한 연결의 승인 범위나 실행 상태를 확인해 주세요.' : '검사 작업을 등록하지 못했어요. 연결과 로그인 상태를 확인해 주세요.'}
      </p>}
      {runId !== null && <section className={'notice page-notice' + (currentStatus === 'FAILED' || currentStatus === 'PARTIAL' ? ' error' : '')}
        role="status" aria-live="polite">
        <strong>실행 #{runId} · {runStatusText(currentStatus ?? 'UNKNOWN')}</strong>
        {run.isError ? <p>
          {run.error instanceof ApiError && run.error.status === 403 ? '실행 상태 조회에는 관리자 권한이 필요해요.'
            : run.error instanceof ApiError && run.error.status === 404 ? '해당 실행을 찾지 못했어요.'
              : '실행 상태를 불러오지 못했어요.'}
          {' '}<button className="btn outline" onClick={() => void run.refetch()}>다시 조회</button>
        </p>
          : run.data ? <>
            <p>수집 {stageText(run.data.collectionStatus)} · 탐지 {stageText(run.data.detectionStatus)} · 검증 {stageText(run.data.validationStatus)}</p>
            <p>승인 범위 {run.data.scopeCount}개 중 완료 {run.data.completedScopeCount}개, 미완료 {run.data.incompleteScopeCount}개 · 확인한 항목 {run.data.collectedObjectCount}개</p>
            {run.data.failureCode && <p>실패 코드: {run.data.failureCode}</p>}
            {run.data.scopeResults?.length > 0 && <details className="secret-run-scopes">
              <summary>범위별 수집 결과 {run.data.scopeResults.length}개</summary>
              <ul>
                {run.data.scopeResults.map((scope) => <li key={scope.runScopeId}>
                  {scopeLabel(scope.contentType)}{scope.region ? ` · ${scope.region}` : ''}
                  {' · '}{stageText(scope.collectionStatus)}
                  {scope.objectCount !== null ? ` · ${scope.objectCount}개` : ''}
                  {scope.gapCode ? ` · 확인 필요 (${scope.gapCode})` : ''}
                </li>)}
              </ul>
            </details>}
          </> : <p>실행 상태를 확인하는 중이에요.</p>}
        <button className="btn outline" onClick={() => setSearchParams({}, { replace: true })}>상태 표시 닫기</button>
      </section>}

      <div className="stack">
        <div className="metric-grid">
          <MetricCard label="키·메타데이터 기록" value={secrets.data?.total ?? '—'} unit="개" description="현재 필터 기준" />
          <MetricCard label="현재 페이지" value={secrets.data?.items.length ?? '—'} unit="개" description="기록 하나에 확인 위치는 여러 개일 수 있어요" />
          <MetricCard label="선택한 실행에서 확인한 항목" value={run.data?.collectedObjectCount ?? '—'} unit="개" description="현재 화면에서 조회한 실행 기준" />
        </div>
        <section className="card list-card">
          <div className="card-head"><h2>키·메타데이터</h2><span className="caption">마지막 확인 순</span></div>
          <div className="toolbar"><div className="row">
            <select className="select" aria-label="발급자" value={filter.issuer}
              onChange={(event) => setFilter({ ...filter, issuer: event.target.value as SecretFilter['issuer'], page: 0 })}>
              <option value="ALL">모든 발급자</option><option value="AWS">AWS</option><option value="GITHUB">GitHub</option><option value="NOTION">Notion</option>
            </select>
            <select className="select" aria-label="키 구성" value={filter.componentState}
              onChange={(event) => setFilter({ ...filter, componentState: event.target.value as SecretFilter['componentState'], page: 0 })}>
              <option value="ALL">전체 구성</option><option value="CONFIRMED">구성요소 확인</option><option value="CANDIDATE">일부만 발견</option><option value="METADATA_ONLY">메타데이터만</option>
            </select>
          </div></div>
          {secrets.isPending ? <div style={{ padding: '0 28px' }}><div className="skeleton" /></div>
            : secrets.isError ? <div style={{ padding: '0 28px 20px' }}><p className="notice error">키 목록을 불러오지 못했어요.</p></div>
              : secrets.data.items.length ? <SecretTable items={secrets.data.items} onSelect={setSelectedId} />
                : <EmptyState title={filter.issuer === 'ALL' && filter.componentState === 'ALL' ? '아직 확인된 기록이 없어요' : '조건에 맞는 기록이 없어요'}
                    description="필터를 바꾸거나 승인된 연결을 검사해 보세요." />}
          <div className="table-foot secret-table-foot" role="status">
            <span>{secrets.data?.total ?? 0}개 중 {secrets.data?.items.length ?? 0}개 표시 · 키 원문은 화면에 표시하지 않아요.</span>
            {(pageCount > 1 || filter.page > 0) && <div className="row">
              <button className="btn outline" disabled={filter.page === 0} onClick={() => setFilter({ ...filter, page: filter.page - 1 })}>이전</button>
              <span>{filter.page + 1} / {Math.max(pageCount, 1)}</span>
              <button className="btn outline" disabled={filter.page + 1 >= pageCount || secrets.isPlaceholderData} onClick={() => setFilter({ ...filter, page: filter.page + 1 })}>다음</button>
            </div>}
          </div>
        </section>
      </div>
      <SecretDetailDrawer secretId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  )
}

function SecretTable({ items, onSelect }: { items: SecretItem[]; onSelect: (id: number) => void }) {
  return <div className="table-scroll" tabIndex={0} role="region" aria-label="키와 메타데이터 목록. 좁은 화면에서는 가로로 스크롤하세요.">
    <table><thead><tr>
      <th scope="col">판정</th><th scope="col">키</th><th scope="col">구성</th><th scope="col">검증</th><th scope="col">확인 위치</th><th scope="col">마지막 확인</th>
    </tr></thead><tbody>
      {items.map((item) => <tr key={item.id}>
        <td><Badge label="미평가" /></td>
        <td><button className="finding-link" onClick={() => onSelect(item.id)}>{item.maskedLabel || '마스킹된 키'}</button>
          <span className="asset">{issuerLabel[item.issuer]} · {credentialTypeLabel(item.credentialType)}</span></td>
        <td>{componentStateLabel[item.componentState]}</td><td>{secretValidationLabel(item.validationStatus)}</td>
        <td>{item.occurrenceCount}곳</td><td>{koreaDate.format(new Date(item.lastSeenAt))}</td>
      </tr>)}
    </tbody></table>
  </div>
}
