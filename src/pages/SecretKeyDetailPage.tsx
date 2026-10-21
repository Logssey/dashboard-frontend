import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { fetchKeyLocations, fetchSecretDetail, type KeyLocation, type KeyLocationsResponse, type SecretDetail } from '@/api/secrets'
import { SecretRemediationSummary } from '@/components/SecretRemediationSummary'
import { SecretTaskGuidance } from '@/components/SecretTaskGuidance'
import { SecretDetailPanel } from '@/components/SecretDetailPanel'
import { SecretDiscoveryContext, SecretSourceCoordinates } from '@/components/SecretDiscoveryContext'
import { Badge } from '@/components/Badge'
import { componentStateLabel, credentialTypeLabel, issuerLabel, secretEnvironmentLabel, secretValidationLabel, secretValidationReasonLabel } from '@/lib/labels'
import { actionLabels, exposureLabels, inventoryOptions, inventoryReturnPath, parseLocationFilters, presenceLabels, whyLabel } from '@/lib/secretInventory'
import { positiveId, scanDate, scanReason } from '@/lib/secretScan'
import './secret-inventory.css'
import './secret-scan.css'

function hasCurrentCoverage(coverage: KeyLocation['coverage'] | undefined): boolean {
  return !!coverage?.lastSuccessfulScan && Array.isArray(coverage.gapReasonCodes) && coverage.gapReasonCodes.length === 0
}

function CheckEvidence({ label, check }: { label: string; check: { status: string; reasonCode: string | null; verificationLevel?: string; coverageLimit?: string } | undefined }) {
  const result = check?.status !== 'PASSED' ? check?.status === 'BLOCKED' ? '조건 미충족' : '근거 확인 필요' : check.coverageLimit === 'SIMULATION' ? '합성 표본 종료 근거' : check.verificationLevel === 'APPROVED_MANUAL' ? '수동 승인 근거 · 제한 확인' : check.verificationLevel === 'PROVIDER_VERIFIED' ? '공급자 상태 확인' : '근거 확인'
  return <div><dt>{label}</dt><dd>{result}</dd></div>
}

