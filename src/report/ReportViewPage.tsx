import { Fragment, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '@/components/Badge'
import { Icon } from '@/components/Icon'
import { adviseFinding, deleteReport, fetchReport, fetchReportOptions, reportPrintUrl } from './api'
import {
  SECTIONS, SEVERITIES, adviceReason, dueText, formatDay, formatTime, partLabel, severityLabel, severityTone,
} from './labels'
import type { ReportAdvice, ReportContent, ReportDetail, ReportFinding } from './types'
import './report.css'

/** 리포트 보기. 인쇄본과 같은 4개 절: 처리 우선순위 → 발견된 취약점 → 공통 조치 방안 → 부록 */
export function ReportViewPage() {
  const reportId = Number(useParams().reportId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const report = useQuery({
    queryKey: ['reports', reportId],
    queryFn: () => fetchReport(reportId),
    enabled: Number.isInteger(reportId) && reportId > 0,
  })
  const remove = useMutation({
    mutationFn: () => deleteReport(reportId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
      navigate('/reports')
    },
  })

  if (report.isPending) return <div className="skeleton" />
  if (report.isError || !report.data) {
    return (
      <div className="stack">
        <p className="notice error" role="alert">리포트를 불러오지 못했어요. 삭제된 리포트일 수 있어요.</p>
        <Link className="btn outline" to="/reports">목록으로</Link>
      </div>
    )
  }
  const c = report.data.content
  const ai = { reportId, detail: report.data }
  const confirmDelete = () => {
    if (window.confirm(`‘${c.name}’을 삭제할까요?\n목록과 보기에서 사라지고, 삭제 기록만 남아요.`)) remove.mutate()
  }

  return (
    <>
      <section className="page-head">
        <div>
          <h1>{c.name}</h1>
          <p className="subtitle">{c.overview.headline}</p>
          <div className="row report-head-badges">
            <Badge label={partLabel[c.part]} tone="primary" />
            <Badge label={`스냅샷 · ${formatTime(c.createdAt)}`} />
            <span className="caption">RPT-{reportId} · 보고 기간 {c.periodFrom} ~ {c.periodTo} · {c.createdBy} 생성</span>
          </div>
        </div>
        <div className="row">
          <Link className="btn outline" to="/reports">목록</Link>
          <button className="btn outline report-delete" onClick={confirmDelete} disabled={remove.isPending}>삭제</button>
          <a className="btn primary" href={reportPrintUrl(reportId)} target="_blank" rel="noreferrer">
            <Icon name="download" />인쇄·PDF
          </a>
        </div>
      </section>
      {remove.isError && <p className="notice error" role="alert">리포트를 삭제하지 못했어요.</p>}
      {!c.overview.connected && (
        <p className="notice" role="status">
          이 파트는 아직 리포트 데이터를 연결하지 않았어요. 아래 빈칸은 0건이 아니라 비어 있는 거예요. 현황은 {partLabel[c.part]} 화면에서 확인하세요.
        </p>
      )}
      {c.overview.stale && c.overview.dataAsOf && (
        <p className="notice" role="status">데이터 기준 시각이 24시간보다 오래됐어요 ({formatTime(c.overview.dataAsOf)}).</p>
      )}

      <div className="report-layout">
        <nav className="report-toc card" aria-label="리포트 목차">
          {SECTIONS.map((s, i) => (
            <a key={s.id} href={`#report-${s.id}`}><span className="report-toc-num">{i + 1}</span>{s.title}</a>
          ))}
        </nav>
        <div className="stack report-body">
          <FindingAdviceScope {...ai}>
            {(advice) => (
              <>
                <Priorities content={c} advice={advice} />
                <Vulnerabilities content={c} advice={advice} />
              </>
            )}
          </FindingAdviceScope>
          <Remediation content={c} />
          <Appendix content={c} />
        </div>
      </div>
    </>
  )
}

/** 데이터 연결 전 리포트의 빈칸은 '없음'이 아니라 '비어 있음'으로 쓴다 */
function emptyText(content: ReportContent, whenConnected: string) {
  return content.overview.connected ? whenConnected : '데이터 연결 전이라 비어 있어요.'
}

function SeverityBadge({ severity }: { severity: ReportFinding['severity'] }) {
  return <Badge label={severityLabel[severity]} tone={severityTone[severity]} />
}

function SectionHead({ index, sub }: { index: number; sub?: string | null }) {
  const section = SECTIONS[index]
  return (
    <div className="card-head">
      <h2 id={`report-${section.id}-title`}><span className="report-section-num">{index + 1}</span>{section.title}</h2>
      {sub && <span className="caption">{sub}</span>}
    </div>
  )
}

type FindingAdvice = ReturnType<typeof useFindingAdvice>

/** 건별 AI 대응 방법 상태. 우선순위 카드와 취약점 표가 같은 저장 결과를 함께 쓴다 */
function useFindingAdvice({ reportId, detail }: { reportId: number; detail: ReportDetail }) {
  const options = useQuery({ queryKey: ['reports', 'options'], queryFn: fetchReportOptions })
  const aiEnabled = options.data?.aiEnabled === true
  const queryClient = useQueryClient()
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [failed, setFailed] = useState<Record<string, ReportAdvice>>({})
  const advise = useMutation({
    mutationFn: (findingId: string) => adviseFinding(reportId, findingId),
    onSuccess: (advice, findingId) => {
      if (advice.status === 'GENERATED') {
        queryClient.setQueryData<ReportDetail>(['reports', reportId], (current) => current
          && { ...current, findingAdvice: { ...current.findingAdvice, [findingId]: advice } })
      } else {
        setFailed((current) => ({ ...current, [findingId]: advice }))
      }
      setOpen((current) => ({ ...current, [findingId]: true }))
    },
  })
  return {
    aiEnabled,
    saved: (id: string) => detail.findingAdvice[id],
    shown: (id: string) => (open[id] ? detail.findingAdvice[id] ?? failed[id] : undefined),
    busy: (id: string) => advise.isPending && advise.variables === id,
    anyBusy: advise.isPending,
    toggle: (id: string) => {
      if (detail.findingAdvice[id]) setOpen((current) => ({ ...current, [id]: !current[id] }))
      else advise.mutate(id)
    },
  }
}

function FindingAdviceScope({ reportId, detail, children }: {
  reportId: number
  detail: ReportDetail
  children: (advice: FindingAdvice) => React.ReactNode
}) {
  return <>{children(useFindingAdvice({ reportId, detail }))}</>
}

/** 'AI 대응 생성'(아직 없음) · 'AI 대응 보기'(이미 만들어 저장됨) · '접기' */
function AdviceButton({ id, advice }: { id: string; advice: FindingAdvice }) {
  const saved = advice.saved(id)
  const open = !!advice.shown(id)
  const blocked = !saved && (!advice.aiEnabled || advice.anyBusy)
  return (
    <button className={`btn ${saved ? 'outline' : 'soft'} report-ai-btn`} onClick={() => advice.toggle(id)}
      disabled={advice.busy(id) || blocked} aria-expanded={open}
      title={!saved && !advice.aiEnabled ? 'AI 추천이 꺼져 있어요' : saved ? '이미 만든 대응 방법을 봅니다' : '이 취약점만을 위한 대응 방법을 만듭니다 (20초 안팎)'}>
      {advice.busy(id) ? '생성 중…' : open ? '접기' : saved ? 'AI 대응 보기' : 'AI 대응 생성'}
    </button>
  )
}

function AdviceResult({ id, advice }: { id: string; advice: FindingAdvice }) {
  const shown = advice.shown(id)
  if (!shown) return null
  return shown.status === 'GENERATED' ? <AdviceBody advice={shown} />
    : <p className="notice">{adviceReason(shown)}. 잠시 뒤 다시 눌러 보세요.</p>
}

function Vulnerabilities({ content, advice }: { content: ReportContent; advice: FindingAdvice }) {
  const v = content.vulnerabilities
  return (
    <section className="card" id="report-vulnerabilities" aria-labelledby="report-vulnerabilities-title">
      <SectionHead index={1} sub={v.unit} />
      <div className="report-strip">
        {SEVERITIES.map((s) => (
          <div key={s} className={`report-strip-cell ${severityTone[s]}`.trim()}>
            <span className="caption">{severityLabel[s]}</span>
            <strong>{content.overview.connected ? v.severityCounts[s] ?? 0 : '—'}</strong>
          </div>
        ))}
      </div>
      {content.overview.connected && <p className="caption report-footnote">
        기한 초과 <strong className={v.overdue ? 'report-danger' : ''}>{v.overdue}</strong>건 · 7일 안 {v.dueSoon}건 ·
        기본 기한으로 계산 {v.byDefault}건 (Critical 15일 · High 30일 · Medium 90일 · Low 180일)
      </p>}
      {v.findings.length === 0 ? <p className="notice">{emptyText(content, '열린 취약점이 없어요.')}</p> : (
        <div className="table-scroll report-table" tabIndex={0} role="region" aria-label="발견된 취약점 표">
          <table>
            <thead>
              <tr>
                <th scope="col">위험도</th>
                <th scope="col">취약점</th>
                <th scope="col">위치</th>
                <th scope="col">발견일</th>
                <th scope="col">기한</th>
                <th scope="col">AI 대응 방법</th>
              </tr>
            </thead>
            <tbody>
              {v.findings.map((f) => (
                <Fragment key={f.id}>
                  <tr id={`finding-${f.id}`}>
                    <td><SeverityBadge severity={f.severity} /></td>
                    <td><strong>{f.title}</strong><div className="caption">{f.id} · {f.evidence}</div></td>
                    <td>{f.location}</td>
                    <td>{formatDay(f.foundAt)}</td>
                    <td>{dueText(f)}</td>
                    <td><AdviceButton id={f.id} advice={advice} /></td>
                  </tr>
                  {advice.shown(f.id) && (
                    <tr className="report-advice-row">
                      <td colSpan={6}><AdviceResult id={f.id} advice={advice} /></td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** AI 대응 방법: 요약 불릿 → 순위가 붙은 추천(제목 · 이유 한 줄, 단계) */
function AdviceBody({ advice }: { advice: ReportAdvice }) {
  return (
    <div className="report-advice">
      <ul className="report-points">{advice.points.map((p) => <li key={p}>{p}</li>)}</ul>
      {advice.items.map((item, i) => (
        <div key={item.title} className="report-advice-item">
          <p>
            <span className="report-rank-label">{i + 1}순위</span>
            <strong>{item.title}</strong> <span className="caption">· {item.why}</span>
          </p>
          <ol className="report-criteria">{item.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        </div>
      ))}
      <p className="caption">{advice.model} · {formatTime(advice.generatedAt)} · AI 추천은 참고용이에요. 적용 전에 담당자가 확인하세요.</p>
    </div>
  )
}

function Remediation({ content }: { content: ReportContent }) {
  const { actions, advice } = content.remediation
  return (
    <section className="card" id="report-remediation" aria-labelledby="report-remediation-title">
      <SectionHead index={2} sub="여러 취약점에 함께 적용되는 조치 · 해결하는 취약점이 많은 순" />
      {actions.length === 0 ? <p className="notice">{emptyText(content, '공통 조치가 없어요.')}</p> : (
        <div className="report-cards">
          {actions.map((a) => (
            <article key={a.title} className="report-finding">
              <div className="row">
                <span className="report-rank">{a.rank}</span>
                <strong>{a.title}</strong>
                {a.link && <Link className="report-finding-link" to={a.link}>파트 화면에서 보기</Link>}
              </div>
              <p className="report-text">{a.how}</p>
              <div className="report-covers">
                <span className="caption">해결되는 취약점 <strong>{a.findingIds.length}건</strong>{a.impact ? ` · ${a.impact}` : ''}</span>
                <div className="report-part-chips">
                  {a.findingIds.slice(0, 12).map((id) => <a key={id} className="badge" href={`#finding-${id}`}>{id}</a>)}
                  {a.findingIds.length > 12 && <span className="caption">외 {a.findingIds.length - 12}건</span>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <h3 className="report-h3">AI 전체 조치 계획</h3>
      {advice.request && <p className="caption">요청 내용: {advice.request}</p>}
      {advice.status !== 'GENERATED' ? (
        <p className="notice">{adviceReason(advice)}. 위 공통 조치를 참고하세요.</p>
      ) : (
        <div className="report-finding"><AdviceBody advice={advice} /></div>
      )}
    </section>
  )
}

function Priorities({ content, advice }: { content: ReportContent; advice: FindingAdvice }) {
  return (
    <section className="card" id="report-priorities" aria-labelledby="report-priorities-title">
      <SectionHead index={0} sub="기한 초과 → 위험도 → 오래된 순, 급한 것부터 5건" />
      {content.priorities.length === 0 ? <p className="notice">{emptyText(content, '처리할 취약점이 없어요.')}</p> : (
        <ol className="report-priorities">
          {content.priorities.map(({ rank, finding: f, overdue }) => (
            <li key={f.id} className="report-finding">
              <div className="row">
                <span className="report-rank">{rank}</span>
                <SeverityBadge severity={f.severity} />
                <strong>{f.title}</strong>
                {overdue && <Badge label="기한 초과" tone="critical" />}
                <span className="caption">{f.id}</span>
                <span className="report-row-end"><AdviceButton id={f.id} advice={advice} /></span>
              </div>
              <dl className="report-facts">
                {([['대상 자산', f.asset], ['위치', f.location], ['근거', f.evidence], ['대응', f.response],
                  ['발견일', formatDay(f.foundAt)], ['기한', dueText(f)], ['담당', f.assignee], ['조치', f.action]] as const)
                  .map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}
              </dl>
              {advice.shown(f.id) && <div className="report-advice-box"><AdviceResult id={f.id} advice={advice} /></div>}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function Appendix({ content }: { content: ReportContent }) {
  const { scope, criteria, links } = content.appendix
  const o = content.overview
  return (
    <section className="card" id="report-appendix" aria-labelledby="report-appendix-title">
      <SectionHead index={3} sub="점검 범위 · 판단 기준 · 참고 링크" />
      <h3 className="report-h3">점검 범위</h3>
      <dl className="report-facts">
        {scope.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
        <div><dt>데이터 기준 시각</dt><dd>{formatTime(o.dataAsOf)}</dd></div>
        {o.newInPeriod !== null && <div><dt>보고 기간 신규</dt><dd>{o.newInPeriod}건</dd></div>}
        {o.resolvedInPeriod !== null && <div><dt>보고 기간 해결</dt><dd>{o.resolvedInPeriod}건</dd></div>}
      </dl>
      <h3 className="report-h3">판단 기준</h3>
      <ol className="report-criteria">{criteria.map((line) => <li key={line}>{line}</li>)}</ol>
      <h3 className="report-h3">참고 링크</h3>
      <ul className="report-criteria">
        {links.map((link) => (
          <li key={link.url}>
            {link.url.startsWith('/') ? <Link to={link.url}>{link.label}</Link>
              : <a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>}
          </li>
        ))}
      </ul>
      {o.note && <p className="notice">{o.note}</p>}
      <p className="caption report-footnote">
        이 리포트는 생성 시각의 스냅샷이에요. 미평가는 위험이 낮다는 뜻이 아니라 근거가 모자라 등급을 정하지 못했다는 뜻이에요.
        비밀값 · 계정 ID · 내부 식별자는 싣지 않았어요.
      </p>
    </section>
  )
}
