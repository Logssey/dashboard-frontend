import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, Navigate } from 'react-router-dom'
import { withSecretOrigin } from '@/lib/secretNavigation'
import { ApiError } from '@/api/client'
import { fetchSecrets, type InventoryFilter } from '@/api/secrets'
import { Badge } from '@/components/Badge'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { SecretFilterDisclosure } from '@/components/SecretFilterDisclosure'
import { SecretFixtureBatch } from '@/components/SecretFixtureBatch'
import { useSecretListParams } from '@/lib/useSecretListParams'
import { PageHeader } from '@/components/PageHeader'
import { componentStateLabel, credentialTypeLabel, issuerLabel, secretValidationLabel } from '@/lib/labels'
import { buildMaskedSecretsCsv, loadAllSecretItems } from '@/lib/secretCsv'
import { inventoryOptions, inventorySearch, inventorySubtypeLabel, keyDetailPath, nextLabel, parseInventoryFilters, whyLabel } from '@/lib/secretInventory'
import { positiveId, scanDate, scanDetailPath } from '@/lib/secretScan'
import { isSecretSnapshotInvalidated } from '@/lib/secretSnapshotState'
import './secret-csv.css'
import './secret-inventory.css'
import './secret-scan.css'

export function SecretsPage() {
  const [params, setParams] = useSecretListParams()
  const { filters, errors } = parseInventoryFilters(params)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const restored = useRef('')
  const legacyRun = positiveId(params.get('run'))
  const locallyInvalidated = isSecretSnapshotInvalidated(filters.snapshotId)
  const inventory = useQuery({ queryKey: ['secret-inventory', filters, refreshVersion], queryFn: () => fetchSecrets(filters), enabled: !errors.length && !legacyRun && !locallyInvalidated,
    retry: (count, error) => !(error instanceof ApiError && [400, 403, 404, 409].includes(error.status)) && count < 1,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
  })
  useEffect(() => {
    if (!filters.snapshotId && inventory.isSuccess && !inventory.isFetching && inventory.data?.snapshotId) {
      const next = inventorySearch({ ...filters, snapshotId: inventory.data.snapshotId })
      const focus = positiveId(params.get('focus')); if (focus) next.set('focus', String(focus))
      setParams(next, { replace: true })
    }
  }, [inventory.data?.snapshotId, inventory.isSuccess, inventory.isFetching, filters.snapshotId, filters, params, setParams])
  useEffect(() => {
    if (!inventory.isSuccess || inventory.isFetching || !inventory.data.snapshotId) return
    const lastPage = Math.max(0, Math.ceil(inventory.data.total / filters.size) - 1)
    if (filters.page > lastPage) setParams(inventorySearch({ ...filters, snapshotId: inventory.data.snapshotId, page: lastPage }), { replace: true })
  }, [inventory.isSuccess, inventory.isFetching, inventory.data, filters, setParams])
  const focusKey = `secret-inventory-focus:${inventorySearch(filters)}`
  useEffect(() => {
    if (!inventory.isSuccess) return
    let focus = positiveId(params.get('focus'))
    try { focus ??= positiveId(sessionStorage.getItem(focusKey)) } catch { /* Optional navigation context. */ }
    if (!focus || restored.current === `${focusKey}:${focus}`) return
    const link = document.getElementById(`key-link-${focus}`)
    if (link) { link.focus({ preventScroll: true }); link.scrollIntoView({ block: 'center' }); restored.current = `${focusKey}:${focus}`; try { sessionStorage.removeItem(focusKey) } catch { /* Storage may be unavailable. */ } }
  }, [inventory.isSuccess, inventory.data, params, focusKey])
  const download = useMutation({
    mutationFn: async (selection: { filters: InventoryFilter; asOf: string }) => buildMaskedSecretsCsv(await loadAllSecretItems(fetchSecrets, selection.filters), { asOf: selection.asOf, origin: selection.filters.origin, runId: selection.filters.runId }),
    onSuccess: (csv) => {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a'); link.href = url; link.download = `logssey-secrets-masked-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
  })
  if (legacyRun) return <Navigate replace to={withSecretOrigin(scanDetailPath(legacyRun), params)} />
  const refresh = () => {
    download.reset()
    const next = inventorySearch({ ...filters, snapshotId: '' })
    let focus = params.get('focus')
    try { focus ??= sessionStorage.getItem(focusKey) } catch { /* Optional browser context. */ }
    if (focus && positiveId(focus)) next.set('focus', focus)
    restored.current = ''
    setRefreshVersion((version) => version + 1)
    setParams(next)
  }
  const remember = (id: number) => { try { sessionStorage.setItem(focusKey, String(id)) } catch { /* Optional browser context. */ } }
  const snapshot = inventory.data?.snapshotId
  const error = inventory.error
  const refreshRequired = error instanceof ApiError && [404, 409].includes(error.status) && Boolean(filters.snapshotId)
  return <>
    <PageHeader title="발견된 키" description="고유 키별로 발견 위치와 확인할 이유를 살펴보세요." actions={<>
      <details className="security-more"><summary>추가 작업</summary>
      <button className="btn secret-export-button" disabled={download.isPending || locallyInvalidated || !inventory.isSuccess || !snapshot || !inventory.data?.asOf || !filters.snapshotId || inventory.data.total === 0} onClick={() => snapshot && inventory.data?.asOf && download.mutate({ filters: { ...filters, snapshotId: snapshot }, asOf: inventory.data.asOf })}><Icon name="download" />{download.isPending ? 'CSV 준비 중…' : '마스킹 CSV 내보내기'}</button>
      {inventory.isSuccess && !locallyInvalidated && <SecretFixtureBatch items={inventory.data.items} snapshotId={snapshot ?? undefined} onChanged={refresh} />}
      </details>
      <Link className="btn primary" to={withSecretOrigin("/secrets/history?request=scan", filters.origin)}><Icon name="search" /> 검사 요청</Link>
    </>} />
    <SecretFilterDisclosure label="키 목록" search busy={inventory.isFetching} searchRejected={params.get('searchRejected') === '1'}
      values={{ q: filters.q ?? '', contentKind: filters.contentKind, workBucket: filters.workBucket, source: filters.source, provider: filters.provider, environment: filters.environment, componentState: filters.componentState, validity: filters.validity, severity: filters.severity }}
      fields={([
        ['source', '발견 플랫폼'], ['environment', '자원 환경'], ['provider', '키 발급 서비스'],
        ['contentKind', '기록 종류'], ['workBucket', '할 일'], ['componentState', '키 구성'], ['validity', '유효성'], ['severity', '위험도'],
      ] as const).map(([key, label]) => ({ key, label, options: inventoryOptions[key], defaultValue: 'ALL' }))}
      onApply={(values) => { download.reset(); setParams(inventorySearch({ ...filters, ...values, page: 0, snapshotId: '' })) }}
      onReset={() => { download.reset(); setParams(new URLSearchParams()) }} />
    {filters.runId && <p className="notice">SCAN-{filters.runId}에서 발견한 키를 조회하고 있어요. 원래 탐지 근거와 현재 키 상태는 다를 수 있어요. <Link to={withSecretOrigin(scanDetailPath(filters.runId), filters.origin)}>실행 상세</Link> <button className="btn outline" onClick={() => setParams(inventorySearch({ ...filters, runId: null, snapshotId: '', page: 0 }))}>실행 조건 해제</button></p>}
    {!!errors.length && <p className="notice error" role="alert">조회 조건이 올바르지 않아요. <button className="btn outline" onClick={() => setParams(new URLSearchParams())}>필터 초기화</button></p>}
    {download.isError && <p className="notice error" role="alert">{download.error.message === 'SECRET_EXPORT_TOO_LARGE' ? '한 번에 10,000개까지 내보낼 수 있어요. 조건을 좁혀 주세요.' : download.error instanceof ApiError && [404, 409].includes(download.error.status) ? '조회 기준이 만료되거나 권한이 바뀌었어요. 새로고침 후 다시 내보내 주세요.' : 'CSV를 완성하지 못했어요. 목록을 새로고침한 뒤 다시 시도해 주세요.'}</p>}
    {inventory.data?.restrictedCoverage && inventory.isSuccess && <p className="notice secret-inventory-origin">열람 가능한 위치 기준이에요. 전체 범위에 대한 결론은 내릴 수 없어요.</p>}
    <section className="card list-card secret-inventory-list" aria-labelledby="inventory-title" aria-busy={inventory.isFetching}>
      <div className="card-head"><div><h2 id="inventory-title">{inventoryOptions.contentKind[filters.contentKind as keyof typeof inventoryOptions.contentKind]}</h2><p className="caption">단위: 고유 키{inventory.data?.asOf && inventory.isSuccess ? ` · 기준 ${scanDate(inventory.data.asOf)}` : ''}</p></div></div>
      {errors.length ? null : locallyInvalidated ? <div className="secret-scan-message notice" role="status"><p>보안 판단 또는 정책이 변경됐어요. 최신 기준으로 목록을 갱신해 주세요.</p><button className="btn primary" onClick={refresh}>새 기준으로 조회</button></div> : inventory.isPending ? <p className="secret-scan-message" role="status">키 목록을 불러오는 중이에요.</p> : inventory.isError ? <div className="secret-scan-message" role="alert"><h3>{refreshRequired ? '조회 기준을 갱신해 주세요' : error instanceof ApiError && error.status === 403 ? '키 목록을 조회할 권한이 없어요' : '키 목록을 불러오지 못했어요'}</h3><p>{refreshRequired ? '이전 목록을 현재 상태로 표시하지 않아요.' : '조회 실패는 탐지 결과 0개를 의미하지 않아요.'}</p><button className="btn outline" onClick={() => refreshRequired ? refresh() : void inventory.refetch()}>{refreshRequired ? '새 기준으로 조회' : '다시 조회'}</button></div> : !inventory.data.items.length ? <EmptyState title="조건에 맞는 키가 없어요" description="필터를 변경하거나 승인된 연결의 검사 이력을 확인하세요." /> : <div className="table-scroll" tabIndex={0} role="region" aria-label="고유 키 인벤토리. 좁은 화면에서는 가로로 스크롤하세요."><table><thead><tr><th scope="col">키</th><th scope="col">확인할 이유</th><th scope="col">구성·검증</th><th scope="col">열람 위치</th><th scope="col">최근 발견</th><th scope="col">다음 행동</th></tr></thead><tbody>{inventory.data.items.map((item) => {
        const href = keyDetailPath(item.id, { ...filters, snapshotId: snapshot ?? filters.snapshotId })
        const caseLink = item.nextActionCode === 'VIEW_CASE' && item.currentCaseId ? `/secrets/cases/${item.currentCaseId}?origin=${item.origin ?? filters.origin}` : null
        return <tr key={item.id}><td><Link className="finding-link" id={`key-link-${item.id}`} to={href} onClick={() => remember(item.id)}>{item.maskedLabel || `키 #${item.id}`}</Link><span className="asset">{issuerLabel[item.issuer] ?? '발급자 미확인'} · {credentialTypeLabel(item.credentialType)}</span>{inventory.data.items.filter((other) => other.maskedLabel === item.maskedLabel).length > 1 && <span className="asset">구분 번호 #{item.id}</span>}</td><td><Badge label={whyLabel(item.whyHereCode)} />{item.inventorySubtype && <span className="asset">{inventorySubtypeLabel(item.inventorySubtype)}</span>}<span className="asset">{item.safeLocationLabel ?? '위치 상세에서 확인'}</span></td><td>{item.componentState === 'METADATA_ONLY' ? '존재 정보 조회' : componentStateLabel[item.componentState]}<span className="asset">{item.componentState === 'METADATA_ONLY' ? '키 값 인증 대상 아님' : `인증 ${secretValidationLabel(item.validationStatus)}`}</span></td><td>{item.visibleLocationCount ?? item.occurrenceCount}곳<span className="asset">열람 가능한 위치</span>{item.remediationSummary && item.remediationSummary.requiredLocationCount > 0 && <span className="asset">조치 위치 {item.remediationSummary.requiredLocationCount} · 발견 {item.remediationSummary.presentLocationCount} · 확인 불가 {item.remediationSummary.unknownLocationCount}</span>}</td><td>{scanDate(item.lastSeenAt)}</td><td><Link className="secret-history-detail-button" to={caseLink ?? href} onClick={() => !caseLink && remember(item.id)}>{nextLabel(item.nextActionCode)} <Icon name="chevron" /></Link></td></tr>
      })}</tbody></table></div>}
      {inventory.isSuccess && !errors.length && !locallyInvalidated && <div className="table-foot secret-table-foot"><span>열람 가능한 고유 키 {inventory.data.total}개 · 현재 {inventory.data.items.length}개 표시</span><div className="row"><button className="btn outline" disabled={filters.page === 0} onClick={() => setParams(inventorySearch({ ...filters, page: filters.page - 1 }))}>이전</button><span>{filters.page + 1} / {Math.max(1, Math.ceil(inventory.data.total / filters.size))}</span><button className="btn outline" disabled={(filters.page + 1) * filters.size >= inventory.data.total} onClick={() => setParams(inventorySearch({ ...filters, page: filters.page + 1 }))}>다음</button></div></div>}
    </section>
  </>
}
