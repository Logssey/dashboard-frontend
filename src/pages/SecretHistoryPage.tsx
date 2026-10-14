import { useEffect, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { fetchSecretRuns } from '@/api/secretRuns'
import { fetchSecretConnections, fetchSecretRun, startSecretRun, type SecretRunStatus } from '@/api/secrets'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { PageHeader } from '@/components/PageHeader'
import { issuerLabel } from '@/lib/labels'

const KST = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  timeZone: 'Asia/Seoul', hour12: false,
})
const terminalStatuses = new Set<SecretRunStatus>(['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED'])

function displayDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : `${KST.format(date)} KST`
}

function displayDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt || !finishedAt) return '—'
  const seconds = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000)
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  return seconds < 60 ? `${seconds}초` : `${Math.floor(seconds / 60)}분 ${String(seconds % 60).padStart(2, '0')}초`
}

function runStatusLabel(status: SecretRunStatus): string {
  switch (status) {
    case 'PENDING': return '대기'
    case 'RUNNING': return '진행 중'
    case 'SUCCEEDED': return '완료'
    case 'PARTIAL': return '부분 실패'
    case 'FAILED': return '실패'
    case 'CANCELLED': return '취소'
    default: return '미확인'
  }
}

function stepLabel(status: string): string {
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
    case 'GITHUB_REPOSITORY_FILES': return 'GitHub 파일'
    case 'IAM_ACCESS_KEY_METADATA': return 'IAM 접근키 메타데이터'
    case 'AWS_SECRETS_MANAGER_METADATA': return 'Secrets Manager 목록'
    case 'AWS_SSM_PARAMETER_METADATA': return 'SSM Parameter 목록'
    case 'AWS_S3_BUCKET_METADATA': return 'S3 버킷 목록'
    case 'AWS_SECRETS_MANAGER_VALUE': return 'Secrets Manager 값'
    case 'AWS_SSM_PARAMETER_VALUE': return 'SSM Parameter 값'
    case 'AWS_S3_OBJECT_CONTENT': return 'S3 객체 내용'
    default: return '수집 범위'
  }
}

function gapLabel(code: string): string {
  if (code.includes('ACCESS_DENIED') || code.includes('ACCOUNT_MISMATCH')) return '접근 권한 또는 계정 확인 필요'
  if (code.includes('RATE_LIMITED')) return '요청 한도 도달'
  if (code.includes('UNAVAILABLE') || code.includes('TEMPORARY')) return '원천 응답 확인 불가'
  if (code.includes('TOO_LARGE') || code.includes('LIMIT')) return '읽기 제한 도달'
  if (code.includes('NON_TEXT') || code.includes('BINARY')) return '텍스트가 아닌 항목 제외'
  if (code.includes('DISABLED')) return '수집 설정 비활성'
  return '일부 범위 확인 필요'
}

