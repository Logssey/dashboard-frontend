import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/Badge'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { PageHeader } from '@/components/PageHeader'
import { formatTime } from '@/report/labels'
import { CODE_REPORT_URL, fetchCodeOverview } from './api'
import { SEVERITIES, commitUrl, location, repoName, ruleName, severityLabel, severityTone, sourceUrl, toolLabel } from './labels'
import type { CodeFinding, CodeScan, CodeSeverity } from './types'
import './code.css'

/** 코드 취약점(SAST). 서비스 레포 CI 가 올린 마지막 검사 결과를 보여 주기만 한다 (조치·상태 관리 없음) */
export function CodeScanPage() {
  const overview = useQuery({ queryKey: ['code', 'findings'], queryFn: fetchCodeOverview })

  return (
    <>
      <PageHeader
        title="코드 취약점"
        description="서비스 코드를 정적 분석(Semgrep · SpotBugs·FindSecBugs)으로 검사한 결과예요. develop에 반영될 때마다 다시 검사해요."
        actions={overview.data && overview.data.scans.length > 0 && (
          <a className="btn soft" href={CODE_REPORT_URL} target="_blank" rel="noreferrer"><Icon name="download" />리포트 (HTML)</a>
        )}
      />
      <div className="stack">
        {overview.isPending ? (
          <section className="card"><div className="code-card-body"><div className="skeleton" /></div></section>
        ) : overview.isError ? (
          <p className="notice error" role="alert">코드 검사 결과를 불러오지 못했어요.</p>
        ) : overview.data.scans.length === 0 ? (
          <section className="card">
            <EmptyState title="아직 올라온 검사 결과가 없어요"
              description="서비스 레포의 code-scan 워크플로가 develop에서 돌면 여기에 나타나요." />
          </section>
        ) : (
          <>
            <ScanTable scans={overview.data.scans} />
            <FindingSection scans={overview.data.scans} findings={overview.data.findings} />
          </>
        )}
      </div>
    </>
  )
}

function ScanTable({ scans }: { scans: CodeScan[] }) {
  return (
    <section className="card list-card" aria-labelledby="code-scan-title">
      <div className="card-head">
        <h2 id="code-scan-title">레포별 마지막 검사</h2>
        <span className="caption">레포 · 도구마다 마지막 검사만 남겨요</span>
      </div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="레포별 마지막 검사 표. 좁은 화면에서는 가로로 스크롤하세요.">
        <table>
          <thead>
            <tr>
              <th scope="col">레포</th>
              <th scope="col">도구</th>
              <th scope="col">커밋</th>
              <th scope="col">검사 시각</th>
              {SEVERITIES.map((s) => <th key={s} scope="col" className="code-num">{severityLabel[s]}</th>)}
            </tr>
          </thead>
          <tbody>
            {scans.map((scan) => (
              <tr key={`${scan.repository}:${scan.tool}`}>
                <td>{repoName(scan.repository)}</td>
                <td>{toolLabel(scan.tool)}</td>
                <td>
                  <a className="finding-link code-mono" href={commitUrl(scan.repository, scan.commit)} target="_blank" rel="noreferrer">
                    {scan.commit.slice(0, 7)}
                  </a>
                </td>
                <td>{formatTime(scan.scannedAt)}</td>
                <td className="code-num">{scan.high}</td>
                <td className="code-num">{scan.medium}</td>
                <td className="code-num">{scan.low}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {scans.some((scan) => scan.total > scan.high + scan.medium + scan.low) && (
        <p className="caption code-card-body">발견이 1,000건을 넘는 검사는 앞의 1,000건만 보여요.</p>
      )}
    </section>
  )
}

function FindingSection({ scans, findings }: { scans: CodeScan[]; findings: CodeFinding[] }) {
  const [repo, setRepo] = useState('')
  const [severity, setSeverity] = useState<CodeSeverity | ''>('')
  const [tool, setTool] = useState('')
  const repos = useMemo(() => [...new Set(scans.map((s) => s.repository))], [scans])
  const tools = useMemo(() => [...new Set(scans.map((s) => s.tool))], [scans])
  const shown = findings.filter((f) => (!repo || f.repository === repo) && (!severity || f.severity === severity) && (!tool || f.tool === tool))

  return (
    <section className="card list-card" aria-labelledby="code-finding-title">
      <div className="card-head">
        <h2 id="code-finding-title">발견 목록</h2>
        <span className="caption">{shown.length}건</span>
      </div>
      <div className="toolbar">
        <div className="code-filters">
          <label className="field">레포
            <select className="select" value={repo} onChange={(e) => setRepo(e.target.value)}>
              <option value="">전체</option>
              {repos.map((r) => <option key={r} value={r}>{repoName(r)}</option>)}
            </select>
          </label>
          <label className="field">심각도
            <select className="select" value={severity} onChange={(e) => setSeverity(e.target.value as CodeSeverity | '')}>
              <option value="">전체</option>
              {SEVERITIES.map((s) => <option key={s} value={s}>{severityLabel[s]}</option>)}
            </select>
          </label>
          <label className="field">도구
            <select className="select" value={tool} onChange={(e) => setTool(e.target.value)}>
              <option value="">전체</option>
              {tools.map((t) => <option key={t} value={t}>{toolLabel(t)}</option>)}
            </select>
          </label>
        </div>
      </div>
      {shown.length === 0 ? (
        <EmptyState title="조건에 맞는 발견이 없어요" description="필터를 바꿔 보세요." />
      ) : (
        <div className="table-scroll" tabIndex={0} role="region" aria-label="코드 취약점 발견 목록 표. 좁은 화면에서는 가로로 스크롤하세요.">
          <table>
            <thead>
              <tr>
                <th scope="col">심각도</th>
                <th scope="col">규칙</th>
                <th scope="col">위치</th>
                <th scope="col">설명</th>
                <th scope="col">도구</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((f, i) => (
                <tr key={`${f.repository}:${f.tool}:${i}`}>
                  <td><Badge label={severityLabel[f.severity]} tone={severityTone[f.severity]} /></td>
                  <td>
                    {f.helpUri
                      ? <a className="finding-link" href={f.helpUri} target="_blank" rel="noreferrer" title={f.ruleId}>{ruleName(f.ruleId)}</a>
                      : <span title={f.ruleId}>{ruleName(f.ruleId)}</span>}
                    {f.cwe && <div className="caption">{f.cwe}</div>}
                  </td>
                  <td>
                    <a className="finding-link code-mono code-path" href={sourceUrl(f)} target="_blank" rel="noreferrer">{location(f)}</a>
                    <div className="caption">{repoName(f.repository)}</div>
                  </td>
                  <td className="code-message">{f.message}</td>
                  <td>{toolLabel(f.tool)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
