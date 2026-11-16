import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchComplianceCatalog,
  fetchComplianceOverview,
  fetchComplianceRun,
  fetchComplianceRuns,
  importProwlerResults,
  complianceReportUrl,
  cancelComplianceJob,
  createComplianceJob,
  type ComplianceEnvironment,
  type ComplianceJobStatus,
  type ComplianceReportFramework,
  type ComplianceResult,
  type FrameworkSummary,
  fetchComplianceJobs,
  fetchComplianceScopeCatalog,
} from '@/api/compliance'
import { ApiError } from '@/api/client'
import { Badge } from '@/components/Badge'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { ComplianceScanDialog } from '@/components/ComplianceScanDialog'
import { PageHeader } from '@/components/PageHeader'
import { useMe } from '@/layout/useMe'
import './compliance.css'

const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const resultLabel: Record<ComplianceResult, string> = {
  PASS: '통과',
  FAIL: '실패',
  ERROR: '수집 오류',
  NEEDS_REVIEW: '확인 필요',
}

const resultTone: Record<ComplianceResult, string> = {
  PASS: 'success',
  FAIL: 'critical',
  ERROR: 'high',
  NEEDS_REVIEW: 'medium',
}

const jobStatus: Record<ComplianceJobStatus, { label: string; tone: string }> = {
  QUEUED: { label: '대기 중', tone: 'medium' },
  LEASED: { label: '점검 중', tone: 'primary' },
  SUCCEEDED: { label: '완료', tone: 'success' },
  FAILED: { label: '실패', tone: 'critical' },
  CANCELLED: { label: '취소', tone: '' },
}

const scopeLabel = (scope: { regions: string[]; services: string[]; checks: string[] }) => {
  if (scope.services.length) return `서비스 ${scope.services.length}개`
  if (scope.checks.length) return `Check ${scope.checks.length}개`
  return '전체 Check'
}

function FrameworkCard({ framework }: { framework: FrameworkSummary }) {
  const assessed = framework.totalControls - framework.notAssessed
  const coverage = framework.totalControls ? Math.round((assessed / framework.totalControls) * 100) : 0
  return (
    <article className="card compliance-framework">
      <div className="compliance-framework-head">
        <div>
          <span className="compliance-framework-code">{framework.shortName}</span>
          <h2>{framework.name}</h2>
        </div>
        <strong>{framework.technicalFail}</strong>
      </div>
      <p className="caption">기술 점검 실패 통제</p>
      <div className="compliance-progress" aria-label={`점검 근거 확보 ${coverage}%`}>
        <span style={{ width: `${coverage}%` }} />
      </div>
      <div className="compliance-framework-stats">
        <span><b>{assessed}</b> 근거 있음</span>
        <span><b>{framework.needsReview}</b> 검토 필요</span>
        <span><b>{framework.notAssessed}</b> 미점검</span>
      </div>
    </article>
  )
}

