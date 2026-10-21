import { severityText } from '@/lib/secretRisk'
import type { KeyLocation, SecretDetail } from '@/api/secrets'
import { scanDate } from '@/lib/secretScan'

export function SecretSourceCoordinates({ location }: { location: KeyLocation }) {
  const source = location.sourceDetails
  return <div className="secret-source-coordinates">
    {source?.status === 'AVAILABLE' ? <><strong>{source.repository ?? source.region ?? location.source}</strong>{source.branch && <span>브랜치 {source.branch}</span>}<span className="secret-source-path">{source.path ?? source.resource ?? source.label}</span>{source.line && <span>{source.line.replace(/^L/, '').replace(/-L?/, '–')}번째 줄</span>}
      {source.sourceUrl?.startsWith('https://github.com/') && <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">GitHub에서 위치 열기 ↗</a>}
    </> : <><strong>{location.safeLocationLabel}</strong><span>원본 위치를 확인할 좌표가 부족해요. 검사 대상과 최신 스캔 기록을 확인하세요.</span></>}
  </div>
}

export function SecretDiscoveryContext({ detail, locations, onSelect, visibleLocationCount, loading = false }: { detail: SecretDetail; locations: KeyLocation[]; onSelect: (id: number) => void; visibleLocationCount?: number; loading?: boolean }) {
  const metadata = detail.componentState === 'METADATA_ONLY'
  const sourceLabels: Record<string, string> = { GITHUB: 'GitHub', AWS: 'AWS', NOTION: 'Notion', KUBERNETES: 'Kubernetes' }
  const issuerRisk: Record<string, string> = { GITHUB: '저장소·조직 자료에 접근할 수 있는 인증정보예요.', AWS: 'IAM 권한으로 AWS 자원에 접근할 수 있는 인증정보예요.', NOTION: '공유된 문서에 접근할 수 있는 인증정보예요.', KUBERNETES: '클러스터에 접근할 수 있는 인증정보예요.' }
  const locationTitle = (item: KeyLocation) => { const source = item.sourceDetails; const name = source?.status === 'AVAILABLE' ? (source.path ?? source.resource ?? source.label)?.split(/[\\/]/).filter(Boolean).at(-1) : null; const line = source?.line?.replace(/^L/, '').replace(/-L?/, '–'); return name ? `${name}${line ? ` · ${line}행` : ''}` : item.safeLocationLabel || `위치 #${item.occurrenceId}` }
  const exposureText = (item: KeyLocation) => item.legacyExposureAssessment?.decision === 'ABNORMAL' && item.legacyExposureAssessment.needsReconfirmation ? '기존 노출 판단 · 최신 근거 확인' : item.exposure === 'ABNORMAL' && !item.requiresReassessment ? item.caseId ? '노출 확인 · 대응 중' : '노출 확인' : item.exposure === 'NORMAL' && !item.requiresReassessment ? '보관 허용' : item.caseId && item.caseLinkStatus === 'LINKED' ? '현재 대응 건 · 근거 확인' : '노출·보관 확인 필요'
  const groups = locations.reduce<Record<string, KeyLocation[]>>((result, item) => { (result[item.source] ??= []).push(item); return result }, {})
  return <section className="card secret-discovery-context" aria-labelledby="discovery-title">
    <div className="secret-discovery-heading"><div><h2 id="discovery-title">{metadata ? '접근키 정보의 수집 위치' : '키가 발견된 경로'}</h2><p>{metadata ? '키 존재 정보예요. 비밀 값 노출을 확인한 결과는 아니에요.' : `${issuerRisk[detail.issuer] ?? '인증정보로 보이는 값이 발견됐어요.'} 위치별 노출·권한과 조치 근거를 확인하세요.`}</p></div><span>{visibleLocationCount == null ? `발견 위치 ${locations.length}곳 (현재 조건)` : visibleLocationCount === locations.length ? `발견 위치 ${locations.length}곳 (현재 조건)` : `${visibleLocationCount}곳 중 ${locations.length}곳 표시`}</span></div>
    {locations.length ? <div className="secret-key-source-graph" aria-label="키와 발견 소스·위치의 관계"><div className="secret-key-graph-root"><span>{sourceLabels[detail.issuer] ?? detail.issuer}</span><strong>{detail.maskedLabel}</strong><small>{metadata ? '존재 정보' : detail.componentState === 'CANDIDATE' ? '키 구성 일부 발견' : '키 형식·구성 탐지'}</small><small>심각도 {severityText(detail.severity, detail.assessmentStatus)}</small></div><div className="secret-key-graph-sources">{Object.entries(groups).map(([source, items]) => <section key={source} className="secret-key-graph-branch"><div className="secret-key-graph-source"><strong>{sourceLabels[source] ?? '발견 소스'}</strong><span>위치 {items.length}곳</span></div><div className="secret-key-graph-locations">{items.slice(0, 3).map((location) => <button key={location.occurrenceId} onClick={() => onSelect(location.occurrenceId)}><strong>{locationTitle(location)}</strong><span>{location.sourceDetails?.status === 'AVAILABLE' ? [location.sourceDetails.repository ?? location.sourceDetails.region, location.sourceDetails.branch].filter(Boolean).join(' · ') : '원본 좌표 확인 필요'}</span><small>{exposureText(location)} · 위치·조치 보기 →</small></button>)}{items.length > 3 && <a href="#key-location-title">나머지 {items.length - 3}곳은 아래 위치표에서 확인 ↓</a>}</div></section>)}</div></div> : <p className="caption">{loading ? '발견 위치를 불러오는 중이에요.' : '현재 조건에서 표시할 발견 위치가 없어요. 아래 필터와 조회 상태를 확인하세요.'}</p>}
    <p className="caption">현재 출처·필터의 발견 위치예요. 키 원문과 파일 내용은 표시하지 않아요.</p>
  </section>
}
