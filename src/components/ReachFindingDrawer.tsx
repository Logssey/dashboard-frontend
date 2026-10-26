import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { fetchReachFinding, type ReachEvidence, type ReachFindingDetail } from '@/api/reach'
import { formatKst, nearestFixedVersion } from '@/lib/reach'
import {
  labelOf,
  reachMatchedConditionLabel,
  reachMethodLabel,
  reachNotAnalyzedReasonLabel,
  reachResetReasonLabel,
  reachReviewLabel,
  reachStatusLabel,
} from '@/lib/reachLabels'
import { EmptyState } from './EmptyState'
import { Icon } from './Icon'
import { ReachDeploymentBadge, ReachMethodTag, ReachReviewBadge, ReachSeverityChip, ReachStatusBadge } from './ReachBadges'

function yesNo(value: boolean | undefined): string {
  if (value === undefined) return '—'
  return value ? '예' : '아니요'
}

function factValue(value: unknown): string {
  if (value === undefined || value === null) return '—'
  if (typeof value === 'boolean') return value ? '참' : '거짓'
  return String(value)
}

function locationText(evidence: ReachEvidence): string {
  const locations = evidence.locations ?? []
  if (!locations.length) return '—'
  return locations
    .map((location) => (location.file ? `${location.file}${location.line ? `:${location.line}` : ''}` : location.symbol ?? ''))
    .filter(Boolean)
    .join(', ')
}

