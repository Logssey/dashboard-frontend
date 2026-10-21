import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { fetchManagedConnections, testSecretConnection, type ManagedSecretConnection, type ScanAttempt, type SecretConnectionTestResult } from '@/api/secretConnections'
import { Icon } from '@/components/Icon'
import { PageHeader } from '@/components/PageHeader'
import { positiveId, scanDate, scanDetailPath, scanPlatforms, scanReason, scanStatus } from '@/lib/secretScan'
import './secret-connections.css'
import './secret-scan.css'

export function AttemptLink({ attempt }: { attempt: ScanAttempt | null | undefined }) {
  return attempt ? <><Link to={scanDetailPath(attempt.runId)}>SCAN-{attempt.runId} · {scanStatus(attempt.status)}</Link><small>{scanDate(attempt.finishedAt ?? attempt.requestedAt)}</small></> : <>확인 기록 없음</>
}
function probeLabel(status: string): string {
  return status === 'CONNECTED' ? '연결 확인됨' : status === 'FAILED' ? '연결 실패' : '연결 확인 불가'
}
const blockedLabel = (reason?: string | null) => ({ OPERATIONS_ROLE_REQUIRED: '연결 테스트·스캔 실행 권한이 없어요. 운영 담당자에게 실행 권한을 요청하세요.', PROVIDER_UNSUPPORTED: '아직 실행을 지원하지 않는 소스예요.', CONNECTION_PAUSED: '이 연결은 일시중지 상태예요.', NO_SCAN_TARGETS: '검사할 저장소·리소스가 등록되지 않았어요.', INVALID_APPROVED_SCOPE: '등록된 검사 대상 형식을 확인해야 해요.' } as Record<string, string>)[reason ?? ''] ?? '실행 권한과 연결 설정을 확인하세요.'
function ConnectionCard({ connection, result, testing, error, onTest }: {
  connection: ManagedSecretConnection; result?: SecretConnectionTestResult; testing: boolean; error?: string; onTest: (id: number) => void
}) {
  const probe = result && (!connection.latestProbe || Date.parse(result.checkedAt) >= Date.parse(connection.latestProbe.checkedAt)) ? result : connection.latestProbe
  return <article className="secret-connection-card">
    <div className="secret-connection-card-top"><span className={`secret-provider-mark ${connection.provider.toLowerCase()}`} aria-hidden="true">{connection.provider === 'GITHUB' ? 'GH' : connection.provider === 'AWS' ? 'aws' : scanPlatforms[connection.provider]}</span><span className={`secret-connection-state ${connection.connectionStatus === 'ACTIVE' ? '' : 'inactive'}`}>{connection.connectionStatus === 'ACTIVE' ? '사용 설정 켜짐' : connection.connectionStatus === 'PAUSED' ? '일시중지' : connection.connectionStatus === 'ERROR' ? '확인 필요' : '상태 미확인'}</span></div>
    <h2>{scanPlatforms[connection.provider] ?? '수집 연결'}</h2><p className="secret-connection-name">{connection.safeDisplayAlias ?? `연결 #${connection.connectionId}`}</p>
    {connection.targetSummary?.length ? <div className="secret-source-coordinates"><strong>검사 대상</strong>{connection.targetSummary.map((target) => <span key={target}>{target}</span>)}{connection.approvedScopeCount > connection.targetSummary.length && <small>그 외 {connection.approvedScopeCount - connection.targetSummary.length}개</small>}</div> : null}
    <dl className="secret-connection-facts"><dt>등록된 검사 대상</dt><dd>{connection.approvedScopeCount}개 · 승인 버전 {connection.scopeRevision ?? '미기록'}</dd><dt>최근 검사 시도</dt><dd><AttemptLink attempt={connection.lastFullScanAttempt} /></dd><dt>마지막 완전 성공</dt><dd><AttemptLink attempt={connection.lastSuccessfulFullScan} /></dd><dt>다음 정기 검사</dt><dd>{connection.nextDueAt ? scanDate(connection.nextDueAt) : '예정 시각 미확인'}</dd></dl>
    {connection.activeJob && <p className="secret-connection-active-job"><Link to={scanDetailPath(connection.activeJob.runId)}>SCAN-{connection.activeJob.runId} · {scanStatus(connection.activeJob.status)}</Link></p>}
    <div className={`secret-connection-test-result ${probe?.status.toLowerCase() ?? 'unavailable'}`} role="status"><strong>{probe ? probeLabel(probe.status) : '연결 여부 아직 확인 안 함'}</strong><span>{probe?.reasonCode ? scanReason(probe.reasonCode) : probe?.status === 'CONNECTED' ? '신원·설치만 확인했어요. 범위 읽기 성공과는 별개예요.' : '연결 테스트로 신원·설치를 확인할 수 있어요.'}</span>{probe?.checkedAt && <time dateTime={probe.checkedAt}>{scanDate(probe.checkedAt)}</time>}</div>
    {error && <p className="secret-connection-test-error" role="alert">{error}</p>}
    <div className="secret-connection-actions"><Link className="btn outline" to={`/secrets/connections/${connection.connectionId}/scopes`}>검사 대상 보기</Link><button className="btn secret-connection-test-button" disabled={testing || !connection.capabilities?.canTest} onClick={() => onTest(connection.connectionId)}><span className="secret-connection-refresh" aria-hidden="true">↻</span>{testing ? '확인 중…' : '연결 테스트'}</button>{connection.capabilities?.canRun && <Link className="btn primary" to={`/secrets/history?request=scan&connectionId=${connection.connectionId}`}>스캔 요청</Link>}</div>
    {(!connection.capabilities?.canTest || !connection.capabilities?.canRun) && <p className="caption" role="status">{blockedLabel(connection.testBlockedReasonCode ?? connection.scanBlockedReasonCode)}</p>}
  </article>
}