export function SecretHistoryPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [page, setPage] = useState(0)
  const [connectionId, setConnectionId] = useState<number | null>(null)
  const parsedRunId = Number(searchParams.get('run'))
  const runId = Number.isSafeInteger(parsedRunId) && parsedRunId > 0 ? parsedRunId : null

  const history = useQuery({
    queryKey: ['secret-runs', page],
    queryFn: () => fetchSecretRuns(page),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => query.state.data?.items.some((item) => !terminalStatuses.has(item.status)) ? 5000 : false,
  })
  const connections = useQuery({ queryKey: ['secret-connections'], queryFn: fetchSecretConnections })
  const availableConnections = connections.data?.items ?? []
  const selectedConnection = availableConnections.find((item) => item.connectionId === connectionId) ?? availableConnections[0]
  const detail = useQuery({
    queryKey: ['secret-run', runId],
    queryFn: () => fetchSecretRun(runId!),
    enabled: runId !== null,
    refetchInterval: (query) => query.state.error || terminalStatuses.has(query.state.data?.status ?? 'UNKNOWN') ? false : 3000,
  })
  const startRun = useMutation({
    mutationFn: startSecretRun,
    onSuccess: (accepted) => {
      setPage(0)
      setSearchParams({ run: String(accepted.runId) })
      void queryClient.invalidateQueries({ queryKey: ['secret-runs'] })
    },
  })

  useEffect(() => {
    if (detail.data && terminalStatuses.has(detail.data.status)) {
      void queryClient.invalidateQueries({ queryKey: ['secret-runs'] })
      void queryClient.invalidateQueries({ queryKey: ['secrets'] })
      void queryClient.invalidateQueries({ queryKey: ['secret-navigation-count'] })
      void queryClient.invalidateQueries({ queryKey: ['secret-overview-inventory'] })
    }
  }, [detail.data?.runId, detail.data?.status, queryClient])

  const pageItems = history.data?.items ?? []
  const pageCount = history.data ? Math.ceil(history.data.total / history.data.size) : 0
  const isRunning = detail.data && !terminalStatuses.has(detail.data.status)

  return (
    <>
      <PageHeader title="스캔 이력" description="수집 작업의 실행 시각, 처리 범위, 부분 실패를 확인해요." actions={
        <button className="btn primary" type="button"
          disabled={!selectedConnection || startRun.isPending || Boolean(isRunning)}
          onClick={() => selectedConnection && startRun.mutate(selectedConnection.connectionId)}>
          <Icon name="search" />{startRun.isPending ? '등록 중…' : '스캔 요청'}
        </button>
      } />

      <div className="scope-bar secret-scope-bar">
        <label className="row" htmlFor="history-connection">
          <span className="caption">검사할 연결</span>
          <select className="select" id="history-connection" value={selectedConnection?.connectionId ?? ''}
            onChange={(event) => setConnectionId(Number(event.target.value))}
            disabled={!availableConnections.length || startRun.isPending || Boolean(isRunning)}>
            {!availableConnections.length && <option value="">사용 가능한 연결 없음</option>}
            {availableConnections.map((connection) => (
              <option value={connection.connectionId} key={connection.connectionId}>
                {connection.displayName} · {issuerLabel[connection.provider]} · 승인 범위 {connection.approvedScopeCount}개
              </option>
            ))}
          </select>
        </label>
        <span className="caption">승인된 범위에 비동기 검사를 등록해요.</span>
      </div>
      {connections.isError && <p className="notice error page-notice" role="alert">연결 목록을 불러오지 못했어요. 관리자 권한과 연결 상태를 확인해 주세요.</p>}
      {startRun.isError && <p className="notice error page-notice" role="alert">
        {startRun.error instanceof ApiError && startRun.error.status === 409
          ? '선택한 연결의 승인 범위나 실행 상태를 확인해 주세요.'
          : '검사 작업을 등록하지 못했어요.'}
      </p>}

      <div className="secret-history-metrics" aria-label="스캔 이력 요약">
        <div className="card secret-history-metric"><span>전체 실행</span><strong>{history.isSuccess ? history.data.total : '—'}<small>회</small></strong><p>현재 저장된 작업</p></div>
        <div className="card secret-history-metric"><span>이 페이지 완료</span><strong>{history.isSuccess ? pageItems.filter((item) => item.status === 'SUCCEEDED').length : '—'}<small>회</small></strong><p>현재 페이지 기준</p></div>
        <div className="card secret-history-metric"><span>이 페이지 부분 실패</span><strong className="secret-history-alert">{history.isSuccess ? pageItems.filter((item) => item.status === 'PARTIAL').length : '—'}<small>회</small></strong><p>미완료 범위는 상세에서 확인</p></div>
        <div className="card secret-history-metric"><span>이 페이지 확인 항목</span><strong>{history.isSuccess ? pageItems.reduce((sum, item) => sum + item.collectedObjectCount, 0) : '—'}<small>개</small></strong><p>새 시크릿 수가 아닌 수집 항목 수</p></div>
      </div>

      <section className="card list-card secret-history-list" aria-labelledby="secret-history-title">
        <div className="card-head"><div><h2 id="secret-history-title">실행 기록</h2><p className="caption">최신 요청 순으로 표시해요.</p></div></div>
        {history.isPending ? <div className="secret-history-loading"><div className="skeleton" /></div>
          : history.isError ? <p className="notice error secret-history-error" role="alert">스캔 이력을 불러오지 못했어요. <button className="btn outline" onClick={() => void history.refetch()}>다시 조회</button></p>
            : pageItems.length === 0 ? <EmptyState title="아직 실행 기록이 없어요" description="승인된 연결을 선택하고 스캔을 요청해 보세요." />
              : <div className="table-scroll" tabIndex={0} role="region" aria-label="스캔 실행 기록. 좁은 화면에서는 가로로 스크롤하세요.">
                <table><thead><tr>
                  <th scope="col">실행 식별자</th><th scope="col">탐지 원본</th><th scope="col">실행 상태</th>
                  <th scope="col">처리 / 전체</th><th scope="col">확인 항목</th><th scope="col">시작 시각</th>
                  <th scope="col">소요 시간</th><th scope="col"><span className="sr-only">상세</span></th>
                </tr></thead><tbody>
                  {pageItems.map((item) => <tr key={item.runId}>
                    <td><strong>SCAN-{item.runId}</strong><span className="asset">{item.triggerType === 'MANUAL' ? '수동 스캔' : '예약 스캔'}</span></td>
                    <td>{issuerLabel[item.provider]}<span className="asset">{item.displayName}</span></td>
                    <td><span className={`secret-run-badge ${item.status.toLowerCase()}`}>{runStatusLabel(item.status)}</span></td>
                    <td>{item.completedScopeCount} / {item.scopeCount}</td>
                    <td>{item.collectedObjectCount}개</td>
                    <td>{displayDate(item.startedAt)}{!item.startedAt && <span className="asset">요청 {displayDate(item.requestedAt)}</span>}</td>
                    <td>{displayDuration(item.startedAt, item.finishedAt)}</td>
                    <td><button className="secret-history-detail-button" onClick={() => setSearchParams({ run: String(item.runId) })}>
                      상세 <Icon name="chevron" />
                    </button></td>
                  </tr>)}
                </tbody></table>
              </div>}
        {history.isSuccess && <div className="table-foot secret-table-foot">
          <span>전체 {history.data.total}회 중 {pageItems.length}회 표시</span>
          {(pageCount > 1 || page > 0) && <div className="row">
            <button className="btn outline" disabled={page === 0} onClick={() => setPage(page - 1)}>이전</button>
            <span>{page + 1} / {Math.max(pageCount, 1)}</span>
            <button className="btn outline" disabled={page + 1 >= pageCount || history.isPlaceholderData} onClick={() => setPage(page + 1)}>다음</button>
          </div>}
        </div>}
      </section>

      {runId !== null && <section className="card secret-history-detail" aria-labelledby="secret-history-detail-title">
        <div className="card-head"><h2 id="secret-history-detail-title">SCAN-{runId} 상세</h2>
          <button className="btn outline" onClick={() => setSearchParams({})}>닫기</button></div>
        {detail.isPending ? <p>실행 상태를 확인하는 중이에요.</p>
          : detail.isError ? <p className="notice error" role="alert">실행 상세를 불러오지 못했어요. <button className="btn outline" onClick={() => void detail.refetch()}>다시 조회</button></p>
            : <>
              <p><span className={`secret-run-badge ${detail.data.status.toLowerCase()}`}>{runStatusLabel(detail.data.status)}</span>
                {' · '}요청 {displayDate(detail.data.requestedAt)} · 시작 {displayDate(detail.data.startedAt)} · 종료 {displayDate(detail.data.finishedAt)}</p>
              <p>수집 {stepLabel(detail.data.collectionStatus)} · 탐지 {stepLabel(detail.data.detectionStatus)} · 검증 {stepLabel(detail.data.validationStatus)}</p>
              <p>승인 범위 {detail.data.scopeCount}개 중 완료 {detail.data.completedScopeCount}개, 미완료 {detail.data.incompleteScopeCount}개 · 확인한 항목 {detail.data.collectedObjectCount}개</p>
              {detail.data.failureCode && <p>실패 코드: <code>{detail.data.failureCode}</code></p>}
              {detail.data.scopeResults.length > 0 && <div className="secret-history-scopes">
                <h3>범위별 결과</h3>
                <ul>{detail.data.scopeResults.map((scope) => <li key={scope.runScopeId}>
                  <span>{scopeLabel(scope.contentType)}{scope.region ? ` · ${scope.region}` : ''}</span>
                  <strong>{stepLabel(scope.collectionStatus)}</strong>
                  <span>확인 항목 {scope.objectCount ?? '—'}개</span>
                  {scope.gapCode && <span>{gapLabel(scope.gapCode)} <code>({scope.gapCode})</code></span>}
                </li>)}</ul>
              </div>}
            </>}
      </section>}
      <p className="secret-history-footnote"><Icon name="clock" /> 스캔 완료는 모든 키의 유효성 검증 성공을 뜻하지 않아요. 탐지·검증·영향 분석은 각 항목 상세에서 확인하세요.</p>
    </>
  )
}
