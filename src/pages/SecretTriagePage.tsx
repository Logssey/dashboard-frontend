import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import type { SecretCaseOrigin } from '@/api/secretCases'
import {
  assessSecretOccurrence, classifySecretScope, fetchSecretOccurrenceTriage,
  fetchSecretScopeOrigin, fetchSecretTriageCandidateDetail, openSecretResponseCase,
  type SecretAssessmentReason, type SecretExposureDecision, type SecretResponseOrigin, type SecretScopeReason,
} from '@/api/secretTriage'
import { PageHeader } from '@/components/PageHeader'
import { componentStateLabel, credentialTypeLabel, issuerLabel, secretEnvironmentLabel } from '@/lib/labels'
import './secret-triage.css'

const koreaDate = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul',
})

const assessmentReasonLabels: Record<SecretAssessmentReason, string> = {
  UNAPPROVED_SOURCE_LOCATION: '승인되지 않은 저장 위치를 확인함',
  SIMULATED_EXPOSURE: '시험 시뮬레이션에서 비정상 노출로 지정함',
  AUTHORIZED_LOCATION: '승인된 위치의 정상 보관으로 확인함',
}

const scopeReasonLabels: Record<SecretScopeReason, string> = {
  APPROVED_TEST_FIXTURE: '승인된 시험 자료',
  APPROVED_PRODUCTION_SOURCE: '승인된 운영 출처',
}

function displayDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : `${koreaDate.format(date)} KST`
}

function exposureLabel(status: string): string {
  switch (status) {
    case 'ABNORMAL': return '비정상 노출 판정'
    case 'NORMAL': return '정상 보관 판정'
    default: return '노출 여부 미확인'
  }
}

function originLabel(origin: SecretResponseOrigin): string {
  switch (origin) {
    case 'TEST': return 'TEST · 시험 범위'
    case 'PRODUCTION': return 'PRODUCTION · 운영 범위'
    default: return '미분류'
  }
}

function mutationError(error: Error | null, action: string): string | null {
  if (!error) return null
  if (error instanceof ApiError) {
    if (error.status === 403) return `${action} 권한이 없어요. 이 연결의 Secret 보안 담당자 권한을 확인해 주세요.`
    if (error.status === 409) return '사이에 판정이나 범위 상태가 바뀌었어요. 최신 정보를 다시 불러왔으니 확인해 주세요.'
    if (error.status === 404) return '선택한 위치나 범위를 찾을 수 없어요. 판정 후보 목록을 다시 확인해 주세요.'
  }
  return `${action} 요청을 처리하지 못했어요. 근거와 현재 상태를 다시 확인해 주세요.`
}

