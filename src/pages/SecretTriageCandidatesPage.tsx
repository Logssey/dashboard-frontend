import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { fetchReviewQueue } from '@/api/secretTriage'
import { PageHeader } from '@/components/PageHeader'
import { componentStateLabel } from '@/lib/labels'
import { inventoryOptions, presenceLabels } from '@/lib/secretInventory'
import { reviewBuckets, reviewDetailPath } from '@/lib/secretReview'
import { positiveId, scanDate } from '@/lib/secretScan'
import { isSecretSnapshotInvalidated } from '@/lib/secretSnapshotState'
import './secret-review.css'
import './secret-scan.css'

export function SecretTriageCandidatesPage() {
  const [params, setParams] = useSearchParams()
  const bucket = params.get('bucket') ?? 'NEEDS_DECISION', origin = params.get('origin') ?? 'PRODUCTION'
  const page = (positiveId(params.get('page')) ?? 1) - 1, snapshotId = params.get('snapshotId') ?? '', stages = params.get('stages') ?? ''
  const [refreshVersion, setRefreshVersion] = useState(0)
  const restored = useRef('')
  const invalidated = isSecretSnapshotInvalidated(snapshotId)
  const valid = Object.hasOwn(reviewBuckets, bucket) && Object.hasOwn(inventoryOptions.origin, origin) && (!stages || (bucket === 'ACTION_REQUIRED' && stages.split(',').every((stage) => ['OPEN', 'IN_PROGRESS', 'REVALIDATION_PENDING'].includes(stage))))
  const queue = useQuery({ queryKey: ['secret-review-queue', bucket, origin, page, snapshotId, stages, refreshVersion], queryFn: () => fetchReviewQueue(bucket, origin, page, snapshotId, stages), enabled: valid && !invalidated, retry: false, refetchOnWindowFocus: false })
  const selection = reviewBuckets[bucket]
  const focusKey = `secret-review-focus:${params}`
  useEffect(() => {
    if (!queue.isSuccess) return
    let focus = params.get('focus')
    try { focus ??= sessionStorage.getItem(focusKey) } catch { /* Optional browser context. */ }
    if (!focus || !/^\d+:\d+$/.test(focus) || restored.current === `${focusKey}:${focus}`) return
    const link = document.getElementById(`review-link-${focus.replace(':', '-')}`)
    if (link) { link.focus({ preventScroll: true }); link.scrollIntoView({ block: 'center' }); restored.current = `${focusKey}:${focus}` }
  }, [queue.isSuccess, queue.data, params, focusKey])
  const remember = (key: number, occurrence: number) => { try { sessionStorage.setItem(focusKey, `${key}:${occurrence}`) } catch { /* Optional navigation context. */ } }
  const change = (key: string, value: string) => { const next = new URLSearchParams(params); next.set(key, value); next.set('page', '1'); next.delete('snapshotId'); next.delete('focus'); if (key === 'bucket') next.delete('stages'); setParams(next) }
  const refresh = () => { const next = new URLSearchParams(params); next.delete('snapshotId'); next.delete('focus'); next.set('page', '1'); setRefreshVersion((version) => version + 1); setParams(next) }
  return <>
    <PageHeader title="확인 대기열" description="무엇이 부족한지 확인하고, 위치별 근거에 맞는 작업을 선택하세요." actions={<><Link className="btn outline" to="/secrets/triage/investigations">추가 조사</Link><Link className="btn outline" to="/secrets/triage/alerts">실키 경고</Link></>} />
    <section className="card secret-scan-filters"><label>할 일<select className="select" value={bucket} onChange={(e) => change('bucket', e.target.value)}>{Object.entries(reviewBuckets).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select></label><label>출처<select className="select" value={origin} onChange={(e) => change('origin', e.target.value)}>{Object.entries(inventoryOptions.origin).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="btn outline" disabled={queue.isFetching} onClick={refresh}>새로고침</button></section>
    {origin === 'TEST' && <p className="notice">시험 출처예요. 실키 가능성과 합성 근거는 별도 경고·조사에서 확인하세요.</p>}
    <section className="card secret-scan-section" aria-labelledby="review-queue-title"><h2 id="review-queue-title">{selection?.label ?? '확인 대기열'}</h2>
      {!valid ? <p className="notice error" role="alert">대기열 조회 조건을 확인해 주세요.</p> : invalidated ? <div className="secret-scan-message" role="status"><p>보안 판단이 변경됐어요. 최신 조회 기준으로 확인해 주세요.</p><button className="btn primary" onClick={refresh}>새 기준으로 조회</button></div> : queue.isPending ? <p className="secret-scan-message" role="status">확인할 항목을 불러오는 중이에요.</p> : queue.isError ? <div className="secret-scan-message notice error" role="alert"><p>{queue.error instanceof ApiError && queue.error.status === 403 ? '이 대기열을 조회할 권한이 없어요.' : queue.error instanceof ApiError && [404, 409].includes(queue.error.status) && snapshotId ? '조회 기준이 만료되거나 달라졌어요.' : '확인 대기열을 불러오지 못했어요.'}</p><button className="btn outline" onClick={() => snapshotId ? refresh() : void queue.refetch()}>{snapshotId ? '새 기준으로 조회' : '다시 조회'}</button></div> : <>
        <p className="caption">단위: {queue.data.unit === 'Occurrence' ? '발견 위치' : queue.data.unit === 'ResponseCase' ? '대응 건' : queue.data.unit === 'CredentialSet' ? '고유 키' : '단위 확인 필요'} · {scanDate(queue.data.asOf)}</p>
        {queue.data.partialCoverage === true && <p className="notice">검사에서 확인하지 못한 범위가 있어요. 확인된 결과를 전체 범위로 확대하지 않아요.</p>}
        {!queue.data.items.length ? <p className="secret-scan-message">조건에 맞는 항목이 없어요.</p> : <div className="table-scroll" tabIndex={0} role="region" aria-label="업무별 확인 대기열"><table><thead><tr><th>키·위치</th><th>여기에 있는 이유</th><th>현재 사실</th><th>담당·기한</th><th>다음 행동</th></tr></thead><tbody>{queue.data.items.map((item, index) => {
          const href = bucket === 'ACTION_REQUIRED' && item.caseId ? `/secrets/cases?origin=${item.origin}&case=${item.caseId}` : item.occurrenceId ? reviewDetailPath(item.credentialSetId, item.occurrenceId, params) : `/secrets/${item.credentialSetId}?origin=${item.origin}`
          return <tr key={`${item.credentialSetId}:${item.occurrenceId ?? item.caseId ?? index}`}><td><Link id={item.occurrenceId ? `review-link-${item.credentialSetId}-${item.occurrenceId}` : undefined} to={href} onClick={() => item.occurrenceId && remember(item.credentialSetId, item.occurrenceId)}>{item.maskedLabel || `키 #${item.credentialSetId}`}</Link><span className="asset">{item.safeLocationLabel ?? (item.occurrenceId ? `위치 #${item.occurrenceId}` : '')}</span></td><td>{item.whyHere || '근거 확인 필요'}{item.inventorySubtype && <span className="asset">{{ AUTHORIZED_STORAGE: '승인된 보관', METADATA_ONLY: '메타데이터만 확인', RETIRED_HISTORY: '폐기·만료 이력' }[item.inventorySubtype] ?? '인벤토리 근거 확인'}</span>}</td><td>{componentStateLabel[item.componentState]}<span className="asset">{presenceLabels[item.presence] ?? '존재 상태 미확인'}</span></td><td>{item.assigneeDisplayName ?? '담당 정보 없음'}<span className="asset">{item.dueAt ? scanDate(item.dueAt) : '기한 미설정'}</span></td><td><Link className="secret-history-detail-button" to={href}>{bucket === 'ACTION_REQUIRED' ? '대응 건 확인' : item.occurrenceId ? '위치 근거 확인' : '키 상세'}</Link></td></tr>
        })}</tbody></table></div>}
        <div className="table-foot secret-table-foot"><span>{queue.data.total}{selection?.unit === '위치' ? '곳' : selection?.unit === '고유 키' ? '개 키' : '건'} · 다른 단위의 목록과 합산하지 않아요.</span><div className="row"><button className="btn outline" disabled={page === 0} onClick={() => { const next = new URLSearchParams(params); next.set('page', String(page)); setParams(next) }}>이전</button><span>{page + 1}</span><button className="btn outline" disabled={(page + 1) * queue.data.size >= queue.data.total} onClick={() => { const next = new URLSearchParams(params); next.set('page', String(page + 2)); setParams(next) }}>다음</button></div></div>
      </>}
    </section>
  </>
}
