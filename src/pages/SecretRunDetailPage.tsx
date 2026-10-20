import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { fetchSecretScanRun, type ScanStage, type SecretScanRun } from '@/api/secretRuns'
import { Icon } from '@/components/Icon'
import { findingCountLabel, hasScopeAggregation, historyReturnPath, objectCountLabel, positiveId, scanDate, scanDetailPath, scanDuration, scanPlatforms, scanReason, scanStatus, scanTypes, scopeTypeLabel, terminalRunStatuses } from '@/lib/secretScan'
import './secret-scan.css'

function StageResult({ name, stage, fallback }: { name: string; stage?: ScanStage; fallback: string }) {
  return <article className="secret-scan-stage"><h3>{name}</h3><strong>{scanStatus(stage?.status ?? fallback)}</strong>
    <p>{stage?.required === true ? '필수 단계' : stage?.required === false ? '선택 또는 해당 없음' : '적용 여부 미확인'}</p>
    {stage?.reasonCode && <p>{scanReason(stage.reasonCode)}</p>}
    <small>{stage?.observedAt ? scanDate(stage.observedAt) : '단계별 관측 시각 미기록'}</small>
  </article>
}

function RunContent({ run }: { run: SecretScanRun }) {
  const [scopeFilter, setScopeFilter] = useState('ALL')
  const aggregate = hasScopeAggregation(run)
  const scopes = run.scopeResults ?? []
  const shown = scopes.filter((scope) => scopeFilter === 'ALL' || scope.scopeOutcome === scopeFilter)
  const pending = !terminalRunStatuses.has(run.status)
  const hasGaps = aggregate && (run.gapScopeCount ?? 0) > 0
  const resultAvailable = run.findingCount != null || run.distinctCredentialCount != null
  const connectionLink = `/secrets/connections/${run.connectionId}/scopes`
  const revalidation = run.revalidation
  return <>
    <section className="card secret-run-summary" aria-labelledby="run-summary-title">
      <div className="row between"><h2 id="run-summary-title">실행 요약</h2><span className={`secret-run-badge ${run.status.toLowerCase()}`}>{scanStatus(run.status)}</span></div>
      <p>{scanTypes[run.triggerType] ?? '실행 유형 미확인'} · {scanPlatforms[run.provider] ?? '플랫폼 미확인'} · {run.safeDisplayAlias ?? run.displayName ?? `연결 #${run.connectionId}`}</p>
      <dl className="secret-scan-facts"><div><dt>요청</dt><dd>{scanDate(run.requestedAt)}</dd></div><div><dt>시작</dt><dd>{run.startedAt ? scanDate(run.startedAt) : '시작 전'}</dd></div><div><dt>종료</dt><dd>{run.finishedAt ? scanDate(run.finishedAt) : '종료 전'}</dd></div><div><dt>소요 시간</dt><dd>{scanDuration(run.startedAt, run.finishedAt)}</dd></div></dl>
      {run.retryOfRunId && <p>이전 실행 <Link to={scanDetailPath(run.retryOfRunId)}>SCAN-{run.retryOfRunId}</Link>의 재시도</p>}
    </section>
    <section className={`secret-scan-next ${hasGaps || run.status === 'FAILED' ? 'warning' : ''}`} aria-labelledby="run-next-title" aria-live="polite">
      <div><h2 id="run-next-title">지금 확인할 일</h2>
        <p>{pending ? '검사 결과를 기다리는 중이에요. 대기·진행 중인 범위는 실패로 세지 않아요.' : hasGaps ? `확인하지 못한 범위가 ${run.gapScopeCount}개 있어요. 아래 범위별 원인과 연결 권한을 확인하세요.` : !aggregate ? '범위별 필수 단계 근거가 부족해 성공·누락 수를 확인할 수 없어요.' : run.status === 'CANCELLED' ? '취소된 검사예요. 완료된 결과와 미처리 범위를 구분해 확인하세요.' : '적용 범위의 검사가 끝났어요. 발견 결과와 개별 키의 검증 상태를 확인하세요.'}</p>
        {run.failureCode && <p>{scanReason(run.failureCode)}</p>}
        {run.status === 'PENDING' && run.availableAt && <p>다음 실행 가능 시각 {scanDate(run.availableAt)}</p>}
      </div><Link className="btn outline" to={connectionLink}>연결·범위 확인 <Icon name="chevron" /></Link>
    </section>
    <section className="card secret-scan-section" aria-labelledby="coverage-title"><h2 id="coverage-title">범위 커버리지</h2>
      {aggregate ? <><div className="secret-scan-counts"><div><span>성공 범위</span><strong>{run.successfulScopeCount}<small> / {run.scopeCount}개</small></strong></div><div><span>종료된 범위</span><strong>{run.finishedScopeCount ?? '—'}<small>개</small></strong></div><div><span>확인된 검사 누락</span><strong>{run.gapScopeCount ?? '—'}<small>개</small></strong></div><div><span>아직 성공 미확인</span><strong>{run.unverifiedScopeCount ?? '—'}<small>개</small></strong></div></div>
        <p className="caption">종료에는 성공·부분 실패·실패·건너뜀이 포함돼요. 성공 미확인에는 대기·진행 중인 범위도 포함돼요.</p>
        <ul className="secret-scan-status-counts">{['SUCCEEDED', 'PARTIAL', 'FAILED', 'SKIPPED', 'PENDING', 'RUNNING'].map((state) => <li key={state}><span className={`secret-run-badge ${state.toLowerCase()}`}>{scanStatus(state)}</span> {run.scopeStatusCounts?.[state] ?? '—'}개</li>)}</ul>
      </> : <p className="notice">집계 확인 불가 · {scanReason(run.aggregationStatus)}. 전체 범위 {run.scopeCount}개를 성공으로 추정하지 않아요.</p>}
      <div className="row between"><h3>범위별 결과</h3><label>상태 <select className="select" value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)}><option value="ALL">전체 범위</option>{['PARTIAL', 'FAILED', 'SKIPPED', 'PENDING', 'RUNNING', 'SUCCEEDED', 'UNKNOWN'].map((state) => <option key={state} value={state}>{scanStatus(state)}</option>)}</select></label></div>
      {!scopes.length ? <p className="secret-scan-message">범위별 검사 근거가 없어요. 0개 검사 성공을 의미하지 않아요.</p> : !shown.length ? <p className="secret-scan-message">선택한 상태의 범위가 없어요.</p> : <div className="table-scroll" tabIndex={0} role="region" aria-label="범위별 검사 결과"><table className="secret-scan-scope-table"><thead><tr><th scope="col">승인 범위</th><th scope="col">범위 결과</th><th scope="col">단계</th><th scope="col">수집 항목</th><th scope="col">원인·다음 행동</th></tr></thead><tbody>{shown.map((scope) => <tr key={scope.runScopeId}>
        <td><strong>{scope.safeDisplayAlias ?? `범위 #${scope.scopeId ?? scope.runScopeId}`}</strong><span className="asset">{scopeTypeLabel(scope.contentType)}{scope.region ? ` · ${scope.region}` : ''}</span><span className="asset">실행 범위 #{scope.runScopeId} · 승인 버전 {scope.scopeRevision ?? '미기록'}</span></td>
        <td><span className={`secret-run-badge ${scope.scopeOutcome?.toLowerCase() ?? 'unknown'}`}>{scanStatus(scope.scopeOutcome)}</span><span className="asset">{scanDate(scope.finishedAt ?? scope.collection?.observedAt)}</span></td>
        <td><div className="secret-scan-scope-stages">{(['collection', 'detection', 'validation'] as const).map((key, index) => <div key={key}><span>{['수집', '탐지', '검증'][index]} {scanStatus(scope[key]?.status ?? 'UNKNOWN')}</span>{scope[key]?.reasonCode && <small>{scanReason(scope[key].reasonCode)}</small>}</div>)}</div></td>
        <td>{objectCountLabel(scope)}</td><td>{scope.gapCode ? <><strong>{scanReason(scope.gapCode)}</strong><span className="asset"><code>{scope.gapCode}</code></span><Link to={`${connectionLink}?scopeId=${scope.scopeId}`}>범위 확인</Link></> : scope.scopeOutcome === 'SUCCEEDED' ? '적용 단계 완료' : '결과 확인 중 또는 근거 미기록'}</td>
      </tr>)}</tbody></table></div>}
    </section>
    <section className="card secret-scan-section" aria-labelledby="stages-title"><h2 id="stages-title">수집·탐지·유효성 검증</h2><p className="caption">수집 성공은 모든 키의 유효성 확인을 의미하지 않아요. 범위마다 적용 단계가 다를 수 있어요.</p><div className="secret-scan-stages"><StageResult name="수집" stage={run.collection} fallback={run.collectionStatus} /><StageResult name="탐지" stage={run.detection} fallback={run.detectionStatus} /><StageResult name="유효성 검증" stage={run.validation} fallback={run.validationStatus} /></div></section>
    <section className="card secret-scan-section" aria-labelledby="results-title"><h2 id="results-title">이번 실행의 발견 결과</h2>
      {run.triggerType === 'REVALIDATION' ? <p>위치별 재검증 실행이에요. 전체 스캔의 신규 키 수에 합산하지 않아요.{revalidation && <Link className="btn outline" to={`/secrets/cases?case=${revalidation.caseId}&occurrence=${revalidation.occurrenceId}`}>대응 위치 확인</Link>}</p> : <>
        {resultAvailable ? <div className="secret-scan-counts"><div><span>탐지 근거 (Finding)</span><strong>{findingCountLabel(run.findingCount, run.coverageComplete).replace('개', '건')}</strong></div><div><span>고유 키 후보</span><strong>{findingCountLabel(run.distinctCredentialCount, run.coverageComplete)}</strong></div><div><span>처음 발견한 키 후보</span><strong>{findingCountLabel(run.newCredentialCount, run.coverageComplete)}</strong></div></div> : <p>결과 확인 불가 · 실행과 발견 결과의 연결 근거가 없거나 집계 대상이 아니에요.</p>}
        {run.coverageComplete === false && <p className="notice">확인된 범위의 결과예요. 누락된 범위의 후보 수는 확인할 수 없어요.</p>}
        {run.newCredentialCount == null && resultAvailable && <p className="caption">신규 후보 집계 근거가 없거나 적용되지 않아 숫자를 표시하지 않아요.</p>}
      </>}
    </section>
    <details className="card secret-scan-technical"><summary>기술 기록</summary><dl className="secret-scan-facts"><div><dt>집계 근거</dt><dd>{run.aggregationStatus ?? 'UNKNOWN'}</dd></div><div><dt>실행 시도</dt><dd>{run.attemptNo ?? '—'} / {run.maxAttempts ?? '—'}</dd></div><div><dt>실패 코드</dt><dd>{run.failureCode ?? '기록 없음'}</dd></div><div><dt>결과 집계</dt><dd>{run.resultAggregationStatus ?? '미기록'}</dd></div></dl></details>
  </>
}

