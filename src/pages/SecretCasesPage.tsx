import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import {
  assignSecretCase, fetchSecretAssignees, fetchSecretCase, fetchSecretCases,
  type SecretAssignmentReason, type SecretCaseDetail, type SecretCaseOrigin, type SecretCaseStage,
} from '@/api/secretCases'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { SecretCaseWorkflow } from '@/components/SecretCaseWorkflow'
import { SecretCaseGuide } from '@/components/SecretCaseGuide'
import { SecretCaseRevalidation } from '@/components/SecretCaseRevalidation'
import { credentialTypeLabel, issuerLabel } from '@/lib/labels'
import './secret-cases.css'

const pageSize = 20
const koreaDate = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul',
})

const reasonLabels: Record<SecretAssignmentReason, string> = {
  INITIAL_ASSIGNMENT: '최초 지정',
  OWNERSHIP_CHANGE: '담당자 변경',
  TEAM_TRANSFER: '담당 팀 변경',
  UNASSIGNED: '담당 해제',
  OTHER: '기타 운영상 변경',
}

function stageLabel(stage: SecretCaseStage): string {
  switch (stage) {
    case 'OPEN': return '신규 및 분석'
    case 'IN_PROGRESS': return '조치 중'
    case 'REVALIDATION_PENDING': return '재검증 대기'
    case 'RESOLVED': return '해결'
    default: return '상태 확인 필요'
  }
}

function openingReasonLabel(reason: string): string {
  return reason === 'ASSESSED_EXPOSURE' ? '비정상 노출로 판정됨' : '등록 사유 확인 필요'
}

function displayDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : `${koreaDate.format(date)} KST`
}

function assigneeLabel(name: string | null, team: string | null, userId: number | null): string {
  if (userId === null) return team ? `${team} · 개인 미지정` : '미지정'
  return `${name || `사용자 #${userId}`}${team ? ` · ${team}` : ''}`
}

