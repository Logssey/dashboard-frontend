import { Link, useSearchParams } from 'react-router-dom'
import { SecretCaseClosure, type ResponsePanelProps } from './SecretCaseClosure'
import { SecretCaseRevalidation } from './SecretCaseRevalidation'
import { SecretLifecycleEvidence } from './SecretLifecycleEvidence'
import { SecretRiskExceptions } from './SecretRiskExceptions'
import { SecretCaseDismissal } from './SecretCaseDismissal'

export function SecretCaseVerification(props: ResponsePanelProps & { refreshVersion: number }) {
  const [params] = useSearchParams()
  const section = params.get('check') ?? (['REQUEST_REVALIDATION', 'WAIT_FOR_REVALIDATION', 'RESUME_REMEDIATION'].includes(props.detail.taskGuidance?.nextActionCode ?? '') ? 'locations' : 'closure')
  const options = { closure: '해결 조건', locations: '위치 재검사', lifecycle: '키 폐기·교체' }
  const link = (code: string, label: string) => { const next = new URLSearchParams(params); next.set('check', code); next.set('tab', 'verification'); return <Link key={code} to={`?${next}`} aria-current={code === section ? 'page' : undefined}>{label}</Link> }
  return <><nav className="secret-response-tabs secret-response-subtabs" aria-label="확인할 근거 선택">{Object.entries(options).map(([code, label]) => link(code, label))}</nav><details className="secret-response-disclosure" open={['exceptions', 'dismissal'].includes(section)}><summary>예외·종료 처리</summary><p className="caption">위험 수용과 담당 이관은 실제 노출 제거·키 폐기와 구분해 기록해요.</p><nav className="secret-response-tabs" aria-label="예외 처리 선택">{link('exceptions', '위험 수용')}{link('dismissal', '오탐 교정·담당 이관')}</nav></details><div key={`${section}:${props.detail.version}:${props.refreshVersion}`}>{section === 'closure' ? <SecretCaseClosure {...props} /> : section === 'locations' ? <SecretCaseRevalidation {...props} /> : section === 'lifecycle' ? <SecretLifecycleEvidence {...props} /> : section === 'exceptions' ? <SecretRiskExceptions {...props} /> : section === 'dismissal' ? <SecretCaseDismissal {...props} /> : <p className="notice error" role="alert">확인 구역 주소를 다시 선택해 주세요.</p>}</div></>
}
