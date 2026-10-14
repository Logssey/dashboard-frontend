import { useQuery } from '@tanstack/react-query'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { fetchSecretConnections, fetchSecrets } from '@/api/secrets'
import { Icon } from '@/components/Icon'
import { PageHeader } from '@/components/PageHeader'

const actionStages = [
  { number: '01', label: '신규 및 분석', color: 'blue' },
  { number: '02', label: '조치 중', color: 'violet' },
  { number: '03', label: '재검증 대기', color: 'amber' },
  { number: '04', label: '해결', color: 'green' },
] as const

export function SecretOverviewPage() {
  const [searchParams] = useSearchParams()
  const legacyRun = searchParams.get('run')
  const inventory = useQuery({
    queryKey: ['secret-overview-inventory'],
    queryFn: () => fetchSecrets({ page: 0, size: 1, issuer: 'ALL', componentState: 'ALL' }),
  })
  const connections = useQuery({ queryKey: ['secret-connections'], queryFn: fetchSecretConnections })

  if (legacyRun && /^\d+$/.test(legacyRun)) return <Navigate to={`/secrets/history?run=${legacyRun}`} replace />

  return (
    <>
      <PageHeader title="시크릿 현황" description="탐지 기록과 수집 연결을 살펴보고, 검사 이력에서 누락된 범위를 확인하세요." actions={
        <Link className="btn primary" to="/secrets/findings"><Icon name="list" />탐지 목록 보기</Link>
      } />
      {(inventory.isError || connections.isError) && (
        <p className="notice error page-notice" role="alert">현황 일부를 불러오지 못했어요. 관리자 권한과 연결 상태를 확인해 주세요.</p>
      )}

      <div className="secret-overview-metrics">
        <Link className="card secret-overview-metric" to="/secrets/findings">
          <span className="caption">키·메타데이터 기록</span>
          <strong>{inventory.isSuccess ? inventory.data.total : '—'}<small>개</small></strong>
          <span className="caption">현재 저장된 탐지 기록</span>
        </Link>
        <Link className="card secret-overview-metric" to="/secrets/connections">
          <span className="caption">활성 수집 연결</span>
          <strong>{connections.isSuccess ? connections.data.items.length : '—'}<small>개</small></strong>
          <span className="caption">승인 범위가 있는 GitHub·AWS 연결</span>
        </Link>
        <Link className="card secret-overview-metric secret-overview-link" to="/secrets/history">
          <span className="caption">스캔 이력</span>
          <strong><Icon name="clock" /></strong>
          <span className="caption">실행 시각과 부분 실패 확인 <Icon name="chevron" /></span>
        </Link>
      </div>

      <section className="card secret-progress" aria-labelledby="secret-progress-title">
        <div className="secret-progress-heading">
          <h2 id="secret-progress-title">조치가 어디까지 진행됐나요?</h2>
          <p className="caption">대응 건의 진행 단계를 보여주는 자리예요.</p>
        </div>
        <ol className="secret-progress-stages">
          {actionStages.map((stage) => (
            <li className={`secret-progress-stage ${stage.color}`} key={stage.number}>
              <span className="secret-stage-number">{stage.number}</span>
              <span className="secret-stage-label">{stage.label}</span>
              <div className="secret-stage-track" aria-hidden="true"><span /></div>
              <strong aria-label={`${stage.label} 집계 준비 중`}>—<small>건</small></strong>
            </li>
          ))}
        </ol>
        <div className="secret-progress-note">
          <span>대응 건 집계 API가 연결되면 단계별 건수를 표시해요. 현재 탐지 기록 수를 조치 건수로 간주하지 않아요.</span>
          <span>예외 승인은 네 단계와 별도로 집계할 예정이에요.</span>
        </div>
      </section>
    </>
  )
}
