import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { Badge } from '@/components/Badge'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { PageHeader } from '@/components/PageHeader'
import { createReport, deleteReport, fetchReportOptions, fetchReports, reportPrintUrl } from './api'
import { PARTS, defaultName, defaultPeriod, formatTime, partLabel, partsFromQuery } from './labels'
import type { ReportListItem, ReportOptions, ReportPart } from './types'
import './report.css'

/** 리포트 목록 + 새 리포트. 리포트 하나는 파트 하나를 담는다 */
export function ReportListPage() {
  const [params, setParams] = useSearchParams()
  const creating = params.get('new') === '1'
  const [created, setCreated] = useState<number | null>(null)
  const reports = useQuery({ queryKey: ['reports'], queryFn: fetchReports })
  const options = useQuery({ queryKey: ['reports', 'options'], queryFn: fetchReportOptions })

  return (
    <>
      <PageHeader
        title="리포트"
        description="파트별 보안 결과를 발견된 취약점 · 조치 방안 · 처리 우선순위 · 부록으로 정리한 스냅샷이에요."
        actions={!creating && (
          <button className="btn primary" onClick={() => setParams({ new: '1' })}><Icon name="plus" />새 리포트</button>
        )}
      />
      <div className="stack">
        {created !== null && <p className="notice" role="status">리포트 {created}개를 만들었어요.</p>}
        {creating && options.data && (
          <NewReportForm options={options.data} initialParts={partsFromQuery(params.get('part'), options.data.connectedParts)}
            onCancel={() => setParams({})} onCreatedMany={(count) => { setCreated(count); setParams({}) }} />
        )}
        {creating && options.isError && <p className="notice error" role="alert">리포트 설정을 불러오지 못했어요.</p>}
        <section className="card list-card" aria-labelledby="report-list-title">
          <div className="card-head">
            <h2 id="report-list-title">리포트 목록</h2>
            <span className="caption">최근 50개</span>
          </div>
          {reports.isPending ? (
            <div className="report-card-body"><div className="skeleton" /></div>
          ) : reports.isError ? (
            <p className="notice error report-card-body" role="alert">리포트 목록을 불러오지 못했어요.</p>
          ) : reports.data.length === 0 ? (
            <EmptyState title="아직 만든 리포트가 없어요" description="‘새 리포트’로 기간과 파트를 골라 만들어 보세요." />
          ) : (
            <ReportTable items={reports.data} />
          )}
        </section>
      </div>
    </>
  )
}

