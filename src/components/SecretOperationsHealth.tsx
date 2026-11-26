import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { fetchSecretOperationAlerts, fetchSecretOperationsHealth, type SecretOperationAlert } from '@/api/secretOperations'
import { scanDate } from '@/lib/secretScan'
import './secret-operations-health.css'

export const operationComponentLabels: Record<string, string> = { SCHEDULER: '정기 검사', EXECUTOR: '수집·재검사', ASSESSMENT: '위험도 평가', PERMISSIONS: '권한 정보 조회', USAGE: '사용 이력 조회' }
export const operationStatusLabels: Record<string, string> = { HEALTHY: '정상 응답', DISABLED: '중지됨', STALE: '응답 지연', NOT_REGISTERED: '실행 기록 없음', FAILED: '오류 확인 필요' }
export const operationAlertLabels: Record<string, string> = { COMPONENT_STALE: '워커 응답 지연', POLL_FAILED: '작업 확인 실패', QUEUE_STALLED: '작업 대기 지연', LEASE_EXPIRED: '실행 기한 초과', RUN_FAILED: '최근 작업 실패', RUN_PARTIAL: '최근 검사 부분 실패' }
export const operationCount = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : '—'
export function operationAlertTarget(alert: SecretOperationAlert): string | null {
  return alert.subjectType === 'CONNECTION' && /^[1-9]\d*$/.test(String(alert.subjectId)) ? `/secrets/connections/${alert.subjectId}/scopes` : null
}
export function operationAlertSubject(alert: SecretOperationAlert): string {
  return alert.subjectType === 'COMPONENT' ? operationComponentLabels[alert.subjectId] ?? '운영 구성요소' : alert.subjectType === 'CONNECTION' && /^[1-9]\d*$/.test(String(alert.subjectId)) ? `연결 #${alert.subjectId}` : '전체 작업 큐'
}
export function operationWaitTime(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value < 0) return '확인 불가'
  return value < 60 ? `${Math.floor(value)}초` : value < 3600 ? `${Math.floor(value / 60)}분` : `${Math.floor(value / 3600)}시간 ${Math.floor(value % 3600 / 60)}분`
}
export function SecretOperationsHealth() {
  const [expanded, setExpanded] = useState(false), [page, setPage] = useState(0), [state, setState] = useState('OPEN')
  const health = useQuery({ queryKey: ['secret-operations-health'], queryFn: fetchSecretOperationsHealth, retry: false, retryOnMount: false, refetchOnWindowFocus: false, refetchInterval: (query) => query.state.error ? false : 30000 })
  const authorized = health.isSuccess && health.data.status === 'AVAILABLE'
  const alerts = useQuery({ queryKey: ['secret-operations-alerts', state, page], queryFn: () => fetchSecretOperationAlerts(page, state), enabled: expanded && authorized, retry: false, refetchOnWindowFocus: false, refetchInterval: (query) => query.state.error ? false : 30000 })
  const refresh = () => { void health.refetch(); if (expanded) void alerts.refetch() }
  const denied = health.error instanceof ApiError && health.error.status === 403
  return <section className="secret-operations-health" aria-label="검사 운영 상태">
    <div className="secret-operations-heading"><div><h2>검사 운영 상태</h2><p>워커 응답과 작업 대기를 확인해요. 연결 인증·개별 검사 성공과는 별개예요.</p></div><button className="btn outline" disabled={health.isFetching} onClick={refresh}>상태 새로고침</button></div>
    {health.isPending ? <p role="status">운영 상태를 불러오는 중이에요.</p> : denied ? <p className="caption">전체 운영 상태는 공통 보안·운영 담당자만 조회할 수 있어요. 이 화면의 연결별 검사 결과는 별도로 확인하세요.</p> : health.isError || !authorized ? <p className="notice" role="alert">운영 상태를 확인하지 못했어요. 워커가 중지됐다고 단정하지 않아요. 상태를 다시 조회하세요.</p> : <>
      <div className="secret-operations-components">{health.data.components.map((component) => <article key={component.component} className={`state-${component.status.toLowerCase()}`}><div><h3>{operationComponentLabels[component.component] ?? '운영 구성요소'}</h3><strong>{operationStatusLabels[component.status] ?? '상태 확인 필요'}</strong></div><dl><div><dt>응답 중</dt><dd>{operationCount(component.liveInstances)} / {operationCount(component.expectedInstances)}개</dd></div><div><dt>최근 응답</dt><dd>{component.lastHeartbeatAt ? scanDate(component.lastHeartbeatAt) : '기록 없음'}</dd></div><div><dt>최근 작업 확인 성공</dt><dd>{component.lastSuccessAt ? scanDate(component.lastSuccessAt) : '기록 없음'}</dd></div></dl></article>)}</div>
      <dl className="secret-operations-queue" aria-label="작업 큐 상태"><div><dt>실행 대기</dt><dd>{operationCount(health.data.queue.ready)}건</dd></div><div><dt>재시도 대기</dt><dd>{operationCount(health.data.queue.delayed)}건</dd></div><div><dt>실행 중</dt><dd>{operationCount(health.data.queue.leased)}건</dd></div><div><dt>가장 오래 대기</dt><dd>{operationWaitTime(health.data.queue.oldestReadySeconds)}</dd></div><div><dt>24시간 작업 실패</dt><dd>{operationCount(health.data.queue.failed24h)}건</dd></div><div><dt>24시간 부분 실패</dt><dd>{operationCount(health.data.queue.partial24h)}건</dd></div></dl>
      <details className="secret-operations-alerts" onToggle={(event) => setExpanded(event.currentTarget.open)}><summary>운영 알림 <span>확인 필요 {operationCount(health.data.alerts.open)}건</span></summary><div className="secret-operations-alert-filters"><label>알림 상태<select className="select" value={state} onChange={(event) => { setState(event.target.value); setPage(0) }}><option value="OPEN">확인 필요</option><option value="RECOVERED">회복 이력</option><option value="ALL">전체 이력</option></select></label><span className="caption">회복은 운영 오류가 해소됐다는 뜻이며 키 조치 완료와 달라요.</span></div>
        {alerts.isPending ? <p role="status">운영 알림을 불러오는 중이에요.</p> : alerts.isError || alerts.data.status === 'UNAVAILABLE' ? <p className="notice error" role="alert">운영 알림을 불러오지 못했어요. <button className="btn outline" onClick={() => void alerts.refetch()}>알림 다시 조회</button></p> : !alerts.data.items.length ? <p className="caption">이 조건에서 기록된 운영 알림이 없어요. 아직 검사하지 않은 범위의 안전을 뜻하지 않아요.</p> : <><ol className="secret-operation-alert-list">{alerts.data.items.map((alert) => { const target = operationAlertTarget(alert); return <li key={alert.id}><div><strong>{operationAlertLabels[alert.kind] ?? '운영 상태 확인 필요'}</strong><span className={alert.status === 'RECOVERED' ? 'recovered' : 'open'}>{alert.status === 'RECOVERED' ? '회복됨' : '확인 필요'}</span></div><p>{target ? <Link to={target}>{operationAlertSubject(alert)} 검사 확인</Link> : operationAlertSubject(alert)} · {operationCount(alert.occurrences)}회 기록</p><p className="caption">최근 확인 {scanDate(alert.lastSeenAt)}{alert.recoveredAt ? ` · 회복 ${scanDate(alert.recoveredAt)}` : ''}</p></li> })}</ol><div className="row"><button className="btn outline" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>알림 이전</button><span className="caption">{page + 1} 페이지 · {alerts.data.total}건</span><button className="btn outline" disabled={(page + 1) * alerts.data.size >= alerts.data.total} onClick={() => setPage((value) => value + 1)}>알림 다음</button></div></>}
      </details><p className="secret-operations-asof">조회 {scanDate(health.data.asOf)} · 화면이 열려 있는 동안 30초마다 갱신해요.</p>
    </>}
  </section>
}
