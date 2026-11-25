import { scanDate } from '@/lib/secretScan'
import type { RemediationSummary } from '@/api/secrets'
import './secret-remediation-summary.css'
export function validRemediationSummary(data?: RemediationSummary | null): data is RemediationSummary {
  if (!data) return false
  const values = [data.requiredLocationCount, data.presentLocationCount, data.postActionMissingLocationCount, data.unknownLocationCount, data.approvedStorageLocationCount, data.metadataLocationCount, data.visibleLocationCount, data.postActionRedetectedCount]
  return values.every((value) => Number.isSafeInteger(value) && value >= 0) && data.requiredLocationCount === data.presentLocationCount + data.postActionMissingLocationCount + data.unknownLocationCount && data.requiredLocationCount <= data.visibleLocationCount && data.postActionRedetectedCount <= data.presentLocationCount
}
export function SecretRemediationSummary({ data, onSelect }: { data?: RemediationSummary | null; onSelect?: (presence: 'PRESENT' | 'MISSING' | 'UNKNOWN') => void }) {
  if (!validRemediationSummary(data)) return <section className="card secret-remediation-summary"><h2>조치 대상 위치</h2><p>현재 근거를 집계하지 못했어요. 위치별 근거를 확인하세요.</p></section>
  const total = data.requiredLocationCount
  const cards = [{ key: 'present', presence: 'PRESENT' as const, label: '조치 대상에서 발견', value: data.presentLocationCount }, { key: 'missing', presence: 'MISSING' as const, label: '조치 후 미발견', value: data.postActionMissingLocationCount }, { key: 'unknown', presence: 'UNKNOWN' as const, label: '현재 확인 불가', value: data.unknownLocationCount }]
  return <section className="card secret-remediation-summary" aria-label="필수 대응 위치의 현재 근거"><div className="secret-remediation-heading"><h2>조치 대상 위치</h2><span>필수 대응 {total}곳</span></div>
    {total ? <div className="secret-remediation-bar" role="img" aria-label={cards.map((card) => `${card.label} ${card.value}곳`).join(', ')}>{cards.filter((card) => card.value > 0).map((card) => <span key={card.key} className={card.key} style={{ width: `${card.value / total * 100}%` }} />)}</div> : <p>현재 대응에 연결된 필수 조치 대상은 0곳이에요. 전체 발견 위치와 검토 상태는 위치 목록에서 확인하세요.</p>}
    <div className="secret-remediation-counts">{cards.map((card) => onSelect
      ? <button key={card.key} type="button" className={card.key} onClick={() => onSelect(card.presence)}><span>{card.label}</span><strong>{card.value}<small>곳</small></strong></button>
      : <div key={card.key} className={card.key}><span>{card.label}</span><strong>{card.value}<small>곳</small></strong></div>)}</div>
    {data.postActionRedetectedCount > 0 && <p className="secret-redetected">조치 후 다시 발견된 위치 {data.postActionRedetectedCount}곳</p>}
    <div className="secret-remediation-context"><span>승인 보관 {data.approvedStorageLocationCount}곳</span><span>메타데이터 {data.metadataLocationCount}곳</span><span>조회 위치 {data.visibleLocationCount}곳</span></div><p className="caption">{data.restrictedCoverage ? '열람 가능한 위치 기준 · ' : ''}현재 출처 · 근거 {scanDate(data.evidenceObservedAt)} · 미발견은 키 폐기 확인과 별개예요.</p>
  </section>
}