function LocationEvidence({ location, credentialSetId }: { location: KeyLocation; credentialSetId: number }) {
  return <div className="secret-location-evidence" aria-label={`${location.safeLocationLabel} 근거`}>
    <div className="secret-location-source"><h3>발견 위치</h3><SecretSourceCoordinates location={location} /><h3>탐지한 규칙</h3>{location.detectionEvidence?.length ? <ul>{location.detectionEvidence.map((item, index) => <li key={`${item.runId}:${item.ruleId}:${index}`}><strong>{item.ruleId}</strong><p className="caption">{scanDate(item.detectedAt)} · SCAN-{item.runId}</p></li>)}</ul> : <p className="caption">상세 탐지 규칙 기록 없음 · 최신 스캔에서 다시 확인하세요.</p>}</div>
    <div><h3>확인된 사실</h3><dl className="secret-location-facts"><div><dt>마지막 위치 검사</dt><dd>{presenceLabels[location.presence] ?? '현재 확인 불가'}</dd></div><div><dt>노출 판단</dt><dd>{exposureLabels[location.exposure] ?? '노출 미확인'}</dd></div><div><dt>보관 정책</dt><dd>{location.storagePolicy?.result === 'ALLOWED' ? '보관 허용 근거 있음' : location.storagePolicy?.result === 'DENIED' ? '보관 정책 위반' : '정책 근거 확인 필요'}</dd></div><div><dt>유효성</dt><dd>{secretValidationLabel(location.validity?.result ?? 'UNKNOWN')} · {secretValidationReasonLabel(location.validity?.reasonCode ?? 'NO_VERIFICATION_ATTEMPT')}</dd></div><div><dt>공급자 확인 시각</dt><dd>{scanDate(location.validity?.providerCheckedAt)}</dd></div><div><dt>담당자</dt><dd>{location.assignedUserId != null ? `사용자 #${location.assignedUserId}` : '담당 미지정'}</dd></div></dl></div>
    <div>{location.validity?.lastObservation && <details className="secret-scan-technical"><summary>이전 유효성 관측</summary><p>{secretValidationLabel(location.validity.lastObservation.result)} · {scanDate(location.validity.lastObservation.providerCheckedAt ?? location.validity.lastObservation.observedAt)}</p><p className="caption">현재 유효성의 결론으로 재사용하지 않아요.</p></details>}<h3>해결에 필요한 근거</h3><dl className="secret-location-facts"><CheckEvidence label="조치 후 위치 미발견" check={location.locationAbsenceCheck} /><CheckEvidence label="키 교체·폐기" check={location.credentialLifecycleCheck} /><CheckEvidence label="검사 범위" check={location.coverageCheck} /></dl><p className="caption">미발견과 체크 완료만으로 키 폐기·해결을 확정하지 않아요.</p></div>
    <div><h3>검사의 확인 범위</h3><p>{hasCurrentCoverage(location.coverage) ? '기록된 승인 범위 확인' : '현재 승인 범위 확인 필요'}</p><dl className="secret-location-facts"><div><dt>최근 검사 시도</dt><dd>{scanDate(location.coverage?.lastAttempt?.requestedAt)}</dd></div><div><dt>마지막 검사 성공</dt><dd>{scanDate(location.coverage?.lastSuccessfulScan?.finishedAt)}</dd></div><div><dt>검사 누락</dt><dd>{location.coverage?.gapReasonCodes?.length ? location.coverage.gapReasonCodes.map(scanReason).join(' · ') : location.coverage?.lastSuccessfulScan && Array.isArray(location.coverage.gapReasonCodes) ? '확인된 누락 없음' : '현재 범위 확인 전'}</dd></div></dl><p className="caption">승인 범위 #{location.scopeId} · 버전 {location.scopeRevision ?? '미기록'}</p><p className="caption">처음 발견 {scanDate(location.firstSeenAt)}<br />최근 발견 {scanDate(location.lastSeenAt)}</p>{location.origin === 'TEST' && <p className="notice">{location.fixtureStatus === 'VERIFIED_SYNTHETIC' ? '합성 근거 확인' : '합성 데이터 여부 미확인'} · 시험 출처만으로 실제 키가 아니라고 판단하지 않아요.</p>}
      {location.capabilities?.canViewCoverage && <Link className="btn outline" to={`/secrets/connections/${location.connectionId}/scopes/${location.scopeId}`}>승인 범위 확인</Link>}
      {location.capabilities?.canReview && <Link className="btn primary" to={`/secrets/triage/${credentialSetId}?occurrence=${location.occurrenceId}`}>보관·노출 판단</Link>}
      {location.capabilities?.canViewCase && location.caseId && <Link className="btn outline" to={`/secrets/cases/${location.caseId}?origin=${location.origin}&occurrence=${location.occurrenceId}`}>현재 대응 건</Link>}
    </div>
  </div>
}

function PresenceSummary({ data }: { data: KeyLocationsResponse }) {
  const counts = data.locationStateCounts?.presence
  const states = ['PRESENT', 'MISSING', 'UNKNOWN']
  const complete = counts && states.reduce((sum, key) => sum + (counts[key] ?? 0), 0) === data.visibleLocationCount
  return <p className="caption" aria-label="조회 조건에 맞는 위치의 마지막 검사 결과">마지막 검사 결과 · {states.map((state) => `${presenceLabels[state]} ${complete ? counts[state] ?? 0 : '—'}곳`).join(' · ')}</p>
}

function KeyInfo({ detail }: { detail: SecretDetail }) {
  return <section className="card secret-scan-section"><h2>키 정보</h2><dl className="secret-scan-facts"><div><dt>발급자</dt><dd>{issuerLabel[detail.issuer] ?? '미확인'}</dd></div><div><dt>키 유형</dt><dd>{credentialTypeLabel(detail.credentialType)}</dd></div><div><dt>구성</dt><dd>{componentStateLabel[detail.componentState]}</dd></div><div><dt>심각도</dt><dd>{inventoryOptions.severity[detail.severity as keyof typeof inventoryOptions.severity] ?? '미평가'}</dd></div><div><dt>첫 발견</dt><dd>{scanDate(detail.firstSeenAt)}</dd></div><div><dt>최근 발견</dt><dd>{scanDate(detail.lastSeenAt)}</dd></div><div><dt>만료 시각</dt><dd>{detail.expiresAt ? scanDate(detail.expiresAt) : '미확인'}</dd></div><div><dt>키 수명주기</dt><dd>{detail.lifecycleStatus === 'REVOKED' ? '폐기 확인' : detail.lifecycleStatus === 'ROTATED' ? '교체 확인' : '근거 확인 필요'}</dd></div></dl>
    {detail.iamMetadata && <><h3 className="secret-key-info-subtitle">IAM 메타데이터</h3><dl className="secret-scan-facts"><div><dt>기록된 키 상태</dt><dd>{{ ACTIVE: '활성', INACTIVE: '비활성', EXPIRED: '만료', UNKNOWN: '미확인' }[detail.iamMetadata.keyStatus] ?? '미확인'}</dd></div><div><dt>발급</dt><dd>{scanDate(detail.iamMetadata.issuedAt)}</dd></div><div><dt>최근 사용</dt><dd>{scanDate(detail.iamMetadata.lastUsedAt)}</dd></div><div><dt>관측</dt><dd>{scanDate(detail.iamMetadata.observedAt)}</dd></div></dl><p className="notice">접근키의 존재 정보예요. 비밀 값 노출이나 현재 유효성을 확인한 결과는 아니에요.</p></>}
  </section>
}

