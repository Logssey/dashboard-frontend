import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { testSecretConnection, type SecretConnectionTestResult } from '@/api/secretConnections'
import { fetchSecretConnections, type SecretConnection } from '@/api/secrets'
import { Icon } from '@/components/Icon'
import { PageHeader } from '@/components/PageHeader'
import './secret-connections.css'

const koreaDate = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul',
})

function testDescription(provider: SecretConnection['provider']): string {
  switch (provider) {
    case 'GITHUB': return '승인 저장소 1개의 읽기 토큰 발급'
    case 'AWS': return 'AWS STS 계정 확인'
    default: return '지원 여부 확인'
  }
}

function connectionPurpose(provider: SecretConnection['provider']): string {
  switch (provider) {
    case 'GITHUB': return '승인 저장소 콘텐츠 수집'
    case 'AWS': return '승인된 AWS 범위 수집'
    default: return '등록된 수집 연결'
  }
}

function testResultLabel(result: SecretConnectionTestResult): string {
  switch (result.status) {
    case 'CONNECTED': return '연결 확인 완료'
    case 'FAILED': return '연결 확인 실패'
    case 'UNAVAILABLE': return '지금 확인할 수 없음'
  }
}

function testResultDetail(result: SecretConnectionTestResult): string {
  switch (result.status) {
    case 'CONNECTED': return '인증 경로를 확인했어요. 이 결과가 실제 스캔 성공을 보장하지는 않아요.'
    case 'FAILED':
    case 'UNAVAILABLE': return testReasonLabel(result.reasonCode)
  }
}

function testReasonLabel(reasonCode: string | null): string {
  switch (reasonCode) {
    case 'INVALID_APPROVED_SCOPE': return '승인 범위 설정을 확인해 주세요.'
    case 'AWS_ACCOUNT_MISMATCH': return '연결된 AWS 계정이 승인된 계정과 달라요.'
    case 'AWS_ACCESS_DENIED': return 'AWS 인증 경로를 확인해 주세요.'
    case 'AWS_RATE_LIMITED': return 'AWS 요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요.'
    case 'AWS_UNAVAILABLE': return 'AWS 응답을 확인할 수 없어요. 잠시 후 다시 시도해 주세요.'
    case 'GITHUB_APP_UNAVAILABLE': return 'GitHub App 설정을 확인해 주세요.'
    case 'GITHUB_ACCESS_DENIED': return '승인된 GitHub 저장소의 읽기 권한을 확인해 주세요.'
    case 'GITHUB_RATE_LIMITED': return 'GitHub 요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요.'
    case 'GITHUB_UNAVAILABLE': return 'GitHub 응답을 확인할 수 없어요. 잠시 후 다시 시도해 주세요.'
    default: return '연결 상태를 확인한 뒤 다시 시도해 주세요.'
  }
}

function testErrorMessage(error: Error): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return '연결 테스트는 관리자 권한이 필요해요.'
    if (error.status === 404) return '연결을 찾을 수 없어요. 목록을 새로고침해 주세요.'
    if (error.status === 409) return '현재 이 연결은 테스트할 수 없어요. 연결 상태를 확인해 주세요.'
  }
  return '연결 테스트 요청을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

function ConnectionCard({
  connection, result, error, testing, busy, onTest,
}: {
  connection: SecretConnection
  result?: SecretConnectionTestResult
  error?: string
  testing: boolean
  busy: boolean
  onTest: (connectionId: number) => void
}) {
  const isGitHub = connection.provider === 'GITHUB'
  return (
    <article className="secret-connection-card">
      <div className="secret-connection-card-top">
        <span className={`secret-provider-mark ${isGitHub ? 'github' : 'aws'}`} aria-hidden="true">
          {isGitHub ? 'GH' : 'aws'}
        </span>
        <span className="secret-connection-state">활성</span>
      </div>
      <h2>{isGitHub ? 'GitHub' : 'AWS'}</h2>
      <p className="secret-connection-name">{connection.displayName}</p>

      <dl className="secret-connection-facts">
        <dt>연결 용도</dt><dd>{connectionPurpose(connection.provider)}</dd>
        <dt>허용 범위</dt><dd>{connection.approvedScopeCount}개 승인</dd>
        <dt>테스트 항목</dt><dd>{testDescription(connection.provider)}</dd>
      </dl>

      {result && (
        <div className={`secret-connection-test-result ${result.status.toLowerCase()}`} role="status">
          <strong>{testResultLabel(result)}</strong>
          <span>{testResultDetail(result)}</span>
          <time dateTime={result.checkedAt}>{koreaDate.format(new Date(result.checkedAt))} KST</time>
        </div>
      )}
      {error && <p className="secret-connection-test-error" role="alert">{error}</p>}

      <div className="secret-connection-actions">
        <button className="btn outline" type="button" disabled title="연결 설정 화면은 아직 제공되지 않아요.">
          설정 보기
        </button>
        <button className="btn secret-connection-test-button" type="button"
          onClick={() => onTest(connection.connectionId)} disabled={busy}>
          <span className="secret-connection-refresh" aria-hidden="true">↻</span>
          {testing ? '확인 중…' : '연결 테스트'}
        </button>
      </div>
    </article>
  )
}

