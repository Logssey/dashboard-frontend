import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createComplianceTarget,
  updateComplianceTarget,
  verifyComplianceTarget,
  type ComplianceTarget,
  type ComplianceRequirement,
  type ComplianceServiceUsage,
} from '@/api/compliance'
import { ApiError } from '@/api/client'
import { Badge } from '@/components/Badge'

interface Props {
  isAdmin: boolean
  targets: ComplianceTarget[]
  selected?: ComplianceTarget
  selectedKey: string
  connectionTestsEnabled: boolean
  onSelect: (targetKey: string) => void
}

const connectionLabel = {
  NOT_TESTED: ['연결 전', ''],
  VERIFYING: ['확인 중', 'primary'],
  VERIFIED: ['연결 확인됨', 'success'],
  FAILED: ['연결 실패', 'critical'],
} as const

const serviceOptions = [
  ['bedrock', 'Amazon Bedrock'],
  ['sagemaker', 'Amazon SageMaker'],
  ['drs', 'Elastic Disaster Recovery'],
  ['ssmincidents', 'Incident Manager'],
  ['backup', 'AWS Backup'],
  ['macie', 'Amazon Macie'],
] as const

const requirementOptions = [
  ['MULTI_REGION', '멀티 리전 복구'],
  ['PREMIUM_SUPPORT', 'Premium Support'],
  ['CLOUDFRONT_GEO_RESTRICTION', 'CloudFront 지역 제한'],
  ['CLOUDFRONT_FIELD_LEVEL_ENCRYPTION', 'CloudFront 필드 암호화'],
  ['PQC_TLS', 'PQC TLS'],
  ['CLOUDFRONT_DEFAULT_ROOT_OBJECT', 'CloudFront 기본 루트 객체'],
  ['S3_CROSS_REGION_REPLICATION', 'S3 교차 리전 복제'],
  ['S3_EVENT_NOTIFICATIONS', 'S3 이벤트 알림'],
  ['S3_CUSTOMER_MANAGED_KMS', 'S3 고객 관리형 KMS'],
  ['S3_LIFECYCLE', 'S3 Lifecycle'],
  ['S3_MFA_DELETE', 'S3 MFA Delete'],
  ['S3_OBJECT_LOCK', 'S3 Object Lock'],
] as const