export function SecretKeyDetailPage() {
  const { secretId: rawId } = useParams()
  const secretId = positiveId(rawId)
  const [params, setParams] = useSearchParams()
  const { filters, errors } = parseLocationFilters(params)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const detail = useQuery({ queryKey: ['secret-detail', secretId, filters.origin], queryFn: () => fetchSecretDetail(secretId!, filters.origin), enabled: secretId != null && !errors.length,
    retry: (count, error) => !(error instanceof ApiError && [403, 404].includes(error.status)) && count < 1,
    refetchOnWindowFocus: false,
  })
  const locations = useQuery({ queryKey: ['secret-key-locations', secretId, filters, refreshVersion], queryFn: () => fetchKeyLocations(secretId!, filters), enabled: secretId != null && !errors.length,
    retry: (count, error) => !(error instanceof ApiError && [400, 403, 404, 409].includes(error.status)) && count < 1,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
  })
  useEffect(() => { heading.current?.focus(); window.scrollTo({ top: 0 }) }, [secretId])
  useEffect(() => {
    if (locations.data?.detailVersion && !filters.expectedDetailVersion) { const next = new URLSearchParams(params); next.set('detailVersion', locations.data.detailVersion); setParams(next, { replace: true }) }
  }, [locations.data?.detailVersion, filters.expectedDetailVersion, params, setParams])
  const change = (key: string, value: string) => { const next = new URLSearchParams(params); next.set(key, value); next.delete('detailVersion'); next.delete('occurrence'); next.set('locationPage', '1'); setParams(next) }
  const refresh = () => { const next = new URLSearchParams(params); next.delete('detailVersion'); next.set('locationPage', '1'); setRefreshVersion((version) => version + 1); setParams(next); void detail.refetch() }
  const selected = positiveId(params.get('occurrence'))
  const select = (id: number) => { const next = new URLSearchParams(params); if (selected === id) next.delete('occurrence'); else next.set('occurrence', String(id)); setParams(next) }
  const selectedLocation = locations.isSuccess ? locations.data.items.find((location) => location.occurrenceId === selected) : undefined
  const error = detail.error
  const data = locations.data
  const displayDetail = detail.isSuccess ? detail.data : undefined
  const activeTab = params.get('tab') === 'info' ? 'info' : 'locations'
  return <>
    <Link className="secret-scan-back" to={inventoryReturnPath(params, secretId)}>← 키·노출 위치로 돌아가기</Link>
    <section className="page-head"><div><h1 ref={heading} tabIndex={-1}>{displayDetail?.maskedLabel || (secretId ? `키 #${secretId}` : '키 상세')}</h1><p className="subtitle">같은 키의 열람 가능한 위치를 비교하세요.</p></div><button className="btn outline" onClick={refresh} disabled={!secretId || detail.isFetching || locations.isFetching}>새로고침</button></section>
    {!secretId || errors.length ? <div className="card secret-scan-message" role="alert">키 주소 또는 위치 조회 조건이 올바르지 않아요.</div> : detail.isPending ? <p className="card secret-scan-message" role="status">키 정보를 불러오는 중이에요.</p> : detail.isError ? <div className="card secret-scan-message" role="alert"><h2>{error instanceof ApiError && error.status === 403 ? '키를 조회할 권한이 없어요' : error instanceof ApiError && error.status === 404 ? '키를 찾을 수 없어요' : '키 정보를 불러오지 못했어요'}</h2><p>허용된 탐지 목록으로 돌아가거나 다시 조회해 주세요.</p>{!(error instanceof ApiError && [403, 404].includes(error.status)) && <button className="btn outline" onClick={() => void detail.refetch()}>다시 조회</button>}</div> : <>
      <section className="card secret-key-summary"><div className="row"><Badge label={issuerLabel[detail.data.issuer] ?? '발급자 미확인'} /><Badge label={componentStateLabel[detail.data.componentState]} /><Badge label={inventoryOptions.origin[filters.origin]} /></div><dl className="secret-scan-facts"><div><dt>키 유형</dt><dd>{credentialTypeLabel(detail.data.credentialType)}</dd></div><div><dt>최신 검증</dt><dd>{secretValidationLabel(detail.data.validationStatus)}</dd></div><div><dt>검증 근거</dt><dd>{secretValidationReasonLabel(detail.data.validationReasonCode ?? 'NO_VERIFICATION_ATTEMPT')}</dd></div><div><dt>검증 시각</dt><dd>{scanDate(detail.data.validatedAt)}</dd></div></dl><p className="caption">상세는 현재 상태예요. 목록의 조회 기준과 다를 수 있어요.</p></section>
      {(data?.restrictedCoverage || detail.data.restrictedCoverage) && <p className="notice secret-inventory-origin">열람 가능한 위치 기준이에요. 이 화면만으로 전체 범위의 해결 여부를 판단할 수 없어요.</p>}
      {filters.origin === 'TEST' && <p className="notice secret-inventory-origin">시험 출처예요. 실제 키 여부와 합성 데이터 증빙은 별도로 확인해야 해요.</p>}
      <SecretDiscoveryContext detail={detail.data} locations={locations.isSuccess ? locations.data.items : []} onSelect={select} />
      <SecretRemediationSummary data={locations.isSuccess ? locations.data.credential.remediationSummary : detail.data.remediationSummary} />
      <SecretTaskGuidance guidance={detail.data.taskGuidance} />
      <nav className="secret-key-tabs" aria-label="키 상세 보기"><button className={activeTab === 'locations' ? 'active' : ''} aria-current={activeTab === 'locations' ? 'page' : undefined} onClick={() => { const next = new URLSearchParams(params); next.delete('tab'); setParams(next) }}>발견 위치</button><button className={activeTab === 'info' ? 'active' : ''} aria-current={activeTab === 'info' ? 'page' : undefined} onClick={() => { const next = new URLSearchParams(params); next.set('tab', 'info'); setParams(next) }}>키 정보</button></nav>
      {activeTab === 'info' ? <KeyInfo detail={detail.data} /> : <section className="card secret-scan-section" aria-labelledby="key-location-title"><h2 id="key-location-title">키와 발견 위치</h2><p className="caption">키 하나에 연결된 위치별 사실이에요. 마지막 발견 기록과 현재 확인 가능 여부를 구분하세요. 노출 판단·키 유효성은 별도예요.</p>
        <div className="secret-inventory-more secret-location-filters">{([['source', '발견 소스', inventoryOptions.source], ['environment', '환경', inventoryOptions.environment], ['presence', '마지막 위치 검사', { ALL: '전체 검사 결과', ...presenceLabels }], ['exposure', '노출 판단', { ALL: '전체 노출 판단', ...exposureLabels }], ['actionStatus', '조치', { ALL: '전체 조치 상태', ...actionLabels }]] as const).map(([key, label, values]) => <label key={key}>{label}<select className="select" value={filters[key]} onChange={(e) => change(key, e.target.value)}>{Object.entries(values).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>)}</div>
        {locations.isPending ? <p className="secret-scan-message" role="status">위치별 근거를 불러오는 중이에요.</p> : locations.isError ? <div className="secret-scan-message notice error" role="alert"><p>{locations.error instanceof ApiError && locations.error.status === 409 ? '위치 정보가 바뀌었어요. 최신 기준으로 다시 확인해 주세요.' : locations.error instanceof ApiError && locations.error.status === 403 ? '발견 위치를 열람할 권한이 없어요.' : '위치 근거를 불러오지 못했어요. 결과 없음으로 판단하지 않아요.'}</p><button className="btn outline" onClick={refresh}>현재 위치 다시 조회</button></div> : <>
          {locations.data.sourceGroups && <div className="secret-source-map" aria-label="현재 위치 필터의 소스별 분포">{locations.data.sourceGroups.map((group) => <div key={group.source}><strong>{issuerLabel[group.source as keyof typeof issuerLabel] ?? '소스 미확인'}</strong><span>{group.scopeCount}개 범위 · {group.locationCount}곳</span><span>마지막 결과 · 발견 {group.presenceCounts.PRESENT ?? 0} · 미발견 {group.presenceCounts.MISSING ?? 0} · 미확인 {group.presenceCounts.UNKNOWN ?? 0}</span></div>)}</div>}<PresenceSummary data={locations.data} /><p className="caption">조회 시각 {scanDate(locations.data.readAt)} · 검사 누락이 있으면 현재 존재 여부는 확인할 수 없어요.</p>
          {!locations.data.items.length ? <p className="secret-scan-message">조건에 맞는 열람 위치가 없어요. 다른 위치의 상태는 이 결과로 판단하지 않아요.</p> : <div className="table-scroll" tabIndex={0} role="region" aria-label="키별 발견 위치 비교"><table className="secret-location-table"><thead><tr><th scope="col">발견 위치</th><th scope="col">마지막 위치 검사</th><th scope="col">노출·보관</th><th scope="col">유효성</th><th scope="col">조치</th><th scope="col">최근 발견</th><th scope="col">다음 행동</th></tr></thead><tbody>{locations.data.items.map((location) => <LocationRows key={location.occurrenceId} credentialSetId={secretId!} location={location} expanded={selected === location.occurrenceId} onSelect={() => select(location.occurrenceId)} />)}</tbody></table></div>}
          <div className="table-foot secret-table-foot"><span>조회 가능한 {locations.data.visibleLocationCount}곳 중 {locations.data.items.length}곳 표시 · 위치 필터 기준</span><div className="row"><button className="btn outline" disabled={filters.page === 0} onClick={() => { const next = new URLSearchParams(params); next.set('locationPage', String(filters.page)); setParams(next) }}>이전</button><span>{filters.page + 1} / {Math.max(1, Math.ceil(locations.data.total / filters.size))}</span><button className="btn outline" disabled={(filters.page + 1) * filters.size >= locations.data.total} onClick={() => { const next = new URLSearchParams(params); next.set('locationPage', String(filters.page + 2)); setParams(next) }}>다음</button></div></div>
        </>}
      </section>}
      {selected && locations.isSuccess && !selectedLocation && <p className="notice">선택한 위치가 현재 필터·페이지에 없어요. 목록에서 위치를 다시 선택하세요.</p>}
      <SecretDetailPanel open={!!selectedLocation} title={selectedLocation?.safeLocationLabel ?? '위치 근거'} onClose={() => { const next = new URLSearchParams(params); next.delete('occurrence'); setParams(next) }}>{selectedLocation && <><SecretTaskGuidance guidance={selectedLocation.taskGuidance} /><LocationEvidence location={selectedLocation} credentialSetId={secretId!} /></>}</SecretDetailPanel>
    </>}
  </>
}

function LocationRows({ location, expanded, onSelect }: { location: KeyLocation; credentialSetId: number; expanded: boolean; onSelect: () => void }) {
  return <><tr className={expanded ? 'selected' : ''}><td><button className="finding-link" aria-expanded={expanded} aria-haspopup="dialog" onClick={onSelect}>{location.safeLocationLabel || `위치 #${location.occurrenceId}`}</button><span className="asset">{issuerLabel[location.source] ?? '소스 미확인'} · {secretEnvironmentLabel[location.environment] ?? '환경 미확인'}</span><span className="asset">{whyLabel(location.whyHereCode)}</span></td><td><span className={`secret-location-status ${location.presence.toLowerCase()}`}>{presenceLabels[location.presence] ?? '현재 확인 불가'}</span>{!hasCurrentCoverage(location.coverage) && <span className="asset">현재 존재 확인 불가 · 검사 범위 확인 필요</span>}</td><td><Badge label={exposureLabels[location.exposure] ?? '노출 미확인'} /><span className="asset">{location.storagePolicy?.result === 'ALLOWED' ? '정책상 허용' : '보관 근거 확인 필요'}</span></td><td>{secretValidationLabel(location.validity?.result ?? 'UNKNOWN')}<span className="asset">{scanDate(location.validity?.observedAt)}</span></td><td>{location.actionStatus ? actionLabels[location.actionStatus] ?? '상태 확인 필요' : location.caseLinkStatus === 'NEEDS_CASE_LINK' ? '건 연결 필요' : '대응 건 없음'}{location.capabilities?.canViewCase && location.caseId && <span className="asset"><Link to={`/secrets/cases/${location.caseId}?origin=${location.origin}&occurrence=${location.occurrenceId}`}>CASE-{location.caseId}</Link></span>}</td><td>{scanDate(location.lastSeenAt)}</td><td><button className="secret-history-detail-button" onClick={onSelect} aria-expanded={expanded}>{expanded ? '선택된 위치' : '위치 근거'}</button></td></tr></>

}
