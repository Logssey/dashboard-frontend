import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate } from 'react-router-dom'
import { fetchSecretCases } from '@/api/secretCases'
import { SecretTaskGuidance } from '@/components/SecretTaskGuidance'
import { SecretFilterDisclosure } from '@/components/SecretFilterDisclosure'
import { useSecretListParams } from '@/lib/useSecretListParams'
import { workbenchOptions } from '@/lib/secretWorkbench'
import { caseRiskSeverityLabels, caseRiskValidityLabels } from '@/lib/secretRiskDistribution'
import { PageHeader } from '@/components/PageHeader'
import { caseAssigneeLabel, caseDetailPath, caseSearch, caseStageLabels, parseCaseFilters } from '@/lib/secretResponse'
import { positiveId, scanDate } from '@/lib/secretScan'
import './secret-response.css'
import './secret-scan.css'

export function SecretCasesPage() {
  const [params, setParams] = useSecretListParams()
  const { filters, valid } = parseCaseFilters(params)
  const client = useQueryClient()
  const detailed = filters.scope === 'currentCases' && !filters.assignmentStatus
  const legacyCase = positiveId(params.get('case'))
  const cases = useQuery({ queryKey: ['secret-cases', filters], queryFn: () => fetchSecretCases(filters), enabled: valid && !legacyCase, retry: false, refetchOnWindowFocus: false })
  useEffect(() => {
    if (!detailed || !cases.isSuccess || cases.isFetching || filters.snapshotId || !cases.data.snapshotId) return
    const next = { ...filters, snapshotId: cases.data.snapshotId }
    client.setQueryData(['secret-cases', next], cases.data)
    setParams(caseSearch(next), { replace: true })
  }, [detailed, cases.isSuccess, cases.isFetching, cases.data, filters, client, setParams])
  useEffect(() => { const focus = positiveId(params.get('focus')); if (focus && cases.isSuccess) document.getElementById(`case-link-${focus}`)?.focus() }, [params, cases.isSuccess])
  if (legacyCase) return <Navigate replace to={caseDetailPath(legacyCase, filters, positiveId(params.get('occurrence')) ?? undefined)} />
  return <><PageHeader title="대응 관리" description="확인된 노출의 위치별 담당자와 조치·재검사를 확인하세요." />
    <SecretFilterDisclosure label="대응 목록" search busy={cases.isFetching} searchRejected={params.get('searchRejected') === '1'}
      values={{ q: filters.q ?? '', scope: filters.scope, stages: filters.stages, assignmentStatus: filters.assignmentStatus, assignee: filters.assignee, source: filters.source ?? 'ALL', provider: filters.provider ?? 'ALL', environment: filters.environment ?? 'ALL', severity: filters.severity ?? 'ALL', validity: filters.validity ?? 'ALL' }}
      fields={[
        { key: 'scope', label: '조회 범위', defaultValue: 'currentCases', options: { currentCases: '현재 대응 건', history: '종료·교정 이력' } },
        { key: 'stages', label: '단계', defaultValue: '', options: { '': '전체 단계', ...caseStageLabels, ...(filters.stages.includes(',') ? { [filters.stages]: '선택된 여러 단계' } : {}) } },
        { key: 'assignmentStatus', label: '위치 배정', defaultValue: '', options: { '': '전체 배정', UNASSIGNED: '미지정 위치 있음', TEAM_ONLY: '팀 배정 위치 있음', PERSONAL: '개인 배정 위치 있음' } },
        { key: 'assignee', label: '담당 범위', defaultValue: '', options: { '': '전체 허용 건', ME: '내 배정 위치', UNASSIGNED: '미지정 위치' } },
        ...(detailed ? [
          ...(['source', 'environment', 'provider'] as const).map((key) => ({ key, label: ({ source: '발견 플랫폼', environment: '자원 환경', provider: '키 발급 서비스' })[key], options: workbenchOptions[key], defaultValue: 'ALL' })),
          { key: 'severity', label: '위험도', defaultValue: 'ALL', options: { ALL: '전체 등급', ...caseRiskSeverityLabels } },
          { key: 'validity', label: '키 유효성', defaultValue: 'ALL', options: { ALL: '전체 유효성', ...caseRiskValidityLabels } },
        ] : []),
      ]}
      onApply={(values) => setParams(caseSearch({ ...filters, ...values, scope: values.scope as typeof filters.scope, page: 0, snapshotId: '' }))}
      onReset={() => setParams(new URLSearchParams())} />
    {!detailed && <p className="caption">종료 이력과 위치 배정 조건은 현재 조회 시점의 결과예요. 단계·담당 범위·검색 조건을 적용해요.</p>}
    {!valid ? <p className="notice error" role="alert">대응 건 조회 조건이 올바르지 않아요. <Link to="/secrets/cases">조건 초기화</Link></p> : cases.isPending ? <p className="card secret-scan-message" role="status">대응 건을 불러오는 중이에요.</p> : cases.isError ? <section className="card secret-scan-message" role="alert"><p>허용된 대응 건을 불러오지 못했어요.</p><button className="btn outline" onClick={() => void cases.refetch()}>다시 조회</button></section> : <section className="card secret-scan-section"><div className="secret-response-section-heading"><h2>{filters.scope === 'history' ? '대응 이력' : '현재 대응 건'}</h2><span className="caption">조회 시각 {scanDate(cases.data.asOf)}</span></div>{cases.data.items.length === 0 ? <div className="secret-scan-message"><p>조건에 맞는 대응 건이 없어요.</p><Link to="/secrets/triage">확인 대기열 보기</Link></div> : <div className="table-scroll" tabIndex={0} role="region" aria-label="대응 건 목록"><table><thead><tr><th>대응 건·키</th><th>단계</th><th>조정 담당자</th><th>허용된 위치</th><th>최근 변경</th><th>다음 작업</th></tr></thead><tbody>{cases.data.items.map((item) => <tr key={item.caseId}><td><Link id={`case-link-${item.caseId}`} className="finding-link" to={caseDetailPath(item.caseId, filters)}>CASE-{item.caseId}</Link><span className="asset">{item.maskedLabel}</span></td><td>{caseStageLabels[item.stage] ?? '상태 확인 필요'}</td><td>{caseAssigneeLabel(item.assigneeDisplayName, item.assigneeTeam, item.assigneeUserId)}</td><td>{item.visibleOccurrenceCount}곳{item.restrictedCoverage && <span className="asset">열람 범위 기준</span>}</td><td>{item.updatedAt ? scanDate(item.updatedAt) : '변경 시각 비공개'}</td><td><SecretTaskGuidance guidance={item.taskGuidance} compact /><Link className="secret-history-detail-button" to={caseDetailPath(item.caseId, filters)}>대응 열기</Link></td></tr>)}</tbody></table></div>}<div className="table-foot secret-table-foot"><span>대응 건 {cases.data.total}건</span><div className="row"><button className="btn outline" disabled={filters.page === 0} onClick={() => setParams(caseSearch({ ...filters, page: filters.page - 1 }))}>이전</button><span>{filters.page + 1} 페이지</span><button className="btn outline" disabled={(filters.page + 1) * cases.data.size >= cases.data.total} onClick={() => setParams(caseSearch({ ...filters, page: filters.page + 1 }))}>다음</button></div></div></section>}
  </>
}