export function SecretRunDetailPage() {
  const { runId: rawId } = useParams()
  const runId = positiveId(rawId)
  const [params] = useSearchParams()
  const title = useRef<HTMLHeadingElement>(null)
  const client = useQueryClient()
  const detail = useQuery({ queryKey: ['secret-run', runId], queryFn: () => fetchSecretScanRun(runId!), enabled: runId != null, retry: (count, error) => !(error instanceof ApiError && [403, 404].includes(error.status)) && count < 1,
    refetchInterval: (query) => query.state.error || terminalRunStatuses.has(query.state.data?.status ?? '') ? false : 3000,
  })
  useEffect(() => { title.current?.focus(); window.scrollTo({ top: 0 }) }, [runId])
  useEffect(() => {
    if (detail.data && terminalRunStatuses.has(detail.data.status)) {
      for (const key of ['secret-runs', 'secret-connections-manage', 'secret-connection-scopes', 'secrets', 'secret-navigation-count', 'secret-overview-inventory']) void client.invalidateQueries({ queryKey: [key] })
    }
  }, [detail.data?.runId, detail.data?.status, client])
  const error = detail.error
  return <>
    <Link className="secret-scan-back" to={historyReturnPath(params, runId ?? undefined)}>← 이력으로 돌아가기</Link>
    <section className="page-head"><div><h1 ref={title} tabIndex={-1}>{runId ? `SCAN-${runId}` : '실행 상세'}</h1><p className="subtitle">이 실행의 검사 범위와 확인 결과예요.</p></div></section>
    {!runId ? <div className="card secret-scan-message" role="alert">올바른 실행 주소가 아니에요. 실행 ID는 양의 정수여야 해요.</div> : detail.isPending ? <div className="card secret-scan-message" role="status">실행 상세를 불러오는 중이에요.</div> : detail.isError ? <div className="card secret-scan-message" role="alert"><h2>{error instanceof ApiError && error.status === 403 ? '접근 권한이 없어요' : error instanceof ApiError && error.status === 404 ? '실행을 찾을 수 없어요' : '실행 상세를 불러오지 못했어요'}</h2><p>허용된 이력 목록으로 돌아가거나 다시 조회해 주세요.</p>{!(error instanceof ApiError && [403, 404].includes(error.status)) && <button className="btn outline" onClick={() => void detail.refetch()}>다시 조회</button>}</div> : <RunContent key={runId} run={detail.data} />}
  </>
}