/** 판정 근거. 앱 코드 사실을 먼저, 호출 경로는 후보로 나중에 보인다 (SCR-03-06~09) */
function EvidenceSection({ detail }: { detail: ReachFindingDetail }) {
  const { evidence, callgraph, method } = detail.verdict
  const facts = evidence
    .filter((item) => item.kind === 'FACT')
    .sort((a, b) => Number(Boolean(a.informational)) - Number(Boolean(b.informational)) || a.order - b.order)
  const checked = evidence.filter((item) => item.checkedAbsent?.length || item.checkedCount !== undefined)
  const paths = evidence.filter((item) => item.kind === 'PATH')
  const notes = evidence.filter((item) => item.kind === 'NOTE')
  const rules = evidence.filter((item) => item.kind === 'RULE')

  return (
    <section className="reach-section">
      <h3>근거</h3>
      <p className="caption">앱 코드 사실을 먼저 보여줘요. 호출 경로는 후보예요.</p>

      <h4>① 앱 코드 사실</h4>
      {facts.length ? (
        <div className="table-scroll" tabIndex={0} role="region" aria-label="앱 코드 사실 표">
          <table className="reach-facts">
            <thead>
              <tr>
                <th scope="col">사실</th>
                <th scope="col">값</th>
                <th scope="col">위치</th>
                <th scope="col">판정에 씀</th>
              </tr>
            </thead>
            <tbody>
              {facts.map((fact) => (
                <tr key={fact.order}>
                  <td>
                    <code>{fact.factId}</code>
                    <span className="asset">{fact.summary}</span>
                  </td>
                  <td>{factValue(fact.value)}</td>
                  <td>{locationText(fact)}</td>
                  <td>{fact.informational ? <span className="badge">참고</span> : '예'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="caption">이 판정에 쓴 앱 코드 사실이 없어요.</p>
      )}

      {checked.length > 0 && (
        <>
          <h4>② 확인 범위</h4>
          <ul className="reach-list">
            {checked.map((item) => (
              <li key={item.order}>
                {item.checkedCount !== undefined && <>확인한 대상 {item.checkedCount}개. </>}
                {item.checkedAbsent?.length ? <>확인했지만 없던 것: {item.checkedAbsent.join(', ')}</> : null}
              </li>
            ))}
          </ul>
        </>
      )}

      <details className="reach-path" open={method === 'CALLGRAPH'}>
        <summary>
          <strong>③ 호출 경로</strong> · 후보 경로, 실제와 다를 수 있음
          <span className="caption">
            {' '}
            (패키지 도달 {yesNo(callgraph?.packageReached)} · 취약 메서드 도달 {yesNo(callgraph?.vulnFunctionReached)})
          </span>
        </summary>
        {paths.length ? (
          paths.map((path) => (
            <div key={path.order}>
              <p className="caption">{path.summary}</p>
              <ol className="reach-steps">
                {(path.path ?? []).map((step, index) => (
                  <li key={`${step}-${index}`}>
                    <code>{step}</code>
                    {path.weak && index === (path.path?.length ?? 0) - 1 && <span className="badge">약한 경로</span>}
                  </li>
                ))}
              </ol>
            </div>
          ))
        ) : (
          <p className="caption">후보 경로가 없어요.</p>
        )}
      </details>

      {notes.map((note) => (
        <p key={note.order} className="notice">
          {note.summary}
        </p>
      ))}

      {rules.length > 0 && (
        <>
          <h4>적용 규칙</h4>
          <ul className="reach-list">
            {rules.map((rule) => (
              <li key={rule.order}>
                <code>{rule.ruleId}</code>
                {rule.matchedCondition && <> · {labelOf(reachMatchedConditionLabel, rule.matchedCondition)}으로 판정을 정함</>}
                <span className="asset">{rule.summary}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** SCR-03 내용. 상세 패널 안에 그린다 */
export function ReachFindingDetailView({ detail, onShowSameCve }: {
  detail: ReachFindingDetail
  /** 같은 CVE의 사본을 목록에서 본다 (SCR-03-16 대신 목록 필터로 보낸다) */
  onShowSameCve?: (cve: string) => void
}) {
  const { verdict, review, vulnerability, component } = detail
  const fix = nearestFixedVersion(component.version, vulnerability.fixedVersions)
  const humanDiffers = review.disagreesWithTool

  return (
    <div className="drawer-body">
      <div className="row reach-title-row">
        <ReachSeverityChip severity={vulnerability.severity} />
        <strong>
          {component.name} {component.version}
        </strong>
      </div>
      <code className="caption">{component.purl}</code>
      {vulnerability.severityNote && <p className="caption">심각도 참고: {vulnerability.severityNote}</p>}
      {vulnerability.affectedFeature && <p className="muted">취약 기능: {vulnerability.affectedFeature}</p>}

      <section className={`reach-band ${verdict.status === 'REACHABLE' ? 'alert' : ''}`.trim()}>
        <dl className="reach-band-cells">
          <div>
            <dt>판정(L2)</dt>
            <dd>
              <ReachStatusBadge status={verdict.status} large />
            </dd>
          </div>
          <div>
            <dt>방식</dt>
            <dd>
              <ReachMethodTag method={verdict.method} />
            </dd>
          </div>
          <div>
            <dt>검토</dt>
            <dd>
              <ReachReviewBadge state={review.reviewState} />
            </dd>
          </div>
          <div>
            <dt>배포(L1)</dt>
            <dd>
              <ReachDeploymentBadge deployment={detail.deployment} />
            </dd>
          </div>
        </dl>
        <p className="reach-conclusion">
          {verdict.status === 'NOT_ANALYZED' && verdict.notAnalyzedReason
            ? `${labelOf(reachNotAnalyzedReasonLabel, verdict.notAnalyzedReason)} · ${verdict.summary}`
            : verdict.summary}
        </p>
        <p className="caption">
          판정 {formatKst(verdict.analyzedAt)} · 스캔 #{detail.scanId}
          {verdict.engine?.reach ? ` · reach ${verdict.engine.reach}` : ''}
        </p>
        {review.proposal && (
          <p className="notice">
            제안(확정 대기): {labelOf(reachStatusLabel, review.proposal.status)} — {review.proposal.summary}
            {review.proposal.reference && <span className="asset">근거: {review.proposal.reference}</span>}
          </p>
        )}
      </section>

      <EvidenceSection detail={detail} />

      <section className="reach-section">
        <h3>수정 버전</h3>
        <dl className="facts">
          <dt>설치 버전</dt>
          <dd>{component.version}</dd>
          <dt>수정 버전(스캐너)</dt>
          <dd>{vulnerability.fixedVersions.join(', ') || '—'}</dd>
          <dt>가장 가까운 버전</dt>
          <dd>{fix ?? '—'}</dd>
          {detail.upgrade?.suggestedVersion && (
            <>
              <dt>업그레이드 제안</dt>
              <dd>{detail.upgrade.suggestedVersion}</dd>
            </>
          )}
        </dl>
        {detail.upgrade?.change && <pre className="evidence">{detail.upgrade.change}</pre>}
        {detail.upgrade?.note && <p className="caption">{detail.upgrade.note}</p>}
        <p className="caption">결정 상태: 결정 전(팀 결정). 도달 불가여도 수정 버전을 보여줘요.</p>
      </section>

      <section className="reach-section">
        <h3>
          사람 검토 <ReachReviewBadge state={review.reviewState} />
        </h3>
        <dl className="facts">
          <dt>도구</dt>
          <dd>
            {labelOf(reachStatusLabel, verdict.status)}
            {verdict.method ? ` · ${labelOf(reachMethodLabel, verdict.method)}` : ''}
          </dd>
          <dt>사람</dt>
          <dd>
            {review.status ? `${labelOf(reachStatusLabel, review.status)} · ${labelOf(reachReviewLabel, review.reviewState)}` : '—'}
            {review.status && (
              <span className={`badge reach-flag ${humanDiffers ? 'differs' : ''}`.trim()}>{humanDiffers ? '≠ 불일치' : '일치'}</span>
            )}
          </dd>
          {review.note && (
            <>
              <dt>메모</dt>
              <dd>{review.note}</dd>
            </>
          )}
          {review.reviewer && (
            <>
              <dt>기록</dt>
              <dd>
                {review.reviewer.name} · {formatKst(review.reviewedAt)}
              </dd>
            </>
          )}
        </dl>
        {review.carriedFrom && <p className="caption">이전 스캔에서 이어받음 ({formatKst(review.carriedFrom.reviewedAt)})</p>}
        {review.resetReason && (
          <span className="badge reach-flag differs">{labelOf(reachResetReasonLabel, review.resetReason)}</span>
        )}
        <p className="notice">검토 저장(API-06)은 백엔드가 연결되면 쓸 수 있어요.</p>
      </section>

      {detail.sameCveFindings && detail.sameCveFindings.length > 0 && (
        <p className="caption">
          같은 CVE의 다른 패키지 사본 {detail.sameCveFindings.length}건이 따로 있어요.{' '}
          {onShowSameCve && (
            <button type="button" className="btn outline small" onClick={() => onShowSameCve(vulnerability.id)}>
              목록에서 같은 CVE 보기
            </button>
          )}
        </p>
      )}
    </div>
  )
}

/** SCR-03 Finding 상세 패널. 주소의 finding 값으로 열고 닫는다 */
export function ReachFindingDrawer({ findingId, onClose, onShowSameCve }: {
  findingId: number | null
  onClose: () => void
  onShowSameCve?: (cve: string) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const detail = useQuery({
    queryKey: ['reach-finding', findingId],
    queryFn: () => fetchReachFinding(findingId!),
    enabled: findingId !== null,
  })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (findingId !== null && !dialog.open) dialog.showModal()
    if (findingId === null && dialog.open) dialog.close()
  }, [findingId])

  const handleBackdropClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget) return
    const rect = event.currentTarget.getBoundingClientRect()
    const outside =
      event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
    if (outside) onClose()
  }

  const data = detail.data?.data
  const notFound = detail.error instanceof ApiError && detail.error.status === 404

  return (
    <dialog
      ref={dialogRef}
      className="drawer reach-drawer"
      aria-labelledby="reach-detail-title"
      // Esc로 닫을 때만 주소를 고친다. 닫기 버튼으로 주소가 먼저 바뀌어 닫힌 경우 한 번 더 고치지 않는다
      onClose={() => {
        if (findingId !== null) onClose()
      }}
      onClick={handleBackdropClick}
    >
      {findingId !== null && (
        <>
          <div className="drawer-head">
            <h2 id="reach-detail-title">{data?.vulnerability.id ?? 'Finding 상세'}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="상세 패널 닫기">
              <Icon name="close" />
            </button>
          </div>
          {detail.isPending && (
            <div className="drawer-body" role="status" aria-live="polite">
              <div className="skeleton" />
              <div className="skeleton" />
              <span className="reach-sr-only">불러오는 중</span>
            </div>
          )}
          {detail.isError && (
            <div className="drawer-body">
              {notFound ? (
                <EmptyState title="찾을 수 없어요" description="주소가 바뀌었거나 지워졌을 수 있어요." />
              ) : (
                <p className="notice error" role="alert">
                  상세를 불러오지 못했어요.{' '}
                  <button type="button" className="btn outline small" onClick={() => void detail.refetch()}>
                    다시 시도
                  </button>
                </p>
              )}
            </div>
          )}
          {data && (
            <>
              {detail.data?.sample && <p className="notice reach-sample-inline">명세 예시 데이터예요. 실제 판정 결과가 아니에요.</p>}
              <ReachFindingDetailView detail={data} onShowSameCve={onShowSameCve} />
            </>
          )}
          <div className="drawer-foot">
            <button className="btn outline" onClick={onClose}>
              닫기
            </button>
          </div>
        </>
      )}
    </dialog>
  )
}
