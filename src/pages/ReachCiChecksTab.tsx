import { type FormEvent, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { fetchReachCiCheck, type ReachCiCheck, type ReachTrigger } from '@/api/reach'
import { ReachScanStatusBadge } from '@/components/ReachBadges'
import { formatKst } from '@/lib/reach'
import {
  labelOf,
  reachCiPolicyLabel,
  reachGateConditionLabel,
  reachGateResultLabel,
  reachStatusLabel,
  reachStatusOrder,
  reachTriggerLabel,
} from '@/lib/reachLabels'
import { VULNERABILITY_FINDINGS_PATH, VULNERABILITY_SCANS_PATH } from '@/lib/reachRoutes'

// SCR-05-10 CI 검사 탭. CI 연동(FR-11)은 아직 연결되지 않았고, API-12에 검사 목록 조회가 없어(미결 7)
// 검사 ID로 한 건씩 본다. 고른 검사 ID는 스캔 화면 주소 쿼리 check에 둔다

const POLL_MS = 10_000

/** 실행 계획 (화면 명세 "CI 검사 탭 배치", PRD FR-11). 네 줄 모두 [계획] */
export const CI_PLAN: { mode: ReachTrigger; when: string; what: string }[] = [
  { mode: 'PR', when: 'PR마다', what: '레포 SBOM으로 CVE 대조와 L2 판정. 기준 스캔에 없던 Finding만 게이트로 본다' },
  { mode: 'IMAGE_BUILD', when: '이미지 빌드 때(ECR push 전)', what: '이미지 SBOM 생성·대조·L2 판정. L3 능동 관측(FR-14)은 그다음' },
  { mode: 'SCHEDULE', when: '하루 1번', what: '저장된 SBOM을 새 취약점 DB로 다시 대조하고 다시 판정' },
  { mode: 'MANUAL', when: '필요할 때', what: '수동 실행' },
]

/** 검사 ID 입력값. 양의 정수만 받는다 */
export function parseCheckId(value: string | null): number | null {
  const text = (value ?? '').trim().replace(/^#/, '')
  if (!/^\d+$/.test(text)) return null
  const id = Number(text)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function GateBadge({ result }: { result: string }) {
  return <span className={`badge reach-pill reach-gate ${result.toLowerCase()}`}>{labelOf(reachGateResultLabel, result)}</span>
}

/** API-12 결과 한 건 */
export function CiCheckResult({ check }: { check: ReachCiCheck }) {
  const { gate } = check
  const pr = check.pullRequest
  const running = check.scanStatus === 'QUEUED' || check.scanStatus === 'RUNNING'
  return (
    <div className="reach-ci-result stack">
      <div className="row reach-ci-head">
        <h3 className="reach-ci-title">검사 #{check.id}</h3>
        {gate ? <GateBadge result={gate.result} /> : <ReachScanStatusBadge status={check.scanStatus} />}
        <span className="badge reach-method">{labelOf(reachTriggerLabel, check.mode)}</span>
        <span className="badge reach-method">{labelOf(reachCiPolicyLabel, check.policy)}</span>
      </div>

      <dl className="reach-ci-facts">
        <div>
          <dt>레포</dt>
          <dd>{check.repository}</dd>
        </div>
        {check.headCommit && (
          <div>
            <dt>커밋</dt>
            <dd>
              <code className="reach-mono" title={check.headCommit}>
                {check.headCommit.slice(0, 7)}
              </code>
            </dd>
          </div>
        )}
        {pr && (
          <div>
            <dt>PR</dt>
            <dd>
              #{pr.number}
              {pr.headRef && pr.baseRef && (
                <span className="caption">
                  {' '}
                  {pr.headRef} → {pr.baseRef}
                </span>
              )}
            </dd>
          </div>
        )}
        <div>
          <dt>스캔</dt>
          <dd>
            <Link className="reach-link" to={`${VULNERABILITY_SCANS_PATH}?scan=${check.scanId}`}>
              스캔 #{check.scanId}
            </Link>{' '}
            <ReachScanStatusBadge status={check.scanStatus} />
          </dd>
        </div>
        <div>
          <dt>기준 스캔</dt>
          <dd>
            {check.baselineScanId ? (
              <Link className="reach-link" to={`${VULNERABILITY_SCANS_PATH}?scan=${check.baselineScanId}`}>
                스캔 #{check.baselineScanId}
              </Link>
            ) : (
              <span className="caption">없음 · 모든 Finding을 새 것으로 봐요</span>
            )}
          </dd>
        </div>
        {check.finishedAt && (
          <div>
            <dt>끝난 시각</dt>
            <dd>{formatKst(check.finishedAt)}</dd>
          </div>
        )}
      </dl>

      {gate ? (
        <>
          <section className="reach-ci-section">
            <h4>새 Finding {gate.newFindings.total}건</h4>
            <ul className="reach-ci-counts">
              {reachStatusOrder.map((status) => (
                <li key={status}>
                  <span className="caption">{labelOf(reachStatusLabel, status)}</span>
                  <strong>{gate.newFindings.byStatus[status] ?? 0}</strong>
                </li>
              ))}
            </ul>
          </section>
          <section className="reach-ci-section">
            <h4>게이트 이유</h4>
            {gate.reasons.length === 0 ? (
              <p className="caption">걸린 조건이 없어요.</p>
            ) : (
              <ul className="reach-ci-reasons">
                {gate.reasons.map((reason) => (
                  <li key={reason.condition}>
                    <strong>{labelOf(reachGateConditionLabel, reason.condition)}</strong> {reason.count}건
                    <span className="caption"> · {reason.summary}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="caption">
              CI 종료 코드 {gate.exitCode}
              {check.policy === 'REPORT_ONLY' && ' · 리포트 전용이라 이유가 있어도 PR을 막지 않아요'}
            </p>
          </section>
          <div className="row reach-ci-actions">
            <Link className="btn outline small" to={`${VULNERABILITY_FINDINGS_PATH}?scan=${check.scanId}`}>
              이 검사의 Finding 보기
            </Link>
          </div>
        </>
      ) : (
        <p className="notice" role="status">
          {running
            ? '분석 결과가 아직 올라오지 않았어요. 10초마다 다시 확인해요.'
            : '스캔이 실패해 게이트 결과가 없어요. 스캔 상세에서 실패한 단계를 확인하세요.'}
        </p>
      )}
    </div>
  )
}

function CheckLookup({ checkId, onCheck }: { checkId: number | null; onCheck: (id: number | null) => void }) {
  const [text, setText] = useState(checkId ? String(checkId) : '')
  const [invalid, setInvalid] = useState(false)
  useEffect(() => setText(checkId ? String(checkId) : ''), [checkId])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const id = parseCheckId(text)
    setInvalid(id === null)
    if (id !== null) onCheck(id)
  }

  return (
    <form className="row reach-ci-lookup" onSubmit={submit}>
      <label className="reach-ci-lookup-label" htmlFor="reach-ci-check-id">
        검사 ID
      </label>
      <input
        id="reach-ci-check-id"
        className="input"
        inputMode="numeric"
        placeholder="예: 12"
        value={text}
        aria-invalid={invalid}
        aria-describedby="reach-ci-check-help"
        onChange={(event) => setText(event.target.value)}
      />
      <button type="submit" className="btn primary small">
        결과 보기
      </button>
      {checkId && (
        <button type="button" className="btn outline small" onClick={() => onCheck(null)}>
          지우기
        </button>
      )}
      <p id="reach-ci-check-help" className={`caption reach-ci-help ${invalid ? 'error' : ''}`.trim()}>
        {invalid ? '검사 ID는 숫자예요.' : 'CI 로그나 API-12 응답(Location)에 나온 검사 ID를 넣으세요.'}
      </p>
    </form>
  )
}

function CheckResultCard({ checkId }: { checkId: number }) {
  const check = useQuery({
    queryKey: ['reach-ci-check', checkId],
    queryFn: () => fetchReachCiCheck(checkId),
    refetchInterval: (query) => {
      const status = query.state.data?.scanStatus
      return status === 'QUEUED' || status === 'RUNNING' ? POLL_MS : false
    },
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  })
  if (check.isPending) return <div className="skeleton" role="status" aria-label="불러오는 중" />
  if (check.isError) {
    const notFound = check.error instanceof ApiError && check.error.status === 404
    return (
      <p className="notice error" role="alert">
        {notFound ? `검사 #${checkId}을 찾을 수 없어요. 검사 ID를 확인하세요.` : `검사 #${checkId}을 불러오지 못했어요.`}
      </p>
    )
  }
  return <CiCheckResult check={check.data} />
}

export function CiChecksTab({
  checkId,
  onCheck,
  onShowPrScans,
}: {
  checkId: number | null
  onCheck: (id: number | null) => void
  onShowPrScans: () => void
}) {
  return (
    <div className="stack">
      <section className="card reach-ci-card">
        <p className="notice" role="status">
          CI 연동은 아직 연결되지 않았어요(FR-11 [계획]). 검사 목록 API가 없어서, CI가 등록한 검사는 검사 ID로 한 건씩 봐요.
          PR 검사가 만든 스캔은{' '}
          <button type="button" className="reach-row-button reach-link" onClick={onShowPrScans}>
            스캔 이력의 PR 트리거
          </button>
          로 볼 수 있어요.
        </p>
        <CheckLookup checkId={checkId} onCheck={onCheck} />
        {checkId && <CheckResultCard checkId={checkId} />}
      </section>

      <section className="card list-card">
        <div className="toolbar reach-filters">
          <strong>실행 계획</strong>
          <span className="caption">처음에는 리포트 전용으로 돌리고, 게이트 전환 시점은 팀이 정해요(ARD Q-07)</span>
        </div>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="CI 실행 계획 표. 좁은 화면에서는 가로로 스크롤하세요.">
          <table className="reach-table reach-ci-plan">
            <thead>
              <tr>
                <th scope="col">실행</th>
                <th scope="col">언제</th>
                <th scope="col">하는 일</th>
                <th scope="col">상태</th>
              </tr>
            </thead>
            <tbody>
              {CI_PLAN.map((row) => (
                <tr key={row.mode}>
                  <td>
                    <strong>{labelOf(reachTriggerLabel, row.mode)}</strong>
                  </td>
                  <td>{row.when}</td>
                  <td>{row.what}</td>
                  <td>
                    <span className="badge reach-flag">계획</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