/** 승인된 활성 수집 연결만 노출한다. 연결 등록·수정 API가 생기면 버튼을 연결한다. */
export function SecretConnectionsPage() {
  const connections = useQuery({ queryKey: ['secret-connections'], queryFn: fetchSecretConnections })
  const [results, setResults] = useState<Record<number, SecretConnectionTestResult>>({})
  const [errors, setErrors] = useState<Record<number, string>>({})
  const test = useMutation({
    mutationFn: testSecretConnection,
    onMutate: (connectionId) => {
      setErrors((current) => ({ ...current, [connectionId]: '' }))
      setResults((current) => {
        const next = { ...current }
        delete next[connectionId]
        return next
      })
    },
    onSuccess: (result) => {
      setResults((current) => ({ ...current, [result.connectionId]: result }))
    },
    onError: (error, connectionId) => {
      setErrors((current) => ({ ...current, [connectionId]: testErrorMessage(error) }))
    },
  })

  const items = connections.data?.items ?? []
  return (
    <>
      <PageHeader title="연결 관리" description="탐지 원본과 검증 연결을 분리하고, 승인된 범위만 읽습니다."
        actions={<button className="btn secret-connection-add" type="button" disabled
          title="연결 등록 화면은 아직 제공되지 않아요.">
          <Icon name="plus" /> 연결 추가
        </button>} />

      <div className="secret-connection-info" role="note">
        <span className="secret-connection-info-icon" aria-hidden="true">ⓘ</span>
        <span><strong>연결 유형</strong> · 현재 등록된 활성 GitHub·AWS 연결을 표시합니다. 연결 테스트는 인증 경로만 확인하며 스캔이나 값 수집을 시작하지 않습니다. 화면에서 연결 추가·설정 변경은 아직 지원하지 않습니다.</span>
      </div>

      {connections.isPending && <div className="secret-connection-loading" aria-live="polite">
        <div className="skeleton" /><div className="skeleton" /><div className="skeleton" />
      </div>}
      {connections.isError && <div className="secret-connection-page-error" role="alert">
        <p>{connections.error instanceof ApiError && connections.error.status === 403
          ? '연결 조회에는 관리자 권한이 필요해요.' : '연결 목록을 불러오지 못했어요.'}</p>
        <button className="btn outline" type="button" onClick={() => void connections.refetch()}>다시 시도</button>
      </div>}
      {connections.isSuccess && items.length === 0 && <div className="secret-connection-empty">
        <strong>사용할 수 있는 연결이 없어요.</strong>
        <p>승인 범위가 있는 활성 연결을 등록하면 이곳에 표시됩니다.</p>
      </div>}
      {connections.isSuccess && items.length > 0 && <div className="secret-connection-grid">
        {items.map((connection) => <ConnectionCard key={connection.connectionId}
          connection={connection} result={results[connection.connectionId]}
          error={errors[connection.connectionId]}
          testing={test.isPending && test.variables === connection.connectionId}
          busy={test.isPending}
          onTest={(id) => test.mutate(id)} />)}
      </div>}

      <div className="secret-connection-guides">
        <section className="secret-connection-guide">
          <h2>연결 권한 안내</h2>
          <p>수집 연결은 승인된 범위와 읽기 권한을 기준으로 구성합니다.</p>
          <ul>
            <li><span aria-hidden="true">♙</span><div><strong>탐지 원본은 읽기 권한만</strong><small>GitHub 저장소는 콘텐츠 읽기, AWS는 승인한 대상에 필요한 조회 권한을 사용합니다.</small></div></li>
            <li><span aria-hidden="true">◎</span><div><strong>소유자와 허용 범위 확인</strong><small>연결을 추가하거나 범위를 바꿀 때 대상과 권한을 함께 검토합니다.</small></div></li>
            <li><span aria-hidden="true">◇</span><div><strong>연결 테스트는 검사와 분리</strong><small>연결 테스트는 키 탐지나 유효성 검증 작업을 시작하지 않습니다.</small></div></li>
          </ul>
        </section>
        <section className="secret-connection-guide">
          <h2>스캔 이력</h2>
          <p>연결별 검사 실행 상태와 부분 실패를 확인할 수 있습니다.</p>
          <div className="secret-connection-guide-divider" />
          <Link className="btn secret-connection-history-link" to="/secrets/history">
            스캔 이력으로 이동 <Icon name="chevron" />
          </Link>
          <small>연결 테스트 결과는 현재 화면에서 확인하고, 실제 검사 결과는 실행 이력에서 확인하세요.</small>
        </section>
      </div>
    </>
  )
}
