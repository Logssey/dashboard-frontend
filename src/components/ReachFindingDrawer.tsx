import { useQuery } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import {
  fetchReachFinding,
  fetchReachVulnFunctions,
  type ReachEvidence,
  type ReachFindingDetail,
  type ReachReviewHistoryEntry,
  type ReachVulnFunction,
} from '@/api/reach'
import { findingVulnFunctions, formatKst, nearestFixedVersion, safeExternalUrl } from '@/lib/reach'
import { l3DiffersFromL2, l3Raise, l3RaiseOutdated } from '@/lib/reachL3'
import {
  labelOf,
  reachHistoryKindLabel,
  reachMatchedConditionLabel,
  reachMethodLabel,
  reachNotAnalyzedReasonLabel,
  reachResetReasonLabel,
  reachReviewLabel,
  reachStatusLabel,
} from '@/lib/reachLabels'
import { EmptyState } from './EmptyState'
import { ReachDeploymentBadge, ReachL3Badge, ReachMethodTag, ReachReviewBadge, ReachSeverityChip, ReachStatusBadge } from './ReachBadges'
import { ReachL3Section } from './ReachL3Section'
import { ReachReviewForm } from './ReachReviewForm'

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

/** 판정 근거. 코드에서 확인한 내용을 먼저, 호출 경로는 후보로 나중에 보인다 (SCR-03-06~09) */
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
      <p className="caption">코드에서 확인한 내용을 먼저 보여줘요. 호출 경로는 후보예요.</p>

      <h4>① 코드에서 확인한 내용</h4>
      {facts.length ? (
        <div className="table-scroll" tabIndex={0} role="region" aria-label="코드에서 확인한 내용 표">
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
                  <td className="reach-fact-location">{locationText(fact)}</td>
                  <td>{fact.informational ? <span className="badge">참고</span> : '예'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="caption">이 판정에 쓴 코드에서 확인한 내용이 없어요.</p>
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
            (패키지 사용 {yesNo(callgraph?.packageReached)} · 취약 함수 호출 {yesNo(callgraph?.vulnFunctionReached)})
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

/** SCR-03-04 부제: 취약 기능·CWE·스캐너 제목. [설명 보기]로 스캐너 설명 원문과 참고 링크를 펼친다 */
function VulnerabilityInfo({ vulnerability }: { vulnerability: ReachFindingDetail['vulnerability'] }) {
  const { affectedFeature, cwe = [], title, description, references = [] } = vulnerability
  const subtitle = [affectedFeature ? `취약 기능: ${affectedFeature}` : null, cwe.length ? cwe.join(', ') : null].filter(Boolean).join(' · ')
  return (
    <>
      {title && <p className="muted reach-vuln-title">{title}</p>}
      {subtitle && <p className="muted">{subtitle}</p>}
      {(description || references.length > 0) && (
        <details className="reach-vuln-more">
          <summary>설명 보기</summary>
          <p className="caption">스캐너 설명 (원문)</p>
          {description && <p className="reach-vuln-description">{description}</p>}
          {references.length > 0 && (
            <>
              <p className="caption">참고 링크 {references.length}개</p>
              <ul className="reach-list reach-references">
                {references.map((reference) => {
                  const href = safeExternalUrl(reference)
                  return (
                    <li key={reference}>
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer">
                          {reference}
                        </a>
                      ) : (
                        reference
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </details>
      )}
    </>
  )
}

/** SCR-03-10 취약 함수. 판정에 쓴 함수(vulnFunctionIds)를 API-10 데이터에서 찾아 보인다 */
function VulnFunctionSection({ detail, vulnFunctionData, onOpenVulnFunctions }: {
  detail: ReachFindingDetail
  vulnFunctionData?: ReachVulnFunction[]
  onOpenVulnFunctions?: (cve: string) => void
}) {
  const picked = findingVulnFunctions(detail, vulnFunctionData)
  if (!picked) return null
  const { source, functions, missingIds } = picked
  const fixCommits = [...new Set(functions.flatMap((fn) => fn.fixCommits ?? []))]
  const confidences = [...new Set(functions.map((fn) => fn.confidence).filter((value): value is string => Boolean(value)))]
  return (
    <section className="reach-section">
      <h3>취약 함수</h3>
      {source === 'DATA' && <p className="caption">판정 결과에 함수 목록이 없어 같은 CVE·패키지의 취약 함수 데이터를 보여줘요.</p>}
      {functions.length > 0 && (
        <ul className="reach-list reach-vuln-functions">
          {functions.map((fn) => (
            <li key={fn.id}>
              <code className="reach-mono">
                {fn.class}.{fn.method}
                {fn.descriptor ?? ''}
              </code>
              {fn.note && <span className="asset">{fn.note}</span>}
            </li>
          ))}
        </ul>
      )}
      {(fixCommits.length > 0 || confidences.length > 0) && (
        <p className="caption">
          {fixCommits.length > 0 && <>수정 커밋 {fixCommits.join(', ')}</>}
          {fixCommits.length > 0 && confidences.length > 0 && ' · '}
          {confidences.length > 0 && <>확신도 {confidences.join(', ')}</>}
        </p>
      )}
      {missingIds.length > 0 && (
        <p className="notice">
          취약 함수 {missingIds.join(', ')}번을 지금 데이터에서 찾지 못했어요. 판정한 뒤 취약 함수 데이터가 바뀌었을 수 있어요.
        </p>
      )}
      {onOpenVulnFunctions && (
        <div>
          <button type="button" className="btn outline small" onClick={() => onOpenVulnFunctions(detail.vulnerability.id)}>
            데이터에서 보기
          </button>
        </div>
      )}
    </section>
  )
}

/** SCR-03 내용. 상세 패널 안에 그린다 */
/** SCR-03-14 검토 이력. 새것이 위. 사람 판정·이어받음·서버가 되돌린 기록을 모두 보인다 */
export function ReviewHistory({ history }: { history: ReachReviewHistoryEntry[] }) {
  const rows = [...history].sort((a, b) => b.version - a.version || b.reviewedAt.localeCompare(a.reviewedAt))
  return (
    <section className="reach-section">
      <h3>검토 이력</h3>
      {rows.length === 0 ? (
        <p className="caption">아직 검토 기록이 없어요.</p>
      ) : (
        <ol className="reach-history">
          {rows.map((entry) => (
            <li key={`${entry.version}-${entry.reviewedAt}`} className="reach-history-item">
              <div className="row reach-history-head">
                <ReachReviewBadge state={entry.reviewState} />
                {entry.status && <ReachStatusBadge status={entry.status} />}
                {entry.changeKind && <span className="badge reach-method">{labelOf(reachHistoryKindLabel, entry.changeKind)}</span>}
                <span className="caption">
                  {entry.reviewer?.name ?? (entry.changeKind === 'RESET' ? '서버' : '—')} · {formatKst(entry.reviewedAt)} · v{entry.version}
                </span>
              </div>
              {entry.note && <p className="reach-history-note">{entry.note}</p>}
              {entry.proposal && (
                <p className="caption">
                  제안: {labelOf(reachStatusLabel, entry.proposal.status)} — {entry.proposal.summary}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export function ReachFindingDetailView({ detail, onShowSameCve, onOpenVulnFunctions, vulnFunctionData, reviewForm }: {
  detail: ReachFindingDetail
  /** 같은 CVE의 사본을 목록에서 본다 (SCR-03-16 대신 목록 필터로 보낸다) */
  onShowSameCve?: (cve: string) => void
  /** 규칙 화면의 취약 함수 탭에서 이 CVE를 연다 (SCR-03-10 [데이터에서 보기]) */
  onOpenVulnFunctions?: (cve: string) => void
  /** API-10 취약 함수 데이터. API-05가 vulnFunctions를 주지 않을 때 vulnFunctionIds로 찾는다 */
  vulnFunctionData?: ReachVulnFunction[]
  /** 검토 입력(API-06). 예시 데이터일 때는 넘기지 않아 안내 문구만 보인다 */
  reviewForm?: React.ReactNode
}) {
  const { verdict, review, vulnerability, component } = detail
  const raised = l3Raise(verdict.evidence)
  // 규칙 데이터의 L3 한도가 생기기 전에 올린 판정: 다음 검사·재대조에서 바뀐다
  const outdated = l3RaiseOutdated(verdict.status, detail.l3, raised)
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
      {component.path && (
        <p className="caption reach-component-path">
          이미지 안 위치 <code>{component.path}</code>
        </p>
      )}
      {vulnerability.severityNote && <p className="caption">위험도 참고: {vulnerability.severityNote}</p>}
      <VulnerabilityInfo vulnerability={vulnerability} />

      <section className={`reach-band ${verdict.status === 'REACHABLE' ? 'alert' : ''}`.trim()}>
        <dl className="reach-band-cells">
          <div>
            <dt>취약 함수 호출 가능 여부</dt>
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
            <dt>이미지 실행 여부</dt>
            <dd>
              <ReachDeploymentBadge deployment={detail.deployment} />
            </dd>
          </div>
          <div>
            <dt>실제 실행 기록</dt>
            <dd>
              <ReachL3Badge l3={detail.l3} />
              {(l3DiffersFromL2(verdict.status, detail.l3) || outdated) && <span className="badge reach-flag differs">≠ 판정</span>}
              {raised && <span className="badge reach-flag">L3로 올림</span>}
            </dd>
          </div>
        </dl>
        <p className="reach-conclusion">
          {verdict.status === 'NOT_ANALYZED' && verdict.notAnalyzedReason
            ? `${labelOf(reachNotAnalyzedReasonLabel, verdict.notAnalyzedReason)} · ${verdict.summary}`
            : verdict.summary}
        </p>
        {raised?.l2Status && (outdated ? (
          <p className="notice">
            이전 규칙으로 L3가 올린 판정이에요. 이 실행은 이 취약점의 조건을 그만큼 보여 주지 않아, 지금 규칙으로는{' '}
            {labelOf(reachStatusLabel, outdated)}이에요. 이 이미지를 다시 검사하거나 재대조하면 바뀌어요(실행 중인 이미지는 매일 재대조, 그 밖은 [검사 요청]. 코드 분석 L2 판정:{' '}
            {labelOf(reachStatusLabel, raised.l2Status)}).
          </p>
        ) : (
          <p className="notice">
            L3가 실제 실행을 확인해 판정을 올렸어요(코드 분석 L2 판정: {labelOf(reachStatusLabel, raised.l2Status)}).
          </p>
        ))}
        <p className="caption">
          판정 {formatKst(verdict.analyzedAt)} · 검사 #{detail.scanId}
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

      <ReachL3Section l3={detail.l3} />

      <VulnFunctionSection detail={detail} vulnFunctionData={vulnFunctionData} onOpenVulnFunctions={onOpenVulnFunctions} />

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
        <p className="caption">수정 버전은 팀에서 선택합니다. 호출 경로가 없어도 수정 가능한 버전을 함께 보여줍니다.</p>
      </section>

      <section className="reach-section">
        <h3>
          담당자 검토 <ReachReviewBadge state={review.reviewState} />
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
        {review.carriedFrom && <p className="caption">이전 검사에서 이어받음 ({formatKst(review.carriedFrom.reviewedAt)})</p>}
        {review.resetReason && (
          <span className="badge reach-flag differs">{labelOf(reachResetReasonLabel, review.resetReason)}</span>
        )}
        {reviewForm ?? <p className="notice">검토 저장(API-06)은 백엔드가 연결되면 쓸 수 있어요.</p>}
      </section>

      {review.history && <ReviewHistory history={review.history} />}

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

/** SCR-03 취약점 상세 패널. 주소의 finding 값으로 열고 닫는다 */
export function ReachFindingDrawer({ findingId, onShowSameCve, onOpenVulnFunctions }: {
  findingId: number | null
  onClose: () => void
  onShowSameCve?: (cve: string) => void
  onOpenVulnFunctions?: (cve: string) => void
}) {
  const detail = useQuery({
    queryKey: ['reach-finding', findingId],
    queryFn: () => fetchReachFinding(findingId!),
    enabled: findingId !== null,
  })


  const data = detail.data?.data
  const notFound = detail.error instanceof ApiError && detail.error.status === 404
  // API-05가 vulnFunctions를 채우지 않으면 API-10에서 vulnFunctionIds로 찾는다. 데이터가 작아(46개) 한 번 받아 둔다
  const needsVulnFunctions =
    data !== undefined && !detail.data?.sample && data.verdict.status !== 'NOT_ANALYZED' && !data.verdict.vulnFunctions?.length
  const vulnFunctions = useQuery({
    queryKey: ['reach-vuln-functions'],
    queryFn: fetchReachVulnFunctions,
    enabled: needsVulnFunctions,
    staleTime: 5 * 60_000,
  })

  return (
    <section className="card security-detail-content">
      {findingId !== null && (
        <>
          <div className="drawer-head">
            <h2 id="reach-detail-title">{data?.vulnerability.id ?? '취약점 상세'}</h2>
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
              <ReachFindingDetailView
                detail={data}
                onShowSameCve={onShowSameCve}
                onOpenVulnFunctions={onOpenVulnFunctions}
                vulnFunctionData={vulnFunctions.data?.items}
                reviewForm={detail.data?.sample ? undefined : <ReachReviewForm key={findingId} findingId={findingId} detail={data} />}
              />
            </>
          )}
          <div className="drawer-foot">
          </div>
        </>
      )}
    </section>
  )
}
