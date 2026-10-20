import { useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { fetchRunFindings } from '@/api/secretRuns'
import { PageHeader } from '@/components/PageHeader'
import { componentStateLabel } from '@/lib/labels'
import { inventoryOptions } from '@/lib/secretInventory'
import { positiveId, scanDate, scanDetailPath } from '@/lib/secretScan'
import './secret-scan.css'

export function SecretRunFindingsPage() {
  const { runId: rawId } = useParams(), runId = positiveId(rawId)
  const [params, setParams] = useSearchParams(), page = (positiveId(params.get('page')) ?? 1) - 1
  const findings = useQuery({ queryKey: ['secret-run-findings', runId, page], queryFn: () => fetchRunFindings(runId!, page), enabled: runId !== null, retry: false, refetchOnWindowFocus: false })
  return <><Link className="secret-scan-back" to={runId ? scanDetailPath(runId) : '/secrets/history'}>← 실행 상세</Link><PageHeader title={runId ? `SCAN-${runId} 탐지 근거` : '실행 탐지 근거'} description="이 실행에서 생성한 탐지 근거예요. 키 수와 위치 수는 별도 단위예요." />
    {!runId ? <p className="notice error" role="alert">실행 주소를 확인해 주세요.</p> : findings.isPending ? <p className="card secret-scan-message" role="status">실행의 발견 결과를 불러오는 중이에요.</p> : findings.isError ? <section className="card secret-scan-message" role="alert"><p>{findings.error instanceof ApiError && [403, 404].includes(findings.error.status) ? '허용된 발견 결과를 조회할 수 없어요.' : '발견 결과를 불러오지 못했어요.'}</p><button className="btn outline" onClick={() => void findings.refetch()}>다시 조회</button></section> : findings.data.runId !== runId ? <p className="notice error" role="alert">조회한 결과가 실행 주소와 일치하지 않아요.</p> : <section className="card secret-scan-section"><h2>탐지 근거 {findings.data.total}건</h2><p className="caption">현재 조회 시각 {scanDate(findings.data.asOf)} · 탐지 근거 단위</p>{findings.data.items.length === 0 ? <p className="secret-scan-message">열람 가능한 탐지 근거가 없어요. 검사하지 못한 범위의 안전을 뜻하지 않아요.</p> : <div className="table-scroll" tabIndex={0} role="region" aria-label="이번 실행의 탐지 근거"><table><thead><tr><th>키·위치</th><th>출처</th><th>구성</th><th>탐지 룰</th><th>현재 근거</th></tr></thead><tbody>{findings.data.items.map((finding) => <tr key={finding.findingId}><td>{finding.maskedLabel}<span className="asset">위치 #{finding.occurrenceId} · 탐지 #{finding.findingId}</span></td><td>{inventoryOptions.origin[finding.origin as keyof typeof inventoryOptions.origin] ?? '출처 확인 필요'}</td><td>{componentStateLabel[finding.componentState as keyof typeof componentStateLabel] ?? '구성 확인 필요'}</td><td>{finding.ruleId}<span className="asset">룰 버전 {finding.ruleVersion ?? '미기록'}</span></td><td><Link to={`/secrets/${finding.credentialSetId}?origin=${finding.origin}&occurrence=${finding.occurrenceId}&return=run-findings&runId=${runId}&returnPage=${page + 1}`}>키·위치 확인</Link></td></tr>)}</tbody></table></div>}<div className="table-foot secret-table-foot"><span>고유 키 수와 합산하지 않아요.</span><div className="row"><button className="btn outline" disabled={page === 0} onClick={() => { const next = new URLSearchParams(params); next.set('page', String(page)); setParams(next) }}>이전</button><span>{page + 1} 페이지</span><button className="btn outline" disabled={(page + 1) * findings.data.size >= findings.data.total} onClick={() => { const next = new URLSearchParams(params); next.set('page', String(page + 2)); setParams(next) }}>다음</button></div></div></section>}
  </>
}
