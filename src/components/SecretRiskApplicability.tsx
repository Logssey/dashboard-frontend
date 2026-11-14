import { riskInputUtc, validRiskApplicability } from '@/lib/secretRiskForms'
import { scanDate } from '@/lib/secretScan'

export function SecretRiskApplicability({ from, until, onFrom, onUntil, sourceObservedAt, observedAt, validUntil, disabled = false }: {
  from: string; until: string; onFrom: (value: string) => void; onUntil: (value: string) => void; sourceObservedAt?: string | null; observedAt?: string | null; validUntil?: string | null; disabled?: boolean
}) {
  const valid = validRiskApplicability(riskInputUtc(from), riskInputUtc(until), sourceObservedAt, observedAt, validUntil)
  return <fieldset className="secret-risk-applicability"><legend>사실이 적용된 기간</legend>
    <p className="caption">관측 시각은 자료를 확인한 때예요. 아래 기간은 해당 접근·권한·분류가 실제로 적용된 기간이에요. 자료로 확인한 기간만 입력하세요.</p>
    <p className="caption">원문 관찰 {sourceObservedAt ? scanDate(sourceObservedAt) : '시점 미확인 · 서버에서 원문 버전 연결을 확인해요.'}</p>
    <div className="secret-permission-form-grid"><label>사실 적용 시작 (KST)<input className="input" type="datetime-local" value={from} required disabled={disabled} onChange={(event) => onFrom(event.target.value)} /></label><label>사실 적용 종료 (KST)<input className="input" type="datetime-local" value={until} required disabled={disabled} onChange={(event) => onUntil(event.target.value)} /></label></div>
    {from && until && !valid && <p className="notice error" role="alert">시작은 자료 관측 시각 이하여야 하고 종료는 근거 최신성 기한을 넘을 수 없어요. 원문 관찰 시각은 시작 이상·종료 미만에 포함돼야 해요.</p>}
  </fieldset>
}