export function ComplianceTargetPanel({ isAdmin, targets, selected, selectedKey, connectionTestsEnabled, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [targetKey, setTargetKey] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [accountId, setAccountId] = useState('')
  const [roleArn, setRoleArn] = useState('')
  const [regions, setRegions] = useState('ap-northeast-2')
  const [serviceUsage, setServiceUsage] = useState<Record<string, ComplianceServiceUsage>>({})
  const [requirements, setRequirements] = useState<Record<string, ComplianceRequirement>>({})
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    setServiceUsage(selected?.assessmentProfile?.serviceUsage ?? {})
    setRequirements(selected?.assessmentProfile?.requirements ?? {})
  }, [selected])

  const created = useMutation({
    mutationFn: () => createComplianceTarget({
      targetKey, displayName, awsAccountId: accountId, roleArn,
      defaultRegions: regions.split(',').map((region) => region.trim()).filter(Boolean),
    }),
    onSuccess: async (target) => {
      setError(null)
      setOpen(false)
      onSelect(target.targetKey)
      await queryClient.invalidateQueries({ queryKey: ['compliance', 'targets'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : '점검 대상을 등록하지 못했어요.'),
  })

  const verify = useMutation({
    mutationFn: () => verifyComplianceTarget(selectedKey),
    onSuccess: async () => {
      setError(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['compliance', 'targets'] }),
        queryClient.invalidateQueries({ queryKey: ['compliance', 'jobs', selectedKey] }),
      ])
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : 'AWS 연결 확인을 요청하지 못했어요.'),
  })

  const toggle = useMutation({
    mutationFn: () => selected ? updateComplianceTarget(selected, { enabled: !selected.enabled }) : Promise.reject(),
    onSuccess: async () => {
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['compliance', 'targets'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : '점검 대상 상태를 바꾸지 못했어요.'),
  })

  const saveProfile = useMutation({
    mutationFn: () => selected ? updateComplianceTarget(selected, {
      assessmentProfile: { schemaVersion: 1, serviceUsage, requirements },
    }) : Promise.reject(),
    onSuccess: async () => {
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['compliance', 'targets'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : '판정 프로필을 저장하지 못했어요.'),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    created.mutate()
  }

  const state = selected ? connectionLabel[selected.connectionStatus] : null

  return <section className="card compliance-target-card">
    <div className="card-head compliance-target-head">
      <div><h2>AWS 점검 연결</h2><p className="section-intro">정적 키 없이 대상 계정의 읽기 전용 역할을 사용해요.</p></div>
      {isAdmin && <button className="btn outline" onClick={() => { setError(null); setOpen((value) => !value) }}>
        {open ? '등록 닫기' : '대상 등록'}
      </button>}
    </div>

    {targets.length > 0 && selected ? <div className="compliance-target-detail">
      <div className="compliance-target-summary">
        <div><span>대상</span><strong>{selected.displayName}</strong><small>{selected.targetKey}</small></div>
        <div><span>AWS 계정</span><strong>{selected.awsAccountId}</strong><small>{selected.defaultRegions.join(', ') || '전체 리전'}</small></div>
        <div><span>연결 상태</span><Badge label={state?.[0] ?? '확인 불가'} tone={state?.[1] ?? ''} /><small>{selected.enabled ? '자동 점검 대상' : '점검 비활성'}</small></div>
      </div>
      <details className="compliance-target-trust">
        <summary>역할 연결 정보</summary>
        <dl><div><dt>Role ARN</dt><dd><code>{selected.roleArn}</code></dd></div>
          <div><dt>External ID</dt><dd><code>{selected.externalId}</code></dd></div></dl>
        <p>External ID는 Logssey가 생성한 읽기 전용 값이며 수정할 수 없어요. 대상 역할의 신뢰 정책에 그대로 사용하세요.</p>
      </details>
      <details className="compliance-target-profile">
        <summary>컴플라이언스 판정 프로필</summary>
        <p>자산으로 확인되는 서비스는 자동 추론합니다. 미사용이나 정책 요구 여부를 명시하면 다음 점검부터 판정에 반영해요.</p>
        <h3>서비스 사용 여부</h3>
        <div className="compliance-profile-grid">{serviceOptions.map(([key, label]) => <label key={key}>
          <span>{label}</span><select className="select" disabled={!isAdmin}
            value={serviceUsage[key] ?? 'UNKNOWN'} onChange={(event) => setServiceUsage((current) => ({
              ...current, [key]: event.target.value as ComplianceServiceUsage,
            }))}>
            <option value="UNKNOWN">자동 추론·미확정</option><option value="USED">사용함</option><option value="NOT_USED">사용하지 않음</option>
          </select>
        </label>)}</div>
        <h3>정책 요구 여부</h3>
        <div className="compliance-profile-grid">{requirementOptions.map(([key, label]) => <label key={key}>
          <span>{label}</span><select className="select" disabled={!isAdmin}
            value={requirements[key] ?? 'UNKNOWN'} onChange={(event) => setRequirements((current) => ({
              ...current, [key]: event.target.value as ComplianceRequirement,
            }))}>
            <option value="UNKNOWN">미정</option><option value="REQUIRED">필수</option><option value="NOT_REQUIRED">요구하지 않음</option>
          </select>
        </label>)}</div>
        {isAdmin && <div className="compliance-profile-actions"><span>판정 프로필 변경은 AWS 연결 상태를 바꾸지 않으며 새 Run부터 적용돼요.</span>
          <button className="btn soft" disabled={saveProfile.isPending}
            onClick={() => { setError(null); saveProfile.mutate() }}>{saveProfile.isPending ? '저장 중…' : '판정 프로필 저장'}</button></div>}
      </details>
      {isAdmin && <div className="compliance-target-actions">
        <button className="btn outline" disabled={!connectionTestsEnabled || verify.isPending || selected.connectionStatus === 'VERIFYING'}
          title={connectionTestsEnabled ? undefined : '전용 Worker identity를 준비한 뒤 활성화됩니다.'}
          onClick={() => { setError(null); verify.mutate() }}>
          {verify.isPending || selected.connectionStatus === 'VERIFYING' ? '연결 확인 중' : 'AWS 연결 확인'}
        </button>
        <button className="btn soft" disabled={toggle.isPending || (!selected.enabled && selected.connectionStatus !== 'VERIFIED')}
          onClick={() => { setError(null); toggle.mutate() }}>
          {selected.enabled ? '자동 점검 비활성화' : '자동 점검 대상으로 활성화'}
        </button>
      </div>}
      {selected.connectionErrorCode && <p className="notice error">연결 확인 실패: {selected.connectionErrorCode}</p>}
    </div> : <p className="compliance-target-empty">등록된 AWS 점검 대상이 없어요. 역할 ARN과 계정 ID를 등록해 연결을 시작하세요.</p>}

    {open && isAdmin && <form className="compliance-target-form" onSubmit={submit}>
      <label>대상 키<input className="input" value={targetKey} placeholder="reused" pattern="[a-z0-9][a-z0-9-]{1,98}[a-z0-9]" required
        onChange={(event) => setTargetKey(event.target.value.toLowerCase())} /></label>
      <label>표시 이름<input className="input" value={displayName} placeholder="Re:Used" required minLength={2} maxLength={120}
        onChange={(event) => setDisplayName(event.target.value)} /></label>
      <label>AWS 계정 ID<input className="input" value={accountId} placeholder="123456789012" inputMode="numeric" pattern="[0-9]{12}" required
        onChange={(event) => setAccountId(event.target.value.replace(/\D/g, '').slice(0, 12))} /></label>
      <label className="wide">점검 Role ARN<input className="input" value={roleArn} placeholder="arn:aws:iam::123456789012:role/LogsseyProwlerScan" required
        onChange={(event) => setRoleArn(event.target.value)} /></label>
      <label className="wide">기본 리전<input className="input" value={regions} placeholder="ap-northeast-2, us-east-1"
        onChange={(event) => setRegions(event.target.value)} /></label>
      <div className="compliance-target-submit"><span>External ID는 등록할 때 서버가 자동 생성해요.</span>
        <button className="btn primary" disabled={created.isPending}>{created.isPending ? '등록 중…' : '대상 등록'}</button></div>
    </form>}
    {error && <p className="notice error compliance-target-error" role="alert">{error}</p>}
  </section>
}
