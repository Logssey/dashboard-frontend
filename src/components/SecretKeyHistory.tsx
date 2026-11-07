import { useSearchParams } from 'react-router-dom'
import type { KeyLocation, SecretDetail } from '@/api/secrets'
import { SecretValidationHistory } from './SecretValidation'
import { SecretUsageHistory } from './SecretUsageHistory'

export function SecretKeyHistory({ secretId, detail, locations }: { secretId: number; detail: SecretDetail; locations: KeyLocation[] }) {
  const [params, setParams] = useSearchParams()
  const usage = params.get('historyView') === 'usage'
  return <>
    <nav className="secret-key-tabs" aria-label="사용·검증 이력 종류">{[['validation', '인증 확인 이력'], ['usage', '사용 이력']].map(([view, label]) => <button key={view} className={usage === (view === 'usage') ? 'active' : ''} aria-current={usage === (view === 'usage') ? 'page' : undefined} onClick={() => { const next = new URLSearchParams(params); next.set('historyView', view); next.set('locationPanel', 'closed'); setParams(next) }}>{label}</button>)}</nav>
    {usage ? <SecretUsageHistory secretId={secretId} detail={detail} locations={locations} /> : <SecretValidationHistory secretId={secretId} />}
  </>
}