export function SecretConnectionsPage() {
  const [params, setParams] = useSearchParams()
  const page = (positiveId(params.get('page')) ?? 1) - 1
  const status = params.get('status') ?? ''
  const origin = params.get('origin') ?? ''
  const valid = ['', 'ACTIVE', 'PAUSED', 'ERROR'].includes(status) && ['', 'PRODUCTION', 'TEST', 'UNCLASSIFIED'].includes(origin)
  const client = useQueryClient()
  const connections = useQuery({ queryKey: ['secret-connections-manage', page, status, origin], queryFn: () => fetchManagedConnections(page, status, origin), enabled: valid, placeholderData: keepPreviousData })
  const [results, setResults] = useState<Record<number, SecretConnectionTestResult>>({})
  const [errors, setErrors] = useState<Record<number, string>>({})
  const test = useMutation({ mutationFn: testSecretConnection, onMutate: (id) => setErrors((current) => ({ ...current, [id]: '' })), onSuccess: (result) => { setResults((current) => ({ ...current, [result.connectionId]: result })); void client.invalidateQueries({ queryKey: ['secret-connections-manage'] }) }, onError: (error, id) => setErrors((current) => ({ ...current, [id]: error instanceof ApiError && error.status === 403 ? '연결 테스트 권한이 없어요.' : error instanceof ApiError && error.status === 409 ? '일시중지 또는 미지원 연결이에요.' : '연결 테스트를 완료하지 못했어요. 다시 시도해 주세요.' })) })
  const items = connections.data?.items ?? []
  const change = (key: string, value: string) => { const next = new URLSearchParams(params); next.set('page', '1'); if (value) next.set(key, value); else next.delete(key); setParams(next) }
  return <>
    <PageHeader title="연결 관리" description="연결 테스트로 접근 여부를 확인하고 등록된 검사 대상을 스캔하세요." actions={<><Link className="btn outline" to="/secrets/connections/review">운영·시험 분류</Link><Link className="btn outline" to="/secrets/connections/policies">보관 규칙 (고급)</Link></>} />
    <div className="secret-connection-info" role="note"><span className="secret-connection-info-icon" aria-hidden="true">ⓘ</span><span>연결 테스트는 신원·설치만 확인해요. 본문 읽기·키 탐지·유효성 검증은 실행하지 않아요. 연결 테스트 후 스캔을 요청하면 실제 파일·설정을 읽고 키를 탐지해요. 분류·보관 규칙을 먼저 설정할 필요는 없어요.</span></div>
    <div className="card secret-scan-filters"><label>연결 상태<select className="select" value={status} onChange={(e) => change('status', e.target.value)}><option value="">전체 상태</option><option value="ACTIVE">활성</option><option value="PAUSED">일시중지</option><option value="ERROR">확인 필요</option></select></label><label>범위 출처<select className="select" value={origin} onChange={(e) => change('origin', e.target.value)}><option value="">전체 출처</option><option value="PRODUCTION">운영</option><option value="TEST">시험</option><option value="UNCLASSIFIED">미분류</option></select></label></div>
    {!valid ? <p className="notice error" role="alert">조회 조건을 확인해 주세요. <button className="btn outline" onClick={() => setParams(new URLSearchParams())}>조건 초기화</button></p> : connections.isPending ? <p className="card secret-scan-message" role="status">연결 상태를 불러오는 중이에요.</p> : connections.isError ? <div className="secret-connection-page-error" role="alert"><p>{connections.error instanceof ApiError && connections.error.status === 403 ? '연결 운영 정보를 조회할 권한이 없어요.' : '연결 목록을 불러오지 못했어요.'}</p><button className="btn outline" onClick={() => void connections.refetch()}>다시 조회</button></div> : !items.length ? <div className="secret-connection-empty"><strong>조건에 맞는 연결이 없어요.</strong><p>연결 등록과 자격 증명 설정은 승인된 운영 관리 경로에서 진행해 주세요.</p></div> : <div className="secret-connection-grid" aria-busy={connections.isFetching}>{items.map((connection) => <ConnectionCard key={connection.connectionId} connection={connection} result={results[connection.connectionId]} error={errors[connection.connectionId]} testing={test.isPending && test.variables === connection.connectionId} onTest={(id) => test.mutate(id)} />)}</div>}
    {connections.isSuccess && <div className="table-foot secret-table-foot"><span>연결 {connections.data.total}개 · {connections.data.asOf ? scanDate(connections.data.asOf) : '기준 시각 미확인'}</span><div className="row"><button className="btn outline" disabled={page === 0} onClick={() => { const next = new URLSearchParams(params); next.set('page', String(page)); setParams(next) }}>이전</button><span>{page + 1} / {Math.max(1, Math.ceil(connections.data.total / connections.data.size))}</span><button className="btn outline" disabled={(page + 1) * connections.data.size >= connections.data.total || connections.isPlaceholderData} onClick={() => { const next = new URLSearchParams(params); next.set('page', String(page + 2)); setParams(next) }}>다음</button></div></div>}
    <div className="secret-connection-guides"><section className="secret-connection-guide"><h2>검사 대상과 결과</h2><p>최근 실패가 있더라도 과거의 마지막 성공 기록은 보존해요. 승인 범위가 바뀌면 새 버전에서 다시 확인해야 해요.</p></section><section className="secret-connection-guide"><h2>스캔 이력</h2><p>수집·탐지·검증 단계와 부분 실패를 확인하세요.</p><Link className="btn secret-connection-history-link" to="/secrets/history">스캔 이력으로 이동 <Icon name="chevron" /></Link></section></div>
  </>
}
