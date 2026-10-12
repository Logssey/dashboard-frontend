import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type CredentialFilter, fetchCredentials, scanCredentials } from '@/api/credentials'
import type { CredentialItem, ScanResult } from '@/api/types'
import { Badge } from '@/components/Badge'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { MetricCard } from '@/components/MetricCard'
import { PageHeader } from '@/components/PageHeader'
import {
  credentialStatusLabel,
  credentialTypeLabel,
  issuerLabel,
  severityLabel,
  severityTone,
} from '@/lib/labels'

const koreaDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' })

/** ISO 시각 → 한국 시간 기준 YYYY-MM-DD */
function formatDate(iso: string): string {
  return koreaDate.format(new Date(iso))
}

function expiryText(item: CredentialItem): string {
  if (item.expiryPolicy === 'NEVER') return '만료 없음'
  if (item.expiryPolicy === 'UNKNOWN' || !item.expiresAt) return '미확인'
  return formatDate(item.expiresAt)
}

const issuerOptions: Array<[CredentialFilter['issuer'], string]> = [
  ['ALL', '모든 발급자'],
  ['NOTION', issuerLabel.NOTION],
  ['AWS', issuerLabel.AWS],
  ['GITHUB', issuerLabel.GITHUB],
]

const statusOptions: Array<[CredentialFilter['status'], string]> = [
  ['ALL', '모든 상태'],
  ['ACTIVE', credentialStatusLabel.ACTIVE],
  ['INACTIVE', credentialStatusLabel.INACTIVE],
  ['EXPIRED', credentialStatusLabel.EXPIRED],
  ['REVOKED', credentialStatusLabel.REVOKED],
  ['UNKNOWN', credentialStatusLabel.UNKNOWN],
]

/** 시크릿 보안 (02 기능 설계 4). 계산은 모두 백엔드가 하고 화면은 받은 값을 보여주기만 한다 */
export function SecretsPage() {
  const [filter, setFilter] = useState<CredentialFilter>({ issuer: 'ALL', status: 'ALL', riskOnly: false })

  const credentials = useQuery({
    queryKey: ['credentials', filter],
    queryFn: () => fetchCredentials(filter),
    placeholderData: keepPreviousData,
  })
  const summary = credentials.data?.summary
  const items = credentials.data?.items ?? []

  // "지금 스캔": 끝나면 키 목록과 통합 현황을 다시 불러온다
  const queryClient = useQueryClient()
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const scan = useMutation({
    mutationFn: scanCredentials,
    onSuccess: (result) => {
      setScanResult(result)
      void queryClient.invalidateQueries({ queryKey: ['credentials'] })
      void queryClient.invalidateQueries({ queryKey: ['overview'] })
    },
    onError: () => setScanResult(null),
  })

  return (
    <>
      <PageHeader
        title="시크릿 보안"
        description="노출 가능성이 있는 인증정보와 사용처를 확인하세요."
        actions={
          <button className="btn primary" onClick={() => scan.mutate()} disabled={scan.isPending}>
            <Icon name="search" />
            {scan.isPending ? '스캔 중…' : '지금 스캔'}
          </button>
        }
      />
      <div className="scope-bar">
        <span className="caption">스캔 대상: 수집기에 연결된 Notion 페이지</span>
        <span className="caption">샘플 데이터 + Notion 테스트 페이지</span>
      </div>
      {scan.isError && <p className="notice error page-notice">스캔을 요청하지 못했어요. 로그인 상태를 확인해 주세요.</p>}
      {scanResult && (
        <p className={`notice page-notice ${scanResult.status === 'COMPLETED' ? '' : 'error'}`.trim()} role="status">
          {scanResult.message}
        </p>
      )}

      <div className="stack">
        <div className="metric-grid">
          <MetricCard label="전체 키" value={summary?.totalCount ?? '—'} unit="개" description="수집·등록된 모든 키" />
          <MetricCard label="위험 있는 키" value={summary?.atRiskCount ?? '—'} unit="개" description="탐지가 하나 이상 있는 키" />
          <MetricCard label="만료 임박" value={summary?.expiringSoonCount ?? '—'} unit="개" description="만료까지 7일 이내" />
        </div>

        <section className="card list-card">
          <div className="card-head">
            <h2>키 목록</h2>
            <span className="caption">위험 높은 순</span>
          </div>
          <div className="toolbar">
            <div className="row">
              <select
                className="select"
                aria-label="발급자"
                value={filter.issuer}
                onChange={(event) => setFilter({ ...filter, issuer: event.target.value as CredentialFilter['issuer'] })}
              >
                {issuerOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                className="select"
                aria-label="상태"
                value={filter.status}
                onChange={(event) => setFilter({ ...filter, status: event.target.value as CredentialFilter['status'] })}
              >
                {statusOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={filter.riskOnly}
                onChange={(event) => setFilter({ ...filter, riskOnly: event.target.checked })}
              />
              위험 있는 키만
            </label>
          </div>

          {credentials.isPending ? (
            <div style={{ padding: '0 28px' }}>
              <div className="skeleton" />
            </div>
          ) : credentials.isError ? (
            <div style={{ padding: '0 28px 20px' }}>
              <p className="notice error">데이터를 불러오지 못했어요.</p>
            </div>
          ) : items.length ? (
            <CredentialTable items={items} />
          ) : (
            <EmptyState title="조건에 맞는 키가 없어요" description="필터를 바꿔 보세요." />
          )}
          <div className="table-foot" role="status">
            {items.length}개 키 · 키 원문은 저장하지 않아요.
          </div>
        </section>
      </div>
    </>
  )
}

function CredentialTable({ items }: { items: CredentialItem[] }) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="키 목록 표. 좁은 화면에서는 가로로 스크롤하세요.">
      <table>
        <thead>
          <tr>
            <th scope="col">위험</th>
            <th scope="col">키</th>
            <th scope="col">상태</th>
            <th scope="col">만료일</th>
            <th scope="col">마지막 사용</th>
            <th scope="col">소유자</th>
            <th scope="col">위험 내용</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const topRisk = item.risks[0]
            return (
              <tr key={item.credentialId}>
                <td>
                  {topRisk && (
                    <span className="row risk-cell">
                      <Badge label={severityLabel[topRisk.severity]} tone={severityTone[topRisk.severity]} />
                      {item.risks.length > 1 && <span className="caption">+{item.risks.length - 1}</span>}
                    </span>
                  )}
                </td>
                <td>
                  <strong className="key-name">{item.displayName ?? item.externalId ?? '이름 없음'}</strong>
                  <span className="asset">
                    {issuerLabel[item.issuer]} · {credentialTypeLabel(item.credentialType)}
                  </span>
                </td>
                <td>{credentialStatusLabel[item.status]}</td>
                <td>{expiryText(item)}</td>
                <td>{item.lastUsedAt ? formatDate(item.lastUsedAt) : '사용 기록 없음'}</td>
                <td>
                  {item.owner ?? '미확인'}
                  <span className="asset">{item.ownerTeam ?? '미지정'}</span>
                </td>
                <td className="muted">{topRisk?.title ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
