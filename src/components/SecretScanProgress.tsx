import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { fetchSecretScanProgress, type ScanProgressStageKey, type SecretScanProgressResponse } from '@/api/secretScanProgress'
import {
  mergeScanEvents, scanProgressEventOutcome, scanEventTime, scanOperationLabel,
  scanRequestFormat, scanProgressCount, scanProgressStages, scanProgressStates,
  scanProgressTerminal, scanStageCount, scanProgressReason, scanProgressStatusLabel,
  scanValidationOnlyIssue, scanProgressStageStatus, scanCompletedValidationSummary, scanIsMetadataOnly, scanNeedsValidationSetup, scanProgressEventReason,
} from '@/lib/secretScanProgress'
import { scanDate, scanDuration, scanPlatforms } from '@/lib/secretScan'
import { SecretExplanation } from './SecretExplanation'
import './secret-scan-progress.css'

class ScanConnectionMismatch extends Error {}

function useScanProgress(runId: number, expectedConnectionId?: number) {
  const cache = useRef<{ cursor: number; events: SecretScanProgressResponse['events'] }>({ cursor: 0, events: [] })
  const query = useQuery({
    queryKey: ['secret-run-progress', runId, expectedConnectionId ?? null],
    queryFn: async ({ signal }) => {
      let cursor = cache.current.cursor
      let events = cache.current.events
      let result: SecretScanProgressResponse
      let pages = 0
      do {
        result = await fetchSecretScanProgress(runId, cursor, signal)
        if (expectedConnectionId && result.connectionId !== expectedConnectionId) throw new ScanConnectionMismatch('선택한 연결과 실행이 달라요.')
        if (result.runId !== runId || result.nextAfterEventId < cursor) throw new Error('실행 내역의 조회 기준을 확인해 주세요.')
        events = result.eventsStatus === 'EXPIRED' ? [] : mergeScanEvents(events, result.events)
        if (result.hasMore && result.nextAfterEventId <= cursor) throw new Error('실행 내역을 이어서 읽지 못했어요.')
        cursor = result.nextAfterEventId
        pages++
      } while (result.hasMore && pages < 20 && !signal.aborted)
      signal.throwIfAborted()
      cache.current = { cursor, events }
      return { ...result, events }
    },
    retry: (attempt, error) => !(error instanceof ScanConnectionMismatch) && !(error instanceof ApiError && [401, 403, 404].includes(error.status)) && attempt < 1,
    refetchInterval: (query) => {
      if (query.state.error) return false
      if (query.state.data && scanProgressTerminal(query.state.data.status) && !query.state.data.hasMore) return false
      return 2500
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: (query) => !query.state.error && (!query.state.data || !scanProgressTerminal(query.state.data.status) || query.state.data.hasMore),
    refetchOnReconnect: (query) => !(query.state.error instanceof ScanConnectionMismatch) && !(query.state.error instanceof ApiError && [401, 403, 404].includes(query.state.error.status)) && (!query.state.data || !scanProgressTerminal(query.state.data.status)),
  })
  return { ...query, restart: () => { cache.current = { cursor: 0, events: [] }; return query.refetch() } }
}

export function SecretScanProgress({ runId, expectedConnectionId, onComplete }: { runId: number; expectedConnectionId?: number; onComplete?: (runId: number) => void }) {
  const progress = useScanProgress(runId, expectedConnectionId)
  const [selected, setSelected] = useState<ScanProgressStageKey | null>(null)
  const [visibleCount, setVisibleCount] = useState(200)
  const terminal = useRef<HTMLDivElement>(null)
  const completeNotified = useRef(false)
  const data = progress.data
  useEffect(() => {
    if (!data || expectedConnectionId && data.connectionId !== expectedConnectionId || !scanProgressTerminal(data.status) || data.hasMore || completeNotified.current) return
    completeNotified.current = true
    onComplete?.(runId)
  }, [data, runId, expectedConnectionId, onComplete])

  const denied = progress.error instanceof ApiError && [401, 403, 404].includes(progress.error.status)
  const mismatched = progress.error instanceof ScanConnectionMismatch || !!expectedConnectionId && !!data && data.connectionId !== expectedConnectionId
  if (mismatched) return <section className="secret-scan-execution-panel" role="alert"><h2>선택한 연결과 실행이 달라요</h2><p>연결 목록에서 검사할 연결을 다시 선택하세요.</p></section>
  if (denied) return <section className="secret-scan-execution-panel" role="alert"><h2>실행을 조회할 수 없어요</h2><p>현재 로그인과 연결 열람 권한을 확인하세요.</p><Link to="/secrets/history">스캔 이력</Link></section>
  if (!data) return <section className="secret-scan-execution-panel" aria-busy={progress.isPending}>
    <h2>검사 진행</h2>
    {progress.isError ? <div role="alert"><p>실행 상태를 불러오지 못했어요.</p><button className="btn outline" onClick={() => void progress.restart()}>다시 조회</button></div> : <p role="status">실제 검사 상태를 확인하고 있어요.</p>}
  </section>

  const lastObserved = [...data.stages].reverse().find((stage) => !['PENDING', 'UNKNOWN'].includes(stage.status))
  const selectedKey = selected ?? data.stages.find((stage) => stage.status === 'RUNNING')?.key ?? lastObserved?.key ?? 'QUEUE'
  const stage = data.stages.find((item) => item.key === selectedKey)
  const events = data.events.filter((event) => event.stage === selectedKey)
  const visible = events.slice(-visibleCount)
  const duration = data.startedAt ? scanDuration(data.startedAt, data.finishedAt ?? data.capturedAt) : '시작 대기'
  const settled = scanProgressTerminal(data.status)
  const completed = ['SUCCEEDED', 'SKIPPED'].includes(data.status) || scanValidationOnlyIssue(data)
  const metadataOnly = scanIsMetadataOnly(data)
  const metadata = metadataOnly
  const needsValidationSetup = scanNeedsValidationSetup(data)
  const waiting = scanDuration(data.requestedAt, data.startedAt ?? data.capturedAt)
  const currentObjects = data.collectedObjectCount ?? data.stages.find((item) => item.key === 'COLLECTION')?.processedCount

  return <section className={`secret-scan-execution-panel${progress.isError ? ' stale' : ''}`} aria-labelledby={`scan-progress-${runId}`}>
    <header className="secret-scan-execution-header">
      <div><p>검사 진행 · SCAN-{runId}</p><h2 id={`scan-progress-${runId}`}>{scanPlatforms[data.provider as keyof typeof scanPlatforms] ?? '연결'} {metadata ? '메타데이터 조회' : '검사'}</h2></div>
      <span className={`secret-run-badge ${completed ? 'succeeded' : data.status.toLowerCase()}`}>{scanProgressStatusLabel(data)}</span>
    </header>
    <dl className="secret-scan-execution-facts">
      <div><dt>요청 시각</dt><dd>{scanDate(data.requestedAt)}</dd></div>
      <div><dt>{data.finishedAt ? '소요 시간' : '확인된 경과'}</dt><dd>{duration}</dd></div>
      <div><dt>대기 시간</dt><dd>{waiting}</dd></div>
      <div><dt>현재 처리량</dt><dd>{scanProgressCount(currentObjects) ? `${currentObjects}개` : '집계 중'}</dd></div>
      <div><dt>최근 활동</dt><dd>{scanDate(data.latestActivityAt)}</dd></div>
    </dl>
    {metadataOnly && <div className="secret-scan-scope-note">
      <strong>이번 실행은 목록과 상태 조회예요.</strong>
      <p>S3 파일, Secrets Manager 값, Parameter Store 값은 읽지 않았어요. 내용 탐지는 검사할 대상 등록과 서버의 내용 읽기 설정 및 해당 대상의 읽기 권한이 필요해요.</p>
      <Link to={`/secrets/connections/${data.connectionId}/scopes`}>등록된 검사 대상 확인</Link>
    </div>}
    {needsValidationSetup && !scanValidationOnlyIssue(data) && <div className="secret-scan-scope-note">
      <strong>키를 발견했지만 인증 확인은 설정으로 제한됐어요.</strong>
      <p>연결의 검증 허용, 검사 대상별 승인, 서버의 검증 기능을 확인하세요. 설정을 바꾼 뒤 다시 검사해야 새 인증 결과가 남아요.</p>
      <Link to={`/secrets/connections?validationConnectionId=${data.connectionId}`}>이 연결의 키 검증 설정</Link>
    </div>}
    {data.status === 'PENDING' && <p className="secret-scan-execution-waiting">{data.attemptNo > 0 ? '재시도할 시각을 기다리고 있어요.' : '워커가 요청을 가져오기를 기다리고 있어요.'}{data.availableAt && data.attemptNo > 0 && <span>다음 시도 {scanDate(data.availableAt)}</span>}</p>}
    {data.status === 'PARTIAL' && !scanValidationOnlyIssue(data) && <p className="secret-scan-execution-completed-note">확인이 필요한 항목과 대상별 사유를 결과에서 확인하세요.</p>}
    {progress.isError && <div className="secret-scan-execution-read-error" role="alert"><p>진행 상태의 연결을 확인하지 못했어요. 마지막 확인 {scanDate(data.capturedAt)}</p><button className="btn outline" onClick={() => void progress.restart()}>다시 조회</button></div>}

    <ol className="secret-scan-execution-stages" aria-label="검사 단계">
      {data.stages.map((item) => {
        const config = scanProgressStages[item.key]
        const count = scanStageCount(item)
        const displayStatus = scanProgressStageStatus(item, data)
        return <li key={item.key} className={`stage-${displayStatus.toLowerCase()}`}>
          <button type="button" aria-pressed={selectedKey === item.key} aria-controls={`scan-terminal-${runId}`}
            className={`secret-scan-execution-stage${selectedKey === item.key ? ' selected' : ''}`}
            onClick={() => { setSelected(item.key); setVisibleCount(200) }}>
            <span className="secret-scan-execution-stage-icon" aria-hidden="true">{displayStatus === 'SUCCEEDED' ? '✓' : item.status === 'FAILED' ? '!' : item.status === 'SKIPPED' ? '−' : ''}</span>
            <span className="secret-scan-execution-stage-content"><strong>{metadata && item.key === 'COLLECTION' ? '리소스 정보 조회' : metadata && ['DETECTION', 'VALIDATION'].includes(item.key) ? item.key === 'DETECTION' ? '키 값 탐지 · 적용 제외' : '인증 확인 · 적용 제외' : config?.title ?? '검사 처리'}</strong><span>{['SKIPPED', 'PARTIAL', 'FAILED'].includes(displayStatus) && item.reasonCode ? scanProgressReason(item.reasonCode) : count ?? config?.description}</span></span>
            <span className="secret-scan-execution-stage-state">{scanProgressStates[displayStatus] ?? '상태 확인'}</span>
          </button>
        </li>
      })}
    </ol>



    <section id={`scan-terminal-${runId}`} className="secret-scan-execution-terminal" aria-labelledby={`scan-terminal-title-${runId}`}>
      <div className="secret-scan-execution-terminal-head">
        <h3 id={`scan-terminal-title-${runId}`} aria-live="polite">{scanProgressStages[selectedKey].title} 실행 내역</h3>
        <button type="button" onClick={() => terminal.current?.scrollTo({ top: terminal.current.scrollHeight, behavior: 'instant' })}>최신 내역</button>
      </div>
      <div ref={terminal} className="secret-scan-execution-terminal-body" tabIndex={0} role="region" aria-label="읽기 전용 실행 내역">
        {events.length > visibleCount && <button className="secret-scan-execution-more-events" onClick={() => setVisibleCount((value) => value + 200)}>이전 내역 {Math.min(200, events.length - visibleCount)}개 보기</button>}
        {!visible.length ? <p className="secret-scan-execution-log-empty">{data.eventsStatus === 'EXPIRED' ? '상세 실행 내역의 보존 기간이 지났어요.' : data.eventsStatus === 'NOT_RECORDED' ? '이 실행의 상세 내역이 기록되지 않았어요.' : stage?.status === 'PENDING' ? '이 단계의 시작을 기다리고 있어요.' : stage?.reasonCode && scanProgressStageStatus(stage, data) !== 'SUCCEEDED' ? scanProgressReason(stage.reasonCode) : '수신된 실행 내역이 없어요.'}</p>
          : <ol className="secret-scan-execution-events">{visible.map((event) => <li key={event.id} className={`event-${scanCompletedValidationSummary(event, data) ? 'completed' : event.outcome.toLowerCase()}`}>
            <div className="secret-scan-execution-event-command"><time dateTime={event.observedAt}>{scanEventTime(event.observedAt)}</time><span aria-hidden="true">›</span><strong>{scanOperationLabel(event.operationCode)}</strong><small>시도 {event.attemptNo}</small></div>
            {scanRequestFormat(event.operationCode) && <div className="secret-scan-execution-request"><span>요청 형식</span><code>{scanRequestFormat(event.operationCode)}</code></div>}
            <p><span>{event.httpStatus != null && `HTTP ${event.httpStatus} · `}{scanProgressEventOutcome(event, data)}{event.durationMs != null && ` · ${event.durationMs}ms`}</span>{!scanCompletedValidationSummary(event, data) && scanProgressEventReason(event, data) && <span>{scanProgressEventReason(event, data)}</span>}{scanProgressCount(event.processedCount) && <span>처리 {event.processedCount}{scanProgressCount(event.totalCount) ? ` / ${event.totalCount}` : ''}</span>}</p>
          </li>)}</ol>}
      </div>
      <p className="secret-scan-execution-terminal-foot">마지막 활동 {scanDate(data.latestActivityAt)}{data.truncated && ` · 일부 상세 생략 ${data.suppressedEventCount}개`}</p>
      {data.truncated && !settled && <p className="caption">상세 내역 표시 한도에 도달했어요. 위의 현재 처리량과 최근 활동에서 진행 상태를 확인하세요.</p>}
    </section>

    {settled && <footer className="secret-scan-execution-result">
      <p>{scanProgressCount(data.finishedScopeCount) && <span>종료 대상 {data.finishedScopeCount}개</span>}{scanProgressCount(data.collectedObjectCount) && <span>수집 항목 {data.collectedObjectCount}개</span>}{scanProgressCount(data.findingCount) && <span>탐지 근거 {data.findingCount}개</span>}</p>
      <div>{data.capabilities?.canViewFindings && <Link to={`/secrets/history/${runId}/findings`}>발견 결과 보기</Link>}{['PARTIAL', 'FAILED'].includes(data.status) && !scanValidationOnlyIssue(data) && <Link to={`/secrets/history/${runId}#coverage-title`}>실패 대상 확인</Link>}<Link to={`/secrets/history/${runId}`}>실행 이력</Link></div>
    </footer>}
    {settled && <SecretExplanation topic="SCAN" id={runId} contextVersion={`${data.status}:${data.finishedAt ?? ''}`} />}
  </section>
}