export function CompliancePage() {
  const [environment, setEnvironment] = useState<ComplianceEnvironment>('ALL')
  const [importEnvironment, setImportEnvironment] = useState<'prod' | 'dev'>('prod')
  const [reportFramework, setReportFramework] = useState<ComplianceReportFramework>('all')
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)
  const [scanOpen, setScanOpen] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [jobActionError, setJobActionError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const completedJobRef = useRef<number | null>(null)
  const queryClient = useQueryClient()
  const me = useMe()

  const overview = useQuery({
    queryKey: ['compliance', 'overview', environment],
    queryFn: () => fetchComplianceOverview(environment),
  })
  const runs = useQuery({
    queryKey: ['compliance', 'runs', environment],
    queryFn: () => fetchComplianceRuns(environment),
  })
  const catalog = useQuery({ queryKey: ['compliance', 'catalog'], queryFn: fetchComplianceCatalog, staleTime: Infinity })
  const scopeCatalog = useQuery({ queryKey: ['compliance', 'scope-catalog'], queryFn: fetchComplianceScopeCatalog, staleTime: Infinity })
  const jobs = useQuery({ queryKey: ['compliance', 'jobs'], queryFn: fetchComplianceJobs, refetchInterval: 5000 })
  const selectedRun = useQuery({
    queryKey: ['compliance', 'run', selectedRunId],
    queryFn: () => fetchComplianceRun(selectedRunId as number),
    enabled: selectedRunId !== null,
  })

  const importer = useMutation({
    mutationFn: (file: File) => importProwlerResults(file, importEnvironment),
    onSuccess: async ({ runId }) => {
      setUploadError(null)
      setSelectedRunId(runId)
      await queryClient.invalidateQueries({ queryKey: ['compliance'] })
    },
    onError: (error) => setUploadError(error instanceof ApiError ? error.message : '파일을 가져오지 못했어요.'),
  })

  const scanner = useMutation({
    mutationFn: ({ selectedEnvironment, scope }: { selectedEnvironment: 'prod' | 'dev'; scope: { regions: string[]; services: string[]; checks: string[] } }) =>
      createComplianceJob(selectedEnvironment, scope),
    onSuccess: async () => {
      setScanError(null)
      setScanOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['compliance', 'jobs'] })
    },
    onError: (error) => setScanError(error instanceof ApiError ? error.message : '점검을 요청하지 못했어요.'),
  })

  const canceller = useMutation({
    mutationFn: cancelComplianceJob,
    onSuccess: async () => {
      setJobActionError(null)
      await queryClient.invalidateQueries({ queryKey: ['compliance', 'jobs'] })
    },
    onError: (error) => setJobActionError(error instanceof ApiError ? error.message : '점검을 취소하지 못했어요.'),
  })

  useEffect(() => {
    const completed = jobs.data?.items.find((job) => job.status === 'SUCCEEDED')
    if (!completed || completed.jobId === completedJobRef.current) return
    completedJobRef.current = completed.jobId
    void queryClient.invalidateQueries({ queryKey: ['compliance', 'overview'] })
    void queryClient.invalidateQueries({ queryKey: ['compliance', 'runs'] })
  }, [jobs.data, queryClient])

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 8 * 1024 * 1024) {
      setUploadError('Prowler JSON 파일은 최대 8MB까지 가져올 수 있어요.')
      return
    }
    setUploadError(null)
    importer.mutate(file)
  }

  const latest = overview.data?.latestRun
  const displayed = selectedRun.data
  const isAdmin = me.data?.role === 'ADMIN'
  const executionEnabled = scopeCatalog.data?.executionEnabled === true
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['compliance'] })

  return (
    <>
      <PageHeader
        title="컴플라이언스"
        description="한 번의 기술 점검 결과를 ISMS-P, ISO 27001, CSAP 기준으로 함께 확인하세요."
        actions={
          <>
            <button className="btn outline" onClick={refresh}><Icon name="activity" />새로고침</button>
            {latest && <a className="btn soft" href={complianceReportUrl(latest.runId, reportFramework)} target="_blank" rel="noreferrer">
              <Icon name="download" />감사 보고서
            </a>}
            {isAdmin && <button className="btn outline" onClick={() => fileInput.current?.click()} disabled={importer.isPending}>
              <Icon name="download" />{importer.isPending ? '가져오는 중' : '결과 가져오기'}
            </button>}
            {isAdmin && <button className="btn primary" disabled={!executionEnabled}
              title={executionEnabled ? undefined : 'AWS 운영 연결을 완료한 뒤 활성화됩니다.'}
              onClick={() => { setScanError(null); setScanOpen(true) }}>
              <Icon name="plus" />새 점검
            </button>}
          </>
        }
      />

      <input ref={fileInput} className="compliance-file" type="file" accept="application/json,.json" onChange={onFile} />
      <ComplianceScanDialog open={scanOpen} catalog={scopeCatalog.data} busy={scanner.isPending} error={scanError}
        onClose={() => { if (!scanner.isPending) setScanOpen(false) }}
        onSubmit={(selectedEnvironment, scope) => scanner.mutate({ selectedEnvironment, scope })} />

      <section className="compliance-scope-bar">
        <div className="compliance-scope-copy">
          <span className="status done">기술 점검</span>
          <span>이 화면은 인증 합격 여부가 아니라 자동 수집 가능한 기술 근거를 보여줘요.</span>
        </div>
        <div className="row">
          {latest && <label className="compliance-import-environment">
            <span>보고서</span>
            <select className="select" value={reportFramework} onChange={(event) => setReportFramework(event.target.value as ComplianceReportFramework)}>
              <option value="all">통합</option>
              <option value="isms">ISMS-P</option>
              <option value="iso">ISO 27001</option>
              <option value="csap">CSAP</option>
            </select>
          </label>}
          {isAdmin && <label className="compliance-import-environment">
            <span>가져올 환경</span>
            <select className="select" value={importEnvironment} onChange={(event) => setImportEnvironment(event.target.value as 'prod' | 'dev')}>
              <option value="prod">운영</option>
              <option value="dev">개발</option>
            </select>
          </label>}
          <select className="select" aria-label="조회 환경" value={environment} onChange={(event) => setEnvironment(event.target.value as ComplianceEnvironment)}>
            <option value="ALL">전체 환경</option>
            <option value="PROD">운영</option>
            <option value="DEV">개발</option>
          </select>
        </div>
      </section>

      {uploadError && <p className="notice error compliance-notice" role="alert">{uploadError}</p>}
      {overview.isError && <p className="notice error compliance-notice">컴플라이언스 현황을 불러오지 못했어요.</p>}
      {jobActionError && <p className="notice error compliance-notice" role="alert">{jobActionError}</p>}
      {isAdmin && scopeCatalog.data && !executionEnabled && <p className="notice compliance-notice">
        자동 점검은 AWS 운영 연결을 준비 중이에요. 기존 결과 조회, JSON 가져오기와 보고서 생성은 사용할 수 있어요.
      </p>}

      {!!jobs.data?.items.length && <section className="card list-card compliance-job-card">
        <div className="card-head">
          <div><h2>자동 점검</h2><p className="section-intro">요청한 범위와 현재 실행 상태를 확인하세요.</p></div>
          {jobs.data.items.some((job) => job.status === 'QUEUED' || job.status === 'LEASED') && <span className="compliance-live"><i />실행 상태 갱신 중</span>}
        </div>
        <div className="table-scroll"><table>
          <thead><tr><th>작업</th><th>환경</th><th>범위</th><th>상태</th><th>요청 시각</th><th>결과</th></tr></thead>
          <tbody>{jobs.data.items.map((job) => <tr key={job.jobId}>
            <td><strong>#{job.jobId}</strong><span className="asset">AWS · Prowler</span></td>
            <td><Badge label={job.environment === 'prod' ? '운영' : '개발'} tone="primary" /></td>
            <td>{scopeLabel(job.scope)}<span className="asset">{job.scope.regions.join(', ') || '전체 리전'}</span></td>
            <td><Badge label={jobStatus[job.status].label} tone={jobStatus[job.status].tone} />{job.status === 'LEASED' && <span className="asset">시도 {job.attemptCount}/{job.maxAttempts}</span>}</td>
            <td>{timeFormat.format(new Date(job.createdAt))}</td>
            <td>{job.runId ? <button className="finding-link" onClick={() => setSelectedRunId(job.runId)}>결과 보기</button>
              : isAdmin && (job.status === 'QUEUED' || job.status === 'LEASED')
                ? <button className="finding-link compliance-cancel-link" disabled={canceller.isPending}
                    onClick={() => { setJobActionError(null); canceller.mutate(job.jobId) }}>취소</button>
                : job.errorCode ? <span className="compliance-job-error">{job.errorCode}</span> : '—'}</td>
          </tr>)}</tbody>
        </table></div>
      </section>}

      {!latest && !overview.isLoading ? (
        <section className="card compliance-empty-state">
          <div className="compliance-empty-icon"><Icon name="shield" /></div>
          <div>
            <p className="compliance-eyebrow">첫 점검 준비 완료</p>
            <h2>Prowler JSON-OCSF 결과를 가져오면 바로 시작돼요.</h2>
            <p>원본 파일은 저장하지 않고, 화면과 규제 평가에 필요한 정규화된 근거와 파일 해시만 보관합니다.</p>
          </div>
          <div className="compliance-catalog-summary">
            {catalog.data?.frameworks.map((framework) => (
              <div key={framework.id}><strong>{framework.controls}</strong><span>{framework.shortName} 통제</span></div>
            ))}
          </div>
          {isAdmin && <button className="btn primary" disabled={!executionEnabled}
            title={executionEnabled ? undefined : 'AWS 운영 연결을 완료한 뒤 활성화됩니다.'}
            onClick={() => setScanOpen(true)}><Icon name="plus" />첫 점검 시작</button>}
        </section>
      ) : (
        <div className="stack">
          <section className="compliance-summary-grid">
            <article className="card compliance-primary-metric">
              <p className="muted">최근 점검 결과</p>
              <div className="compliance-primary-number">{latest?.counts.fail ?? '—'}<span>개 실패</span></div>
              <p>{latest ? `${latest.counts.total.toLocaleString()}개 결과 중 즉시 확인할 기술 항목` : '결과를 불러오는 중이에요.'}</p>
              {latest && <div className="compliance-run-meta"><Badge label={latest.environment === 'prod' ? '운영' : '개발'} tone="primary" /><span>{timeFormat.format(new Date(latest.finishedAt))}</span><span>Prowler {latest.scannerVersion}</span></div>}
            </article>
            <article className="card compliance-result-breakdown">
              <div><span className="compliance-dot fail" /><p>실패</p><strong>{latest?.counts.fail ?? '—'}</strong></div>
              <div><span className="compliance-dot review" /><p>확인 필요</p><strong>{latest?.counts.needsReview ?? '—'}</strong></div>
              <div><span className="compliance-dot error" /><p>수집 오류</p><strong>{latest?.counts.error ?? '—'}</strong></div>
              <div><span className="compliance-dot pass" /><p>통과</p><strong>{latest?.counts.pass ?? '—'}</strong></div>
            </article>
          </section>

          <section className="compliance-framework-grid">
            {overview.data?.frameworks.map((framework) => <FrameworkCard key={framework.id} framework={framework} />)}
          </section>

          <section className="card list-card">
            <div className="card-head">
              <div><h2>점검 이력</h2><p className="section-intro">환경별로 가져온 결과와 평가 시점을 확인하세요.</p></div>
              <span className="caption">최근 20회</span>
            </div>
            {runs.data?.items.length ? <div className="table-scroll"><table>
              <thead><tr><th>점검</th><th>환경</th><th>결과</th><th>실패</th><th>확인 필요</th><th>완료 시각</th></tr></thead>
              <tbody>{runs.data.items.map((run) => <tr key={run.runId} className={selectedRunId === run.runId ? 'compliance-selected-row' : ''}>
                <td><button className="finding-link" onClick={() => setSelectedRunId(run.runId)}>#{run.runId} · {run.product} {run.scannerVersion}</button></td>
                <td><Badge label={run.environment === 'prod' ? '운영' : '개발'} tone="primary" /></td>
                <td>{run.counts.total.toLocaleString()}건</td><td className="compliance-fail-count">{run.counts.fail}</td><td>{run.counts.needsReview}</td>
                <td>{timeFormat.format(new Date(run.finishedAt))}</td>
              </tr>)}</tbody>
            </table></div> : <EmptyState title="점검 이력이 없어요" description="Prowler 결과를 가져오면 이곳에 실행 이력이 쌓여요." />}
          </section>

          {selectedRunId !== null && <section className="card list-card compliance-results">
            <div className="card-head">
              <div><h2>#{selectedRunId} 기술 점검 결과</h2><p className="section-intro">실패와 수집 오류를 먼저 보여줘요.</p></div>
              <button className="icon-btn" aria-label="상세 닫기" onClick={() => setSelectedRunId(null)}><Icon name="close" /></button>
            </div>
            {selectedRun.isLoading ? <p className="compliance-loading">결과를 불러오는 중이에요.</p> : displayed?.results.length ? <>
              <div className="table-scroll"><table><thead><tr><th>Check</th><th>판정</th><th>Provider</th><th>자산</th><th>Region</th></tr></thead>
                <tbody>{displayed.results.map((result) => <tr key={result.resultId}>
                  <td><strong>{result.title}</strong><span className="asset">{result.checkId}</span></td>
                  <td><Badge label={resultLabel[result.result]} tone={resultTone[result.result]} /></td>
                  <td>{result.provider.toUpperCase()}</td><td>{result.asset}</td><td>{result.region}</td>
                </tr>)}</tbody>
              </table></div>
              {displayed.resultsTruncated && <p className="table-foot">우선순위가 높은 결과 300건만 표시하고 있어요.</p>}
            </> : <EmptyState title="표시할 결과가 없어요" description="이 실행의 정규화 결과를 찾지 못했어요." />}
          </section>}
        </div>
      )}
    </>
  )
}
