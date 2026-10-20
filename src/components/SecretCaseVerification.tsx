import { Link, useSearchParams } from 'react-router-dom'
import { SecretCaseClosure, type ResponsePanelProps } from './SecretCaseClosure'
import { SecretCaseRevalidation } from './SecretCaseRevalidation'
import { SecretLifecycleEvidence } from './SecretLifecycleEvidence'
import { SecretRiskExceptions } from './SecretRiskExceptions'
import { SecretCaseDismissal } from './SecretCaseDismissal'

export function SecretCaseVerification(props: ResponsePanelProps & { refreshVersion: number }) {
  const [params] = useSearchParams()
  const section = params.get('check') ?? 'closure'
  const options = { closure: '해결 조건', locations: '위치 재검사', lifecycle: '키 폐기·교체', exceptions: '위험 수용', dismissal: '교정·이관' }
  return <><nav className="secret-response-tabs secret-response-subtabs" aria-label="확인할 근거 선택">{Object.entries(options).map(([code, label]) => { const next = new URLSearchParams(params); next.set('check', code); return <Link key={code} to={`?${next}`} aria-current={code === section ? 'page' : undefined}>{label}</Link> })}</nav><div key={`${section}:${props.detail.version}:${props.refreshVersion}`}>{section === 'closure' ? <SecretCaseClosure {...props} /> : section === 'locations' ? <SecretCaseRevalidation {...props} /> : section === 'lifecycle' ? <SecretLifecycleEvidence {...props} /> : section === 'exceptions' ? <SecretRiskExceptions {...props} /> : section === 'dismissal' ? <SecretCaseDismissal {...props} /> : <p className="notice error" role="alert">확인 구역 주소를 다시 선택해 주세요.</p>}</div></>
}
