import { ActionRecordPanel } from '@/components/ActionRecordPanel'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ReachFindingDrawer } from '@/components/ReachFindingDrawer'
import { SecurityDetailLayout } from '@/components/SecurityDetailLayout'
import { PathDrawer } from '@/iac/PathDrawer'
import { PullRequestDrawer } from '@/iac/PullRequestDrawer'
import '../iac/iac.css'
import './reach.css'
import './secret-inventory.css'

export function SecurityDetailPage({ kind }: { kind: 'finding' | 'path' | 'pr' | 'iacFinding' }) {
  const { id } = useParams()
  const [params] = useSearchParams()
  const actionOnly = params.get('tab') === 'actions'
  const navigate = useNavigate()
  const location = useLocation()
  const valid = /^\d+$/.test(id ?? '') && Number.isSafeInteger(Number(id)) && Number(id) > 0
  const fallback = kind === 'finding' ? '/vulnerabilities/findings' : kind === 'pr' ? '/iac/prs' : kind === 'iacFinding' ? '/iac/changes' : '/iac/paths'
  const title = kind === 'finding' ? '이미지 취약점 상세' : kind === 'pr' ? `PR #${id} 검사 결과` : kind === 'iacFinding' ? '인프라 설정 조치' : '공격 경로 상세'
  const close = () => navigate(fallback)
  return <SecurityDetailLayout title={title} fallback={fallback}>
    {valid && (kind === 'finding' || kind === 'path') && <nav className="secret-key-tabs" aria-label="상세 보기">
      {[['result','검사 결과'],['actions','조치 관리']].map(([tab,label]) => { const next = new URLSearchParams(params); if(tab==='result') next.delete('tab'); else next.set('tab',tab); return <Link key={tab} className={(tab==='actions') === actionOnly ? 'active' : ''} aria-current={(tab==='actions') === actionOnly ? 'page' : undefined} state={location.state} to={`?${next}`}>{label}</Link> })}
    </nav>}
    {!valid ? <p className="notice error" role="alert">올바른 결과 주소가 아닙니다. 목록에서 다시 선택해 주세요.</p> :
      kind === 'iacFinding' ? <section className="card security-detail-content"><ActionRecordPanel kind="IAC_FINDING" id={Number(id)} /></section> :
      kind === 'finding' ? <ReachFindingDrawer actionOnly={actionOnly} findingId={Number(id)} onClose={close}
        onShowSameCve={(cve) => navigate(`/vulnerabilities/findings?${new URLSearchParams({ cve })}`)}
        onOpenVulnFunctions={(cve) => navigate(`/vulnerabilities/rules?${new URLSearchParams({ tab: 'functions', cve })}`, { state: { from: location.pathname } })} /> :
      kind === 'pr' ? <PullRequestDrawer number={Number(id)} onClose={close} /> : <PathDrawer actionOnly={actionOnly} pathId={Number(id)} onClose={close} />}
  </SecurityDetailLayout>
}
