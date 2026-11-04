import { Fragment, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/Badge'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { fetchIacPullRequest } from './api'
import {
  causeActionLabel, formatDateTime, hopLabel, pathChangeLabel, pullRequestBadge, pullRequestUrl, ruleNextStep, ruleTitle,
  severityLabel, severityTone, shortSha, tierLabel,
} from './labels'
import type { IacPathChange, IacPullRequest, IacSeverity } from './types'

function SeverityBadge({ severity }: { severity: IacSeverity | null }) {
  return severity ? <Badge label={severityLabel[severity]} tone={severityTone[severity]} /> : null
}

/** 경로 변화 한 건: 종류·심각도·등급, 단계, 원인 리소스, 시뮬레이터 결과 */
function PathChangeItem({ change }: { change: IacPathChange }) {
  return (
    <li>
      <div className="row">
        <Badge label={pathChangeLabel[change.change] ?? change.change}
          tone={change.change === 'REMOVED' ? 'success' : 'critical'} />
        <SeverityBadge severity={change.severity} />
        <Badge label={tierLabel(change.tier)} />
      </div>
      <div className="iac-hops">
        {change.hops.map((hop, i) => {
          const label = hopLabel(hop)
          return (
            <Fragment key={`${hop.id}-${i}`}>
              {i > 0 && <span className="iac-hop-arrow" aria-hidden="true">→</span>}
              <span className="iac-hop" title={hop.id}>
                <b>{label.kind}</b>
                {label.name && <span>{label.name}</span>}
              </span>
            </Fragment>
          )
        })}
      </div>
      {change.cause.address && (
        <span className="caption">
          원인: <code className="iac-address">{change.cause.address}</code>
          {change.cause.action && ` ${causeActionLabel[change.cause.action] ?? change.cause.action}`}
        </span>
      )}
      {change.evidence?.simulator && (
        <span className="caption">
          IAM 시뮬레이터: {change.evidence.simulator.before} → {change.evidence.simulator.after}
        </span>
      )}
    </li>
  )
}

/** 화면에 보여줄 규칙 ID (② 발견, ① 경로 변화, ③ State 순서, 중복 없이) */
function ruleIds(pr: IacPullRequest): string[] {
  const ids = [
    ...pr.gate.findings.map((finding) => finding.ruleId),
    ...pr.resourceFindings.map((finding) => finding.ruleId),
    ...pr.paths.map((change) => change.ruleId),
    ...(pr.state?.ruleId ? [pr.state.ruleId] : []),
  ]
  return [...new Set(ids)]
}

/**
 * PR 상세 패널 (S-02). 판정은 백엔드가 하고 화면은 보여주기만 한다.
 * 다시 검사·예외 요청은 두지 않는다: 재실행은 GitHub 에서 하고, 대시보드는 읽기 전용으로 둔다.
 */
export function PullRequestDrawer({ number, onClose }: { number: number | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const detail = useQuery({
    queryKey: ['iac', 'pr', number],
    queryFn: () => fetchIacPullRequest(number!),
    enabled: number !== null,
  })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (number !== null && !dialog.open) dialog.showModal()
    if (number === null && dialog.open) dialog.close()
  }, [number])

  const handleBackdropClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget) return
    const rect = event.currentTarget.getBoundingClientRect()
    const outside =
      event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
    if (outside) onClose()
  }

  const pr = detail.data
  const url = number === null ? null : pullRequestUrl(number)
  const gateBlocked = pr?.gate.status === 'BLOCK'
  // 사라진 경로는 수십 개가 될 수 있어 접어 둔다 (새로 생긴·짧아진 경로가 먼저 보이게)
  const added = pr?.paths.filter((change) => change.change !== 'REMOVED') ?? []
  const removed = pr?.paths.filter((change) => change.change === 'REMOVED') ?? []
  const nextSteps = pr ? ruleIds(pr).flatMap((id) => {
    const text = ruleNextStep(id)
    return text ? [{ id, text }] : []
  }) : []

  return (
    <dialog ref={dialogRef} className="drawer" aria-labelledby="iac-pr-title" onClose={onClose} onClick={handleBackdropClick}>
      {number !== null && (
        <>
          <div className="drawer-head">
            <h2 id="iac-pr-title">PR #{number} 검사 결과</h2>
            <button className="icon-btn" onClick={onClose} aria-label="PR 상세 닫기">
              <Icon name="close" />
            </button>
          </div>

          <div className="drawer-body">
            {detail.isPending ? (
              <div className="skeleton" />
            ) : detail.isError || !pr ? (
              <p className="notice error" role="alert">PR 검사 결과를 불러오지 못했어요.</p>
            ) : (
              <>
                {/* 머리 */}
                <div className="row">
                  <Badge {...pullRequestBadge(pr)} />
                  <SeverityBadge severity={pr.highestSeverity} />
                </div>
                {pr.title && <h3 className="detail-title">{pr.title}</h3>}
                <dl className="facts">
                  <dt>커밋</dt>
                  <dd><code>{shortSha(pr.headSha)}</code></dd>
                  <dt>마지막 검사</dt>
                  <dd>{formatDateTime(pr.checkedAt)}</dd>
                </dl>

                {/* ② plan 전 검사 */}
                <section>
                  <h3>② plan 전 검사</h3>
                  {pr.gate.findings.length === 0 ? (
                    <p className="muted iac-section-text">통과. 걸린 규칙이 없어요.</p>
                  ) : (
                    <ul className="iac-findings">
                      {pr.gate.findings.map((finding, index) => (
                        <li key={`${finding.ruleId}-${index}`}>
                          <div className="row">
                            <Badge label={finding.enforcement === 'BLOCK' ? '차단' : '경고'}
                              tone={finding.enforcement === 'BLOCK' ? 'critical' : 'high'} />
                            <SeverityBadge severity={finding.severity} />
                            <strong>{ruleTitle[finding.ruleId] ?? finding.ruleId}</strong>
                          </div>
                          {finding.address && <code className="iac-address">{finding.address}</code>}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* ① 경로 변화 */}
                <section>
                  <h3>① 경로 변화</h3>
                  {gateBlocked ? (
                    <p className="muted iac-section-text">② 에서 차단돼 plan 과 경로를 계산하지 않았어요.</p>
                  ) : pr.paths.length === 0 && pr.resourceFindings.length === 0 ? (
                    <p className="muted iac-section-text">새로 생기거나 사라진 경로가 없어요.</p>
                  ) : (
                    <>
                      {pr.resourceFindings.length > 0 && (
                        <ul className="iac-findings">
                          {pr.resourceFindings.map((finding, index) => (
                            <li key={`${finding.ruleId}-${index}`}>
                              <div className="row">
                                <Badge label={finding.enforcement === 'BLOCK' ? '차단' : '경고'}
                                  tone={finding.enforcement === 'BLOCK' ? 'critical' : 'high'} />
                                <SeverityBadge severity={finding.severity} />
                                <strong>{ruleTitle[finding.ruleId] ?? finding.ruleId}</strong>
                              </div>
                              {finding.address && (
                                <span className="caption">
                                  원인: <code className="iac-address">{finding.address}</code>
                                  {finding.action && ` ${causeActionLabel[finding.action] ?? finding.action}`}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {added.length > 0 && (
                        <ul className="iac-findings">
                          {added.map((change, index) => <PathChangeItem key={`${change.ruleId}-${index}`} change={change} />)}
                        </ul>
                      )}
                      {removed.length > 0 && (
                        <details className="iac-removed">
                          <summary>사라진 경로 {removed.length}개</summary>
                          <ul className="iac-findings">
                            {removed.map((change, index) => <PathChangeItem key={`${change.ruleId}-${index}`} change={change} />)}
                          </ul>
                        </details>
                      )}
                    </>
                  )}
                </section>

                {/* ③ State 영향 */}
                <section>
                  <h3>③ State 영향</h3>
                  {gateBlocked || !pr.state ? (
                    <p className="muted iac-section-text">계산하지 않았어요.</p>
                  ) : (
                    <dl className="facts">
                      <dt>읽기 주체</dt>
                      <dd>
                        {pr.state.readersBefore} → {pr.state.readersAfter}{' '}
                        {pr.state.readersAfter > pr.state.readersBefore && <SeverityBadge severity={pr.state.severity} />}
                      </dd>
                      <dt>민감 값 추가</dt>
                      <dd>{pr.state.secretsAdded > 0 ? `${pr.state.secretsAdded}개` : '없음'}</dd>
                    </dl>
                  )}
                </section>

                {/* 바뀌는 리소스 (plan 수만, 원문은 보여주지 않음) */}
                <section>
                  <h3>바뀌는 리소스</h3>
                  {pr.resources ? (
                    <p className="muted iac-section-text">
                      추가 {pr.resources.add} · 변경 {pr.resources.change} · 삭제 {pr.resources.delete}
                    </p>
                  ) : (
                    <p className="muted iac-section-text">plan 결과가 없어요.</p>
                  )}
                </section>

                {/* 다음 할 일 */}
                <section>
                  <h3>다음 할 일</h3>
                  {nextSteps.length === 0 ? (
                    <EmptyState title="할 일 없음" description="이 PR 에서 고칠 것이 없어요." />
                  ) : (
                    <ul className="iac-next">
                      {nextSteps.map((step) => (
                        <li key={step.id}><b>{ruleTitle[step.id] ?? step.id}</b> — {step.text}</li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </div>

          <div className="drawer-foot">
            <button className="btn outline" onClick={onClose}>
              닫기
            </button>
            {url && (
              <a className="btn primary" href={url} target="_blank" rel="noopener noreferrer">
                PR 에서 보기
              </a>
            )}
          </div>
        </>
      )}
    </dialog>
  )
}