export function SecretCasesPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [page, setPage] = useState(0)
  const [selectedChoice, setSelectedChoice] = useState('UNASSIGNED')
  const [reason, setReason] = useState<SecretAssignmentReason | ''>('')
  const [message, setMessage] = useState<string | null>(null)
  const origin: SecretCaseOrigin = searchParams.get('origin') === 'TEST' ? 'TEST' : 'PRODUCTION'
  const rawCaseId = searchParams.get('case')
  const parsedCaseId = rawCaseId && /^\d+$/.test(rawCaseId) ? Number(rawCaseId) : null
  const caseId = parsedCaseId && Number.isSafeInteger(parsedCaseId) && parsedCaseId > 0 ? parsedCaseId : null

  const cases = useQuery({
    queryKey: ['secret-cases', origin, page],
    queryFn: () => fetchSecretCases(page, pageSize, origin),
  })
  const detail = useQuery({
    queryKey: ['secret-case', caseId],
    queryFn: () => fetchSecretCase(caseId!),
    enabled: caseId !== null,
  })
  const assignees = useQuery({
    queryKey: ['secret-assignees', caseId],
    queryFn: () => fetchSecretAssignees(caseId!),
    enabled: caseId !== null && detail.data?.caseOrigin === origin,
  })
  const teamChoices = Array.from(new Set(assignees.data?.items.map((item) => item.team).filter((team): team is string => Boolean(team)) ?? []))

  useEffect(() => {
    setMessage(null)
  }, [caseId])

  useEffect(() => {
    if (!detail.data || !assignees.data) return
    const index = assignees.data.items.findIndex((item) =>
      item.userId === detail.data.assigneeUserId && item.team === detail.data.assigneeTeam)
    const teamIndex = teamChoices.indexOf(detail.data.assigneeTeam ?? '')
    setSelectedChoice(detail.data.assigneeUserId !== null
      ? index >= 0 ? String(index) : 'KEEP'
      : detail.data.assigneeTeam !== null ? teamIndex >= 0 ? `TEAM:${teamIndex}` : 'KEEP' : 'UNASSIGNED')
    setReason('')
  }, [detail.data?.caseId, detail.data?.version, assignees.data])

  const selectedAssignee = /^\d+$/.test(selectedChoice) ? assignees.data?.items[Number(selectedChoice)] : null
  const selectedTeam = /^TEAM:\d+$/.test(selectedChoice) ? teamChoices[Number(selectedChoice.slice(5))] : null
  const nextUserId = selectedChoice === 'UNASSIGNED' || selectedTeam ? null : selectedAssignee?.userId ?? null
  const nextTeam = selectedChoice === 'UNASSIGNED' ? null : selectedTeam ?? selectedAssignee?.team ?? null
  const isChanged = detail.data && selectedChoice !== 'KEEP'
    && (nextUserId !== detail.data.assigneeUserId || nextTeam !== detail.data.assigneeTeam)

  const assignment = useMutation({
    mutationFn: () => {
      if (!detail.data || !reason || !isChanged) throw new Error('담당자와 변경 사유를 확인해 주세요.')
      return assignSecretCase(detail.data.caseId, {
        team: nextTeam, assigneeUserId: nextUserId, reason, expectedVersion: detail.data.version,
      })
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['secret-case', updated.caseId], updated)
      void queryClient.invalidateQueries({ queryKey: ['secret-cases'] })
      setMessage('담당자 변경이 저장됐어요. 변경 이력에서 확인할 수 있어요.')
    },
    onError: (error) => {
      setMessage(null)
      if (error instanceof ApiError && error.status === 409) {
        void detail.refetch()
        void queryClient.invalidateQueries({ queryKey: ['secret-cases'] })
      }
    },
  })

  const submitAssignment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    assignment.mutate()
  }

  const selectCase = (selectedCaseId: number | null) => {
    const params = new URLSearchParams()
    if (origin === 'TEST') params.set('origin', 'TEST')
    if (selectedCaseId !== null) params.set('case', String(selectedCaseId))
    setSearchParams(params)
    assignment.reset()
  }

  const switchOrigin = (nextOrigin: SecretCaseOrigin) => {
    setPage(0)
    setSearchParams(nextOrigin === 'TEST' ? { origin: 'TEST' } : {})
    assignment.reset()
  }

  const pageCount = cases.data ? Math.ceil(cases.data.total / pageSize) : 0
  const acceptUpdatedCase = (updated: SecretCaseDetail) => {
    queryClient.setQueryData(['secret-case', updated.caseId], updated)
    void queryClient.invalidateQueries({ queryKey: ['secret-cases'] })
  }
  const refreshSelectedCase = () => {
    void detail.refetch()
    void queryClient.invalidateQueries({ queryKey: ['secret-cases'] })
  }

  return <>
    <PageHeader title="대응 관리" description="노출 근거 검토부터 외부 조치, 재검증과 해결까지 기록해요." actions={
      <div className="row secret-case-header-actions">
        <Link className="btn outline" to="/secrets/triage">수동 노출 판정 · 보안 담당자</Link>
        <div className="secret-case-origin-switch" role="group" aria-label="대응 건 구분">
          <button className={`btn ${origin === 'PRODUCTION' ? 'primary' : 'outline'}`} type="button" aria-pressed={origin === 'PRODUCTION'} onClick={() => switchOrigin('PRODUCTION')}>운영 대응 건</button>
          <button className={`btn ${origin === 'TEST' ? 'primary' : 'outline'}`} type="button" aria-pressed={origin === 'TEST'} onClick={() => switchOrigin('TEST')}>테스트 대응 건</button>
        </div>
      </div>
    } />
    {origin === 'TEST' && <p className="secret-case-test-banner" role="note"><strong>TEST · 테스트 대응 건</strong><span>시험 데이터의 담당자 지정 흐름을 확인하는 화면이에요. 운영 대응 건 목록과 분리돼요.</span></p>}
    <p className="notice secret-case-scope-note">키 후보나 AWS 보관소의 값 존재만으로 대응 건을 만들지 않아요. 노출 여부가 확인된 건만 이 목록에 표시돼요.</p>

    <section className="card list-card secret-cases-list" aria-labelledby="secret-cases-title">
      <div className="card-head"><div>
        <h2 id="secret-cases-title">{origin === 'TEST' ? '테스트 대응 건' : '운영 대응 건'}</h2>
        <p className="caption">현재 등록된 대응 건 {cases.isSuccess ? `${cases.data.total}건` : '조회 중'}</p>
      </div></div>
      {cases.isPending ? <div className="secret-cases-loading"><div className="skeleton" /></div>
        : cases.isError ? <p className="notice error secret-cases-error" role="alert">{
          cases.error instanceof ApiError && cases.error.status === 403
            ? 'Secret 대응 건 조회 권한이 없어요. 담당자 역할 부여 상태를 확인해 주세요.'
            : '대응 건을 불러오지 못했어요.'
        } <button className="btn outline" onClick={() => void cases.refetch()}>다시 조회</button></p>
          : cases.data.items.length === 0 ? <>
            <EmptyState title={origin === 'TEST' ? '테스트 대응 건이 없어요' : '아직 운영 대응 건이 없어요'} description={origin === 'TEST' ? '별도로 등록된 시험 대응 건만 여기에 나타나요.' : '노출 여부가 확인되어 등록된 운영 대응 건이 여기에 나타나요.'} />
            {origin === 'PRODUCTION' && <p className="secret-cases-empty-link"><Link to="/secrets/findings">탐지 기록 확인하기</Link></p>}
          </> : <div className="table-scroll" tabIndex={0} role="region" aria-label="시크릿 대응 건 목록. 좁은 화면에서는 가로로 스크롤하세요.">
            <table><thead><tr>
              <th scope="col">대응 건</th><th scope="col">발급자·유형</th><th scope="col">단계</th>
              <th scope="col">담당자</th><th scope="col">최근 변경</th><th scope="col"><span className="sr-only">상세</span></th>
            </tr></thead><tbody>
              {cases.data.items.map((item) => <tr key={item.caseId}>
                <td><strong>CASE-{item.caseId}</strong>{item.caseOrigin === 'TEST' && <span className="secret-case-test-badge">TEST</span>}<span className="asset">{item.maskedLabel || '마스킹된 키'}</span></td>
                <td>{issuerLabel[item.issuer]}<span className="asset">{credentialTypeLabel(item.credentialType)}</span></td>
                <td><span className={`secret-case-stage ${item.stage.toLowerCase()}`}>{stageLabel(item.stage)}</span></td>
                <td>{assigneeLabel(item.assigneeDisplayName, item.assigneeTeam, item.assigneeUserId)}</td>
                <td>{displayDate(item.updatedAt)}</td>
                <td><button className="secret-case-detail-button" type="button" onClick={() => selectCase(item.caseId)}>상세 보기</button></td>
              </tr>)}
            </tbody></table>
          </div>}
      {cases.isSuccess && cases.data.total > 0 && <div className="table-foot secret-cases-foot">
        <span>전체 {cases.data.total}건 중 {cases.data.items.length}건 표시</span>
        {(pageCount > 1 || page > 0) && <div className="row">
          <button className="btn outline" disabled={page === 0} onClick={() => { setPage(page - 1); selectCase(null) }}>이전</button>
          <span>{page + 1} / {Math.max(pageCount, 1)}</span>
            <button className="btn outline" disabled={page + 1 >= pageCount} onClick={() => { setPage(page + 1); selectCase(null) }}>다음</button>
        </div>}
      </div>}
    </section>

    {caseId !== null && <section className="card secret-case-detail" aria-labelledby="secret-case-detail-title">
      <div className="card-head"><h2 id="secret-case-detail-title">CASE-{caseId} 상세 {detail.data?.caseOrigin === 'TEST' && <span className="secret-case-test-badge">TEST</span>}</h2>
        <button className="btn outline" type="button" onClick={() => selectCase(null)}>닫기</button></div>
      {detail.isPending ? <div className="skeleton" />
        : detail.isError ? <p className="notice error" role="alert">대응 건 상세를 불러오지 못했어요. <button className="btn outline" onClick={() => void detail.refetch()}>다시 조회</button></p>
          : <>
            {detail.data.caseOrigin !== origin && <p className="notice secret-case-origin-mismatch" role="note">
              이 건은 {detail.data.caseOrigin === 'TEST' ? '테스트' : '운영'} 대응 건이에요. 현재 목록과 구분이 달라요.
              <button className="btn outline" type="button" onClick={() => {
                setPage(0)
                setSearchParams(detail.data.caseOrigin === 'TEST' ? { origin: 'TEST', case: String(caseId) } : { case: String(caseId) })
              }}>해당 목록으로 전환</button>
            </p>}
            <dl className="facts secret-case-facts">
              <dt>마스킹된 키</dt><dd>{detail.data.maskedLabel || '마스킹된 키'}</dd>
              <dt>발급자·유형</dt><dd>{issuerLabel[detail.data.issuer]} · {credentialTypeLabel(detail.data.credentialType)}</dd>
              <dt>대응 단계</dt><dd>{stageLabel(detail.data.stage)}</dd>
              <dt>보안 검토</dt><dd>{detail.data.reviewStatus === 'REVIEWED' ? '검토 완료' : '검토 전'}</dd>
              <dt>현재 담당자</dt><dd>{assigneeLabel(detail.data.assigneeDisplayName, detail.data.assigneeTeam, detail.data.assigneeUserId)}</dd>
              <dt>등록 시각</dt><dd>{displayDate(detail.data.createdAt)}</dd>
              <dt>최근 변경</dt><dd>{displayDate(detail.data.updatedAt)}</dd>
            </dl>
            <div className="secret-case-opening-evidence">
              <p><strong>대응 건 등록 근거</strong><span>발견 위치 #{detail.data.openingOccurrenceId} · {openingReasonLabel(detail.data.openingReason)}</span></p>
              <Link className="btn outline" to={`/secrets/triage/${detail.data.secretId}?occurrence=${detail.data.openingOccurrenceId}`}>판정 근거 보기 · 보안 담당자 전용</Link>
            </div>

            {detail.data.caseOrigin === origin && <form className="secret-case-assignment-form" onSubmit={submitAssignment}>
              <h3>담당자 지정·변경</h3>
              <p className="caption">실제 권한이 부여된 담당자만 선택할 수 있어요. 변경자와 시각은 자동으로 기록돼요.</p>
              {assignees.isPending ? <p className="caption">담당자 목록을 확인하는 중이에요.</p>
                : assignees.isError ? <p className="notice error" role="alert">{
                  assignees.error instanceof ApiError && assignees.error.status === 403
                    ? '담당자 지정은 Secret 보안 담당자 권한이 필요해요.'
                    : '지정 가능한 담당자를 불러오지 못했어요.'
                } <button className="btn outline" type="button" onClick={() => void assignees.refetch()}>다시 조회</button></p>
                  : <>
                    {assignees.data.items.length === 0 && <p className="notice">이 건에 지정할 수 있는 계정이 아직 없어요. 관리자에게 Secret 담당자 권한 부여를 요청해 주세요.</p>}
                    <label className="field" htmlFor="secret-case-assignee">담당자
                      <select className="select" id="secret-case-assignee" value={selectedChoice} onChange={(event) => { setSelectedChoice(event.target.value); assignment.reset(); setMessage(null) }}>
                        {selectedChoice === 'KEEP' && <option value="KEEP" disabled>현재 담당자 · 선택 가능한 목록에 없음</option>}
                        <option value="UNASSIGNED">미지정</option>
                        {teamChoices.map((team, index) => <option value={`TEAM:${index}`} key={`team-${team}`}>{team} · 팀만 지정</option>)}
                        {assignees.data.items.map((item, index) => <option value={String(index)} key={`${item.userId}-${item.team ?? ''}-${index}`}>
                          {item.displayName}{item.team ? ` · ${item.team}` : ''}
                        </option>)}
                      </select>
                    </label>
                    <label className="field" htmlFor="secret-case-reason">변경 사유
                      <select className="select" id="secret-case-reason" value={reason} onChange={(event) => { setReason(event.target.value as SecretAssignmentReason | ''); assignment.reset(); setMessage(null) }} required>
                        <option value="">사유 선택</option>
                        {(Object.keys(reasonLabels) as SecretAssignmentReason[]).map((code) => <option value={code} key={code}>{reasonLabels[code]}</option>)}
                      </select>
                    </label>
                    <button className="btn primary" type="submit" disabled={!isChanged || !reason || assignment.isPending}>
                      {assignment.isPending ? '저장 중…' : '담당자 변경 저장'}
                    </button>
                  </>}
              {message && <p className="notice" role="status">{message}</p>}
              {assignment.isError && <p className="notice error" role="alert">{
                assignment.error instanceof ApiError && assignment.error.status === 409
                  ? '다른 변경이 먼저 저장됐어요. 최신 상태를 다시 불러왔으니 담당자를 확인해 주세요.'
                  : assignment.error instanceof ApiError && assignment.error.status === 403
                    ? '이 대응 건의 담당자를 변경할 권한이 없어요.'
                    : '담당자 변경을 저장하지 못했어요. 선택한 담당자의 권한을 확인해 주세요.'
              }</p>}
            </form>}

            {detail.data.caseOrigin === origin && <SecretCaseGuide key={detail.data.caseId} detail={detail.data} />}
            {detail.data.caseOrigin === origin && <SecretCaseWorkflow key={detail.data.caseId} detail={detail.data} onUpdated={acceptUpdatedCase} onConflict={refreshSelectedCase} />}
            {detail.data.caseOrigin === origin && <SecretCaseRevalidation key={detail.data.caseId} detail={detail.data} onUpdated={acceptUpdatedCase} onRefresh={refreshSelectedCase} />}

            <div className="secret-case-audit">
              <h3>담당자 변경 이력</h3>
              {detail.data.assignmentHistory.length === 0 ? <p className="caption">아직 담당자 변경 기록이 없어요.</p>
                : <ol>{detail.data.assignmentHistory.map((change, index) => <li key={`${change.changedAt}-${index}`}>
                  <strong>{displayDate(change.changedAt)}</strong>
                  <span>{assigneeLabel(change.previousAssigneeDisplayName, change.previousTeam, change.previousUserId)}
                    {' → '}{assigneeLabel(change.newAssigneeDisplayName, change.newTeam, change.newUserId)}</span>
                  <span className="caption">변경: {change.changedByDisplayName || `사용자 #${change.changedByUserId}`} · 사유: {reasonLabels[change.reason] ?? '운영상 변경'}</span>
                </li>)}</ol>}
            </div>
          </>}
    </section>}
  </>
}