function ReportTable({ items }: { items: ReportListItem[] }) {
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: deleteReport,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['reports'] }),
  })
  const confirmDelete = (item: ReportListItem) => {
    if (window.confirm(`‘${item.name}’을 삭제할까요?\n목록과 보기에서 사라지고, 삭제 기록만 남아요.`)) remove.mutate(item.reportId)
  }

  return (
    <>
      {remove.isError && <p className="notice error report-card-body" role="alert">리포트를 삭제하지 못했어요.</p>}
      <div className="table-scroll" tabIndex={0} role="region" aria-label="리포트 목록 표. 좁은 화면에서는 가로로 스크롤하세요.">
        <table>
          <thead>
            <tr>
              <th scope="col">리포트</th>
              <th scope="col">파트</th>
              <th scope="col">보고 기간</th>
              <th scope="col">Critical</th>
              <th scope="col">생성</th>
              <th scope="col" aria-label="동작" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.reportId}>
                <td>
                  <Link className="finding-link" to={`/reports/${item.reportId}`}>{item.name}</Link>
                  <div className="caption">RPT-{item.reportId}</div>
                </td>
                <td><Badge label={partLabel[item.part]} /></td>
                <td>{item.periodFrom} ~ {item.periodTo}</td>
                <td>{item.connected
                  ? <Badge label={`Critical ${item.critical}`} tone={item.critical ? 'critical' : ''} />
                  : <Badge label="데이터 연결 전" />}</td>
                <td>
                  {formatTime(item.createdAt)}
                  <div className="caption">{item.createdBy}</div>
                </td>
                <td className="report-row-actions">
                  <Link className="btn outline" to={`/reports/${item.reportId}`}>보기</Link>
                  <a className="btn soft" href={reportPrintUrl(item.reportId)} target="_blank" rel="noreferrer">
                    <Icon name="download" />인쇄·PDF
                  </a>
                  <button className="btn outline report-delete" onClick={() => confirmDelete(item)}
                    disabled={remove.isPending && remove.variables === item.reportId}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function NewReportForm({ options, initialParts, onCancel, onCreatedMany }: {
  options: ReportOptions
  initialParts: ReportPart[]
  onCancel: () => void
  onCreatedMany: (count: number) => void
}) {
  const period = defaultPeriod()
  const [name, setName] = useState('')
  const [from, setFrom] = useState(period.from)
  const [to, setTo] = useState(period.to)
  const [parts, setParts] = useState<ReportPart[]>(initialParts)
  const [aiRequest, setAiRequest] = useState('')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: createReport,
    onSuccess: ({ reportIds }) => {
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
      if (reportIds.length === 1) navigate(`/reports/${reportIds[0]}`)
      else onCreatedMany(reportIds.length)
    },
  })

  const toggle = (part: ReportPart) =>
    setParts((current) => current.includes(part) ? current.filter((p) => p !== part) : PARTS.filter((p) => p === part || current.includes(p)))

  const invalidPeriod = !from || !to || from > to || to > period.to
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (invalidPeriod || parts.length === 0) return
    create.mutate({ name: name.trim() || null, periodFrom: from, periodTo: to, parts, aiRequest: aiRequest.trim() || null })
  }

  return (
    <section className="card" aria-labelledby="report-new-title">
      <div className="card-head">
        <h2 id="report-new-title">새 리포트</h2>
        <span className="caption">지금 시각의 값으로 스냅샷을 만들어요</span>
      </div>
      <form className="report-form" onSubmit={submit}>
        <fieldset className="report-form-parts">
          <legend>파트 <span className="caption">· 고른 파트마다 리포트가 하나씩 만들어져요</span></legend>
          {PARTS.map((part) => {
            const connected = options.connectedParts.includes(part)
            return (
              <label key={part} className="report-part-option">
                <input type="checkbox" checked={parts.includes(part)} onChange={() => toggle(part)} />
                <span>{partLabel[part]}</span>
                {!connected && <span className="caption">데이터 연결 전 · 지금은 빈 리포트로 만들어져요</span>}
              </label>
            )
          })}
        </fieldset>
        {parts.length === 0 && <p className="field-error">파트를 하나 이상 골라 주세요.</p>}
        <label className="field">
          <span>이름 (비우면 파트와 기간으로 만들어요)</span>
          <input className="input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)}
            placeholder={defaultName(parts, from, to)} />
        </label>
        <div className="report-form-period">
          <label className="field">
            <span>보고 기간 시작</span>
            <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span>보고 기간 끝</span>
            <input className="input" type="date" value={to} max={period.to} onChange={(e) => setTo(e.target.value)}
              aria-invalid={invalidPeriod} />
          </label>
        </div>
        {invalidPeriod && <p className="field-error">기간을 다시 골라 주세요. 끝은 오늘보다 늦을 수 없어요.</p>}
        <label className="field">
          <span>AI 추천 시 고려할 조건 (선택)</span>
          <textarea className="input report-ai-input" value={aiRequest} maxLength={1000} rows={3}
            onChange={(e) => setAiRequest(e.target.value)}
            placeholder="예: 다음 배포 전까지 / 운영 중단 없이 / 이번 주는 Critical만" />
          <span className="caption">
            {options.aiEnabled
              ? '일정·운영 제약을 적으면 AI 추천의 순서와 단계에 반영돼요. 리포트의 숫자와 목록은 바뀌지 않아요. 비밀값이나 계정 정보는 쓰지 마세요.'
              : 'AI 추천이 꺼져 있어 공통 조치 방안만 들어가요. 적은 내용은 리포트에 요청 내용으로 남아요.'}
          </span>
        </label>
        {create.isError && (
          <p className="notice error" role="alert">
            리포트를 만들지 못했어요.{create.error instanceof ApiError && create.error.message ? ` ${create.error.message}` : ''}
          </p>
        )}
        <div className="row">
          <button className="btn primary" type="submit" disabled={create.isPending || invalidPeriod || parts.length === 0}>
            {create.isPending ? (options.aiEnabled ? 'AI 추천을 받는 중… (최대 1분)' : '만드는 중…') : '리포트 만들기'}
          </button>
          <button className="btn outline" type="button" onClick={onCancel} disabled={create.isPending}>취소</button>
        </div>
      </form>
    </section>
  )
}