export function SecretTriagePage() {
  const { secretId: rawSecretId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const parsedSecretId = rawSecretId && /^\d+$/.test(rawSecretId) ? Number(rawSecretId) : null
  const secretId = parsedSecretId && Number.isSafeInteger(parsedSecretId) && parsedSecretId > 0 ? parsedSecretId : null
  const rawOccurrenceId = searchParams.get('occurrence')
  const parsedOccurrenceId = rawOccurrenceId && /^\d+$/.test(rawOccurrenceId) ? Number(rawOccurrenceId) : null
  const occurrenceId = parsedOccurrenceId && Number.isSafeInteger(parsedOccurrenceId) && parsedOccurrenceId > 0 ? parsedOccurrenceId : null
  const [requestedOrigin, setRequestedOrigin] = useState<SecretCaseOrigin | ''>('')
  const [confirmScope, setConfirmScope] = useState(false)
  const [selectedFindingId, setSelectedFindingId] = useState('')
  const [decision, setDecision] = useState<SecretExposureDecision | ''>('')
  const [assessmentReason, setAssessmentReason] = useState<SecretAssessmentReason | ''>('')
  const [confirmAssessment, setConfirmAssessment] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const secret = useQuery({
    queryKey: ['secret-triage-candidate', secretId],
    queryFn: () => fetchSecretTriageCandidateDetail(secretId!),
    enabled: secretId !== null,
  })
  const selectedOccurrence = secret.data?.occurrences.find((item) => item.id === occurrenceId)
  const triage = useQuery({
    queryKey: ['secret-occurrence-triage', occurrenceId],
    queryFn: () => fetchSecretOccurrenceTriage(occurrenceId!),
    enabled: secretId !== null && selectedOccurrence !== undefined,
  })
  const validTriage = triage.data?.secretId === secretId && triage.data?.occurrenceId === occurrenceId ? triage.data : null
  const scope = useQuery({
    queryKey: ['secret-scope-origin', validTriage?.scopeId],
    queryFn: () => fetchSecretScopeOrigin(validTriage!.scopeId),
    enabled: validTriage !== null,
  })
  const validScope = scope.data && validTriage
    && scope.data.scopeId === validTriage.scopeId && scope.data.connectionId === validTriage.connectionId ? scope.data : null
  const originIsFresh = validScope !== null && validTriage !== null
    && validScope.responseOriginVersion === validTriage.scopeOriginVersion
    && validScope.responseOrigin === validTriage.scopeOrigin

  useEffect(() => {
    setRequestedOrigin('')
    setConfirmScope(false)
    setSelectedFindingId('')
    setDecision('')
    setAssessmentReason('')
    setConfirmAssessment(false)
    setConfirmOpen(false)
    setSuccessMessage(null)
  }, [secretId, occurrenceId])

  const classify = useMutation({
    mutationFn: () => {
      if (!validScope || !requestedOrigin || !validScope.allowedOrigins.includes(requestedOrigin) || !confirmScope) {
        throw new Error('서버에서 허용한 범위 구분을 확인해 주세요.')
      }
      return classifySecretScope(validScope.scopeId, requestedOrigin, validScope.responseOriginVersion)
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['secret-scope-origin', updated.scopeId], updated)
      void queryClient.invalidateQueries({ queryKey: ['secret-occurrence-triage', occurrenceId] })
      setConfirmScope(false)
      setRequestedOrigin('')
      setSuccessMessage('범위 구분을 저장했어요. 노출 판정은 별도로 진행해 주세요.')
    },
    onError: (error) => {
      setSuccessMessage(null)
      if (error instanceof ApiError && error.status === 409) {
        setConfirmScope(false)
        void scope.refetch()
        void triage.refetch()
      }
    },
  })

  const assess = useMutation({
    mutationFn: () => {
      if (!validTriage || validTriage.openCaseId !== null || !selectedFindingId || !decision || !assessmentReason || !confirmAssessment || !originIsFresh) {
        throw new Error('판정 근거와 범위 상태를 확인해 주세요.')
      }
      return assessSecretOccurrence(validTriage.occurrenceId, {
        decision, reasonCode: assessmentReason, findingId: Number(selectedFindingId),
        expectedVersion: validTriage.assessmentVersion,
      })
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['secret-occurrence-triage', updated.occurrenceId], updated)
      void queryClient.invalidateQueries({ queryKey: ['secret-triage-candidate', secretId] })
      setConfirmAssessment(false)
      setConfirmOpen(false)
      setSuccessMessage('노출 판정을 저장했어요. 대응 건 생성은 별도 단계예요.')
    },
    onError: (error) => {
      setSuccessMessage(null)
      if (error instanceof ApiError && error.status === 409) {
        setConfirmAssessment(false)
        setConfirmOpen(false)
        void triage.refetch()
        void scope.refetch()
      }
    },
  })

  const openCase = useMutation({
    mutationFn: () => {
      if (!secretId || !validTriage || validTriage.openCaseId !== null || !validScope || !originIsFresh || !confirmOpen) {
        throw new Error('판정과 범위 구분을 다시 확인해 주세요.')
      }
      return openSecretResponseCase(secretId, validTriage.occurrenceId,
        validTriage.assessmentVersion, validScope.responseOriginVersion)
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['secret-cases'] })
      navigate(`/secrets/cases?origin=${created.caseOrigin}&case=${created.caseId}`)
    },
    onError: (error) => {
      setSuccessMessage(null)
      if (error instanceof ApiError && error.status === 409) {
        setConfirmOpen(false)
        void triage.refetch()
        void scope.refetch()
      }
    },
  })

  const reasonOptions: SecretAssessmentReason[] = decision === 'NORMAL' ? ['AUTHORIZED_LOCATION']
    : decision === 'ABNORMAL' && validScope?.responseOrigin === 'TEST'
      ? ['SIMULATED_EXPOSURE', 'UNAPPROVED_SOURCE_LOCATION']
      : decision === 'ABNORMAL' && validScope?.responseOrigin === 'PRODUCTION'
        ? ['UNAPPROVED_SOURCE_LOCATION'] : []
  const findingId = Number(selectedFindingId)
  const findingSelected = validTriage?.findings.some((item) => item.findingId === findingId) ?? false
  const canAssess = validTriage?.componentState === 'CONFIRMED' && validTriage.presenceStatus === 'PRESENT'
    && validTriage.openCaseId === null && validScope?.responseOrigin !== 'UNCLASSIFIED' && originIsFresh && findingSelected
    && decision !== '' && reasonOptions.includes(assessmentReason as SecretAssessmentReason) && confirmAssessment
  const canOpen = validTriage?.componentState === 'CONFIRMED' && validTriage.presenceStatus === 'PRESENT'
    && validTriage.exposureStatus === 'ABNORMAL' && validTriage.history.length > 0
    && validTriage.openCaseId === null && validScope?.responseOrigin !== 'UNCLASSIFIED' && originIsFresh

  if (secretId === null) return <p className="notice error" role="alert">올바른 시크릿 ID가 아니에요. <Link to="/secrets/triage">판정 후보로 돌아가기</Link></p>

  return <>
    <PageHeader title="노출 판정" description="발견 위치와 승인 범위를 확인하고, 근거를 남긴 뒤 대응 건을 생성해요." actions={
      <Link className="btn outline" to="/secrets/triage">판정 후보로</Link>
    } />
    <p className="notice secret-triage-intro">형식 탐지는 키 후보를 찾은 근거예요. 비정상 노출 판정은 보안 담당자가 저장 위치와 승인 범위를 따로 검토해 기록해요. 키 원문을 입력하는 칸은 없어요.</p>

    <section className="card secret-triage-section" aria-labelledby="secret-triage-target-title">
      <div className="secret-triage-heading"><span className="secret-triage-step">1</span><div>
        <h2 id="secret-triage-target-title">검토할 발견 위치 선택</h2>
        <p className="caption">같은 키도 여러 곳에 발견될 수 있어요. 위치마다 노출을 따로 판정해요.</p>
      </div></div>
      {secret.isPending ? <div className="skeleton" />
        : secret.isError ? <p className="notice error" role="alert">{
          secret.error instanceof ApiError && secret.error.status === 403
            ? '이 키의 판정 후보를 조회할 Secret 보안 담당자 권한이 없어요.'
            : '판정 후보를 불러오지 못했어요.'
        } <button className="btn outline" onClick={() => void secret.refetch()}>다시 조회</button></p>
          : <>
            <p className="secret-triage-key"><strong>{secret.data.maskedLabel || '마스킹된 키'}</strong><span>{issuerLabel[secret.data.issuer]} · {credentialTypeLabel(secret.data.credentialType)} · {componentStateLabel[secret.data.componentState]}</span></p>
            {secret.data.componentState !== 'CONFIRMED' && <p className="notice">구성 요소가 확인된 키만 수동 노출 판정 대상이에요. 이 항목은 발견 근거를 검토만 할 수 있어요.</p>}
            {secret.data.occurrences.length === 0 ? <p className="notice">선택할 발견 위치가 없어요.</p>
              : <label className="field" htmlFor="secret-triage-occurrence">발견 위치
                  <select className="select" id="secret-triage-occurrence" value={occurrenceId ?? ''} onChange={(event) => setSearchParams(event.target.value ? { occurrence: event.target.value } : {})}>
                    <option value="">위치를 선택해 주세요</option>
                    {secret.data.occurrences.map((item) => <option value={item.id} key={item.id}>
                      위치 #{item.id} · {item.sourceObjectRef} · {item.locationKey || '세부 위치 미확인'}{item.presenceStatus !== 'PRESENT' ? ' · 현재 존재 미확인' : ''}
                    </option>)}
                  </select>
                </label>}
            {occurrenceId !== null && !selectedOccurrence && <p className="notice error" role="alert">이 키에 속한 발견 위치가 아니에요. 목록에서 다시 선택해 주세요.</p>}
            {selectedOccurrence && <p className="secret-triage-location-note">현재 상태: {exposureLabel(selectedOccurrence.exposureStatus)} · 존재 {selectedOccurrence.presenceStatus === 'PRESENT' ? '확인' : '미확인'} · 환경 {secretEnvironmentLabel[selectedOccurrence.environment]}</p>}
          </>}
    </section>

    {selectedOccurrence && <>
      {triage.isPending ? <section className="card secret-triage-section"><div className="skeleton" /></section>
        : triage.isError || !validTriage ? <p className="notice error secret-triage-error" role="alert">{
          triage.error instanceof ApiError && triage.error.status === 403
            ? '이 위치를 판정할 Secret 보안 담당자 권한이 없어요.' : '판정 자료를 불러오지 못했어요.'
        } <button className="btn outline" onClick={() => void triage.refetch()}>다시 조회</button></p>
          : <>
            <section className="card secret-triage-section" aria-labelledby="secret-triage-scope-title">
              <div className="secret-triage-heading"><span className="secret-triage-step">2</span><div>
                <h2 id="secret-triage-scope-title">승인 범위 구분</h2>
                <p className="caption">이 발견 위치가 속한 승인 범위를 TEST 또는 PRODUCTION으로 한 번 분류해요.</p>
              </div></div>
              {scope.isPending ? <div className="skeleton" />
                : scope.isError || !validScope ? <p className="notice error" role="alert">범위 구분을 불러오지 못했어요. 권한과 연결 상태를 확인해 주세요. <button className="btn outline" onClick={() => void scope.refetch()}>다시 조회</button></p>
                  : <>
                    <p className="secret-triage-current">승인 범위 #{validScope.scopeId} · <strong>{originLabel(validScope.responseOrigin)}</strong></p>
                    <p className="secret-triage-scope-key">범위 식별자: <code>{validScope.scopeKey}</code></p>
                    {validScope.responseOrigin === 'UNCLASSIFIED' ? <>
                      <p className="notice">범위가 미분류라서 아직 노출 판정이나 대응 건 생성을 진행할 수 없어요. TEST는 승인된 시험 자료, PRODUCTION은 실제 운영 출처일 때만 선택해요.</p>
                      <label className="field" htmlFor="secret-triage-origin">범위 구분
                        <select className="select" id="secret-triage-origin" value={requestedOrigin} onChange={(event) => { setRequestedOrigin(event.target.value as SecretCaseOrigin | ''); setConfirmScope(false); classify.reset() }}>
                          <option value="">구분을 선택해 주세요</option>
                          {validScope.allowedOrigins.includes('TEST') && <option value="TEST">TEST · 승인된 시험 자료</option>}
                          {validScope.allowedOrigins.includes('PRODUCTION') && <option value="PRODUCTION">PRODUCTION · 승인된 운영 출처</option>}
                        </select>
                      </label>
                      {requestedOrigin && <p className="secret-triage-reason">기록 사유: {requestedOrigin === 'TEST' ? '승인된 시험 자료로 확인' : '승인된 운영 출처로 확인'}</p>}
                      <label className="secret-triage-confirm"><input type="checkbox" checked={confirmScope} onChange={(event) => setConfirmScope(event.target.checked)} /> 이 구분이 해당 승인 범위 전체에 적용되고 나중에 변경할 수 없음을 확인했어요.</label>
                      {validScope.allowedOrigins.length === 0 && <p className="notice">현재 서버에서 이 범위의 구분을 허용하지 않아요.</p>}
                      <button className="btn primary" type="button" disabled={!requestedOrigin || !validScope.allowedOrigins.includes(requestedOrigin) || !confirmScope || classify.isPending} onClick={() => classify.mutate()}>{classify.isPending ? '저장 중…' : '범위 구분 저장'}</button>
                    </> : <>
                      {validScope.responseOrigin === 'TEST' && <p className="secret-triage-test-banner"><strong>TEST</strong> 시험용 범위예요. 이 범위의 대응 건은 운영 건수에 포함하지 않아요.</p>}
                      <p className="caption">분류: 사용자 #{validScope.classifiedByUserId ?? '—'} · {displayDate(validScope.classifiedAt)}</p>
                    </>}
                    {mutationError(classify.error, '범위 구분') && <p className="notice error" role="alert">{mutationError(classify.error, '범위 구분')}</p>}
                    {validScope.history.length > 0 && <details className="secret-triage-history"><summary>범위 구분 이력 {validScope.history.length}건</summary><ul>
                      {validScope.history.map((item, index) => <li key={`${item.decidedAt}-${index}`}>{originLabel(item.fromOrigin)} → {originLabel(item.toOrigin)} · 사유: {scopeReasonLabels[item.reasonCode] ?? '확인 필요'} · 사용자 #{item.actorUserId} · {displayDate(item.decidedAt)}</li>)}
                    </ul></details>}
                  </>}
            </section>

            <section className="card secret-triage-section" aria-labelledby="secret-triage-assessment-title">
              <div className="secret-triage-heading"><span className="secret-triage-step">3</span><div>
                <h2 id="secret-triage-assessment-title">노출 판정</h2>
                <p className="caption">형식 탐지 기록을 선택하고, 저장 위치에 대한 판단 사유를 별도로 남겨요.</p>
              </div></div>
              <p className="secret-triage-current">현재 판정: <strong>{exposureLabel(validTriage.exposureStatus)}</strong> · 현재 존재: {validTriage.presenceStatus === 'PRESENT' ? '확인' : '미확인'}</p>
              <p className="notice">아래 탐지 기록은 형식이 일치했다는 근거예요. 이것만으로 노출·유효성·심각도를 확정하지 않아요.</p>
              {validTriage.findings.length === 0 ? <p className="notice">이 위치에 연결된 형식 탐지 기록이 없어 판정할 수 없어요.</p>
                : <>
                  <label className="field" htmlFor="secret-triage-finding">형식 탐지 근거
                    <select className="select" id="secret-triage-finding" value={selectedFindingId} onChange={(event) => { setSelectedFindingId(event.target.value); setConfirmAssessment(false); assess.reset() }}>
                      <option value="">탐지 기록을 선택해 주세요</option>
                      {validTriage.findings.map((item) => <option value={item.findingId} key={item.findingId}>탐지 #{item.findingId} · {item.ruleId} · {displayDate(item.detectedAt)}</option>)}
                    </select>
                  </label>
                  <label className="field" htmlFor="secret-triage-decision">위치 노출 판정
                    <select className="select" id="secret-triage-decision" value={decision} onChange={(event) => { setDecision(event.target.value as SecretExposureDecision | ''); setAssessmentReason(''); setConfirmAssessment(false); assess.reset() }}>
                      <option value="">판정을 선택해 주세요</option>
                      <option value="ABNORMAL">비정상 노출</option>
                      <option value="NORMAL">정상 보관</option>
                    </select>
                  </label>
                  {decision && <label className="field" htmlFor="secret-triage-assessment-reason">판정 사유
                    <select className="select" id="secret-triage-assessment-reason" value={assessmentReason} onChange={(event) => { setAssessmentReason(event.target.value as SecretAssessmentReason | ''); setConfirmAssessment(false); assess.reset() }}>
                      <option value="">사유를 선택해 주세요</option>
                      {reasonOptions.map((item) => <option value={item} key={item}>{assessmentReasonLabels[item]}</option>)}
                    </select>
                  </label>}
                  {validScope?.responseOrigin === 'UNCLASSIFIED' && <p className="notice">먼저 위에서 승인 범위를 구분해 주세요.</p>}
                  {validTriage.presenceStatus !== 'PRESENT' && <p className="notice">현재 존재가 확인되지 않은 위치는 판정할 수 없어요.</p>}
                  {validTriage.openCaseId !== null && <p className="notice">이미 대응 건이 열린 키예요. 이 화면에서 재판정할 수 없어요.</p>}
                  {!originIsFresh && validScope && <p className="notice">범위 정보가 갱신되는 중이에요. 최신 상태를 확인해 주세요.</p>}
                  <label className="secret-triage-confirm"><input type="checkbox" checked={confirmAssessment} onChange={(event) => setConfirmAssessment(event.target.checked)} /> 형식 탐지와 노출 판정을 구분해 검토했고, 선택한 사유가 이 위치에 해당함을 확인했어요.</label>
                  <button className="btn primary" type="button" disabled={!canAssess || assess.isPending} onClick={() => assess.mutate()}>{assess.isPending ? '저장 중…' : '노출 판정 저장'}</button>
                  {mutationError(assess.error, '노출 판정') && <p className="notice error" role="alert">{mutationError(assess.error, '노출 판정')}</p>}
                </>}
              {validTriage.history.length > 0 && <details className="secret-triage-history" open><summary>위치 판정 이력 {validTriage.history.length}건</summary><ul>
                {validTriage.history.map((item) => <li key={item.assessmentId}>{displayDate(item.assessedAt)} · {exposureLabel(item.fromStatus)} → {exposureLabel(item.decision)} · {assessmentReasonLabels[item.reasonCode] ?? '사유 확인 필요'} · 탐지 #{item.findingId} ({item.findingRuleId}) · 사용자 #{item.actorUserId}</li>)}
              </ul></details>}
            </section>

            <section className="card secret-triage-section" aria-labelledby="secret-triage-case-title">
              <div className="secret-triage-heading"><span className="secret-triage-step">4</span><div>
                <h2 id="secret-triage-case-title">대응 건 생성</h2>
                <p className="caption">저장된 비정상 노출 판정과 범위 구분을 확인한 뒤 별도로 등록해요.</p>
              </div></div>
              {validTriage.openCaseId !== null && validScope?.responseOrigin !== 'UNCLASSIFIED' ? <p className="notice">이 키와 범위 구분에는 이미 대응 건이 있어요. <Link to={`/secrets/cases?origin=${validScope!.responseOrigin}&case=${validTriage.openCaseId}`}>CASE-{validTriage.openCaseId} 상세 보기</Link></p>
                : canOpen ? <>
                <p className="secret-triage-current">발견 위치 #{validTriage.occurrenceId} · {originLabel(validScope!.responseOrigin)} · {exposureLabel(validTriage.exposureStatus)}</p>
                {validScope!.responseOrigin === 'TEST' && <p className="secret-triage-test-banner"><strong>TEST</strong> 시험 대응 건으로 등록돼요. 운영 현황에는 포함하지 않아요.</p>}
                <label className="secret-triage-confirm"><input type="checkbox" checked={confirmOpen} onChange={(event) => setConfirmOpen(event.target.checked)} /> 저장된 판정과 범위를 확인했고, 이 위치로 대응 건을 생성하겠어요.</label>
                <button className="btn primary" type="button" disabled={!confirmOpen || openCase.isPending} onClick={() => openCase.mutate()}>{openCase.isPending ? '등록 중…' : '대응 건 생성'}</button>
              </> : <p className="notice">현재 위치에 저장된 비정상 노출 판정과 TEST/PRODUCTION 범위 구분이 모두 있어야 생성할 수 있어요. 형식 탐지만으로는 생성하지 않아요.</p>}
              {mutationError(openCase.error, '대응 건 생성') && <p className="notice error" role="alert">{mutationError(openCase.error, '대응 건 생성')}</p>}
            </section>
            {successMessage && <p className="notice secret-triage-success" role="status">{successMessage}</p>}
          </>}
    </>}
  </>
}
