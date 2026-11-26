import { useSearchParams } from 'react-router-dom'
import { SecretCaseClosure, type ResponsePanelProps } from './SecretCaseClosure'
import { SecretCaseRevalidation } from './SecretCaseRevalidation'
import { SecretLifecycleEvidence } from './SecretLifecycleEvidence'
import { SecretRiskExceptions } from './SecretRiskExceptions'
import { SecretCaseDismissal } from './SecretCaseDismissal'

export function SecretCaseVerification(props: ResponsePanelProps & { refreshVersion: number }) {
  const [params, setParams] = useSearchParams()
  const section = params.get('check') ?? 'locations'
  const options = { locations: '재검사 요청과 결과', lifecycle: '키 폐기 또는 교체 확인', closure: '해결 조건 확인', exceptions: '위험 수용', dismissal: '오탐 처리 또는 담당 이관' }
  return <><label className="field secret-verification-choice">확인할 작업<select className="select" value={section} onChange={event => { const next = new URLSearchParams(params); next.set('check',event.target.value); next.set('tab','verification'); setParams(next) }}>{Object.entries(options).map(([code,label]) => <option key={code} value={code}>{label}</option>)}</select></label>
    <div key={`${section}:${props.detail.version}:${props.refreshVersion}`}>{section === 'closure' ? <SecretCaseClosure {...props} /> : section === 'locations' ? <SecretCaseRevalidation {...props} /> : section === 'lifecycle' ? <SecretLifecycleEvidence {...props} /> : section === 'exceptions' ? <SecretRiskExceptions {...props} /> : section === 'dismissal' ? <SecretCaseDismissal {...props} /> : <p className="notice error" role="alert">확인할 작업을 선택해 주세요.</p>}</div></>
}
