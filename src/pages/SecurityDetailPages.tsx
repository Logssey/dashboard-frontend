import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ReachFindingDrawer } from '@/components/ReachFindingDrawer'
import { SecurityDetailLayout } from '@/components/SecurityDetailLayout'
import { PathDrawer } from '@/iac/PathDrawer'
import { PullRequestDrawer } from '@/iac/PullRequestDrawer'
import '../iac/iac.css'
import './reach.css'

export function SecurityDetailPage({ kind }: { kind: 'finding' | 'path' | 'pr' }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const valid = /^\d+$/.test(id ?? '') && Number.isSafeInteger(Number(id)) && Number(id) > 0
  const fallback = kind === 'finding' ? '/vulnerabilities/findings' : kind === 'pr' ? '/iac/prs' : '/iac/paths'
  const title = kind === 'finding' ? '이미지 취약점 상세' : kind === 'pr' ? `PR #${id} 검사 결과` : '현재 공격 경로 상세'
  const close = () => navigate(fallback)
  return <SecurityDetailLayout title={title} fallback={fallback}>
    {!valid ? <p className="notice error" role="alert">올바른 결과 주소가 아닙니다. 목록에서 다시 선택해 주세요.</p> :
      kind === 'finding' ? <ReachFindingDrawer findingId={Number(id)} onClose={close}
        onShowSameCve={(cve) => navigate(`/vulnerabilities/findings?${new URLSearchParams({ cve })}`)}
        onOpenVulnFunctions={(cve) => navigate(`/vulnerabilities/rules?${new URLSearchParams({ tab: 'functions', cve })}`, { state: { from: location.pathname } })} /> :
      kind === 'pr' ? <PullRequestDrawer number={Number(id)} onClose={close} /> : <PathDrawer pathId={Number(id)} onClose={close} />}
  </SecurityDetailLayout>
}
