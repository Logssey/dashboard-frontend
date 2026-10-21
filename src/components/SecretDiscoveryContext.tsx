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

export function SecretDiscoveryContext({ detail, locations, onSelect }: { detail: SecretDetail; locations: KeyLocation[]; onSelect: (id: number) => void }) {
  const metadata = detail.componentState === 'METADATA_ONLY'
  const issuerRisk: Record<string, string> = {
    GITHUB: '유효한 토큰을 다른 사람이 얻으면 부여된 권한으로 저장소나 조직 자료에 접근할 수 있어요.',
    AWS: '유효한 키 구성을 다른 사람이 얻으면 해당 IAM 권한으로 AWS 자원에 접근할 수 있어요.',
    NOTION: '유효한 토큰을 다른 사람이 얻으면 연결에 공유된 문서를 읽거나 변경할 수 있어요.',
    KUBERNETES: '유효한 인증정보를 다른 사람이 얻으면 부여된 권한으로 클러스터에 접근할 수 있어요.',
  }
  return <section className="card secret-discovery-context" aria-labelledby="discovery-title">
    <h2 id="discovery-title">{metadata ? '어떤 정보를 발견했나요?' : '왜 확인해야 하나요?'}</h2>
    <p>{metadata ? '접근키의 존재 정보만 수집했어요. 비밀 값이 노출됐다는 뜻은 아니에요.' : issuerRisk[detail.issuer] ?? '인증정보로 보이는 값이 발견됐어요. 접근 가능한 사람과 실제 사용 가능 여부를 확인해야 해요.'}</p>
    <div className="secret-discovery-facts"><span>{metadata ? '키 값 탐지 아님' : detail.componentState === 'CANDIDATE' ? '키 구성 일부만 발견' : '키 형식·구성 탐지'}</span><span>{detail.validationStatus === 'VALID' ? '공급자 검증에서 유효 확인' : detail.validationStatus === 'INVALID' ? '공급자 검증에서 무효 확인' : '현재 사용 가능 여부 미확인'}</span><span>심각도 {severityText(detail.severity, detail.assessmentStatus)}</span></div>
    {!metadata && <p className="caption">탐지는 위험을 확인할 단서예요. 실제 노출 여부·권한·유효성을 함께 확인하며, 형식만으로 침해를 단정하지 않아요.</p>}
    <h3>어디서 발견됐나요?</h3>
    {locations.length ? <div className="secret-discovery-locations">{locations.map((location) => <article key={location.occurrenceId}><SecretSourceCoordinates location={location} /><p className="caption">최근 발견 {scanDate(location.lastSeenAt)} · {location.exposure === 'ABNORMAL' && !location.requiresReassessment ? '노출 확인' : location.exposure === 'NORMAL' && !location.requiresReassessment ? '보관 허용 판정' : '노출·보관 여부 확인 필요'}</p><button className="btn outline" onClick={() => onSelect(location.occurrenceId)}>탐지 이유·검증 상세</button></article>)}</div> : <p className="caption">발견 위치를 불러오는 중이거나 현재 조회 조건에 맞는 위치가 없어요.</p>}
    <p className="caption">현재 위치 조회 조건의 기록이에요. 키 원문과 파일 내용은 표시하지 않아요.</p>
  </section>
}
