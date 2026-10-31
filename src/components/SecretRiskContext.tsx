import type { RiskAnalysisContext } from '@/api/secretRisk'
import { riskReason, verificationLabel } from '@/lib/secretRisk'
import { riskOptionLabel } from '@/lib/secretRiskForms'
import { scanDate } from '@/lib/secretScan'

const capabilityCodes = new Set(['IDENTITY_ADMINISTRATION', 'SECURITY_SETTINGS_WRITE', 'RESOURCE_ADMINISTRATION', 'PRODUCTION_DEPLOY', 'DATA_WRITE', 'SENSITIVE_DATA_READ', 'RESOURCE_READ', 'TEST_RESOURCE_READ'])
const coverageLabels: Record<string, string> = { COMPLETE: '전체 확인', PARTIAL: '일부 확인', UNKNOWN: '미확인', NOT_APPLICABLE: '비적용 근거 있음' }
const targetLabels: Record<string, string> = { ASSET: '특정 자산', ACCOUNT: '계정', ORGANIZATION: '조직' }
const environmentLabels: Record<string, string> = { PROD: '운영', PRODUCTION: '운영', DEV: '개발', TEST: '시험', UNKNOWN: '환경 미확인' }
const limitationLabels: Record<string, string> = {
  AUTOMATED_PERMISSION_ANALYSIS_UNSUPPORTED: '현재 권한·영향은 자동 조회 결과가 아닌 수용된 근거로 확인해요.',
  AUTOMATED_IMPACT_ASSESSMENT_UNSUPPORTED: '자동으로 읽은 권한 자료는 검토를 도와줘요. 실제 영향은 수용한 근거로 판단해요.',
  MANUAL_ASSET_LINK_NOT_PERMISSION_PROOF: '자산 연결만으로 키가 해당 자산에 접근할 수 있다고 판단하지 않아요.',
  VALIDITY_NOT_PERMISSION_PROOF: '공급자 인증 성공만으로 업무 권한을 확인하지 않아요.',
}

export function SecretRiskContext({ context, occurrenceId, evidenceRevision, onClassifyAsset }: { context?: RiskAnalysisContext; occurrenceId: number; evidenceRevision: number; onClassifyAsset?: () => void }) {
  if (!context) return null
  if (context.occurrenceId !== occurrenceId || context.evidenceRevision !== evidenceRevision || context.profileVersion !== 'risk-context-v1') return <p className="notice" role="status">선택한 위치의 근거가 갱신됐어요. 다시 조회해 주세요.</p>
  const access = context.access
  const permissions = context.permissions
  const asset = context.asset
  const capabilities = [...new Set(permissions.capabilities)].filter((code) => capabilityCodes.has(code))
  const targetScopes = [...new Set(permissions.targetScopes)].filter((code) => Object.hasOwn(targetLabels, code))
  const accessLabel = access.status !== 'CONFIRMED' ? '읽기 범위 미확인' : access.range === 'BROAD' ? '공개·광범위 접근 확인' : access.range === 'BOUNDED' ? '제한된 접근 대상 확인' : '읽기 범위 미확인'
  const permissionsLabel = permissions.status === 'CONFIRMED' ? '권한 근거 확인' : permissions.status === 'PARTIAL' ? '일부 권한만 확인' : '권한·대상 미확인'
  const linkedAsset = asset.status !== 'UNLINKED' && asset.assetId != null && asset.label
  const classifications = asset.status === 'CLASSIFIED' && asset.classification ? [asset.classification.sensitive ? '민감 데이터 있음' : '민감 데이터 없음 확인', asset.classification.important ? '중요 자원' : '중요 자원 아님 확인', asset.classification.testOnly ? '시험 전용' : '시험 전용 아님 확인'] : []
  const limitationText = [...new Set(context.limitations.map((code) => limitationLabels[code] ?? riskReason(code)))]
  return <section className="secret-risk-context" aria-label="선택 위치의 권한과 자산 근거">
    <div className="secret-risk-context-heading"><h3>확인한 권한·자산</h3>{onClassifyAsset && <button type="button" className="btn outline" onClick={onClassifyAsset}>자산 분류 보완</button>}</div>
    <dl className="secret-risk-context-summary">
      <div><dt>위치를 읽을 수 있는 범위</dt><dd>{accessLabel}<small>{access.verificationLevel ? verificationLabel(access.verificationLevel) : '접근 근거 필요'}{access.observedAt ? ` · ${scanDate(access.observedAt)}` : ''}</small></dd></div>
      <div><dt>발견된 키의 권한</dt><dd>{permissionsLabel}{permissions.verificationLevel === 'MANUAL_ACCEPTED' && <small>수용된 수동 근거</small>}{capabilities.length > 0 && <ul>{capabilities.map((code) => <li key={code}>{riskOptionLabel(code)}</li>)}</ul>}{targetScopes.length > 0 && <small>대상 단위 · {targetScopes.map((code) => targetLabels[code]).join(', ')}</small>}{permissions.status === 'PARTIAL' && <small>확인된 기능만 표시해요. 전체 권한·대상·제한을 확인한 결과는 아니에요.</small>}</dd></div>
      <div><dt>연결된 자산</dt><dd>{linkedAsset ? <>{asset.label}<small>{environmentLabels[asset.environment] ?? '환경 미확인'} · {asset.status === 'CLASSIFIED' ? '분류 근거 확인' : '자산 분류 확인 필요'}</small>{classifications.length > 0 && <ul>{classifications.map((label) => <li key={label}>{label}</li>)}</ul>}</> : asset.status === 'UNLINKED' ? '연결된 자산 없음' : '자산 정보 확인 필요'}</dd></div>
    </dl>
    <details className="secret-risk-context-detail"><summary>권한 확인 범위·근거 시각</summary>
      <dl className="secret-risk-axes">{Object.entries({ permissionCoverage: '권한 조회', targetCoverage: '전체 대상', restrictionCoverage: '적용 제한', classificationCoverage: '자산 분류' }).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{coverageLabels[permissions.coverage[key as keyof typeof permissions.coverage]] ?? '미확인'}</dd></div>)}<div><dt>권한 근거 관측</dt><dd>{permissions.observedAt ? scanDate(permissions.observedAt) : '관측 기록 없음'}</dd></div><div><dt>권한 근거 기한</dt><dd>{permissions.validUntil ? scanDate(permissions.validUntil) : '적용 기한 미확인'}</dd></div></dl>
      {permissions.mappingVersion === 'manual-evidence-v1' && <p className="caption">권한 해석 기준 · 수용된 수동 근거</p>}
      {limitationText.length > 0 && <ul className="secret-safe-reasons">{limitationText.map((label) => <li key={label}>{label}</li>)}</ul>}
      <p className="caption">자산 연결과 인증 성공은 실제 접근 권한의 증명이 아니에요. 근거가 부족하면 미평가를 유지해요.</p>
    </details>
  </section>
}
