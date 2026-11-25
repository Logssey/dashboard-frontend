import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchSecurityScore, type SecurityScoreResponse } from '@/api/securityScore'
import { Badge } from '@/components/Badge'
import { ScoreRing } from '@/components/ScoreRing'

// 통합 현황 보안 점수 (dashboard-design-docs ADR-D012). 카드와 자산별 표가 같은 조회 하나를 나눠 쓴다

export const useSecurityScore = () => useQuery({ queryKey: ['overview', 'score'], queryFn: fetchSecurityScore })

const GRADE: Record<string, { label: string; tone: string }> = {
  CRITICAL: { label: 'Critical', tone: 'critical' },
  HIGH: { label: 'High', tone: 'high' },
  MEDIUM: { label: 'Medium', tone: 'medium' },
  LOW: { label: 'Low', tone: '' },
  UNASSESSED: { label: '미평가', tone: '' },
}

/** 통합 현황 첫 줄의 점수 카드. 운영 환경만 계산한다(환경 선택과 관계없음) */
export function SecurityScoreCard() {
  const score = useSecurityScore()
  return (
    <article className="card score-card">
      <div className="row between">
        <h2>보안 점수</h2>
        <Badge label="운영 환경" />
      </div>
      {score.isPending ? (
        <div className="skeleton" />
      ) : score.isError ? (
        <p className="notice error">점수를 불러오지 못했어요.</p>
      ) : (
        <ScoreBody data={score.data} />
      )}
      <p className="caption">
        자산마다 가장 큰 위험 하나만 깎고(Critical 74~99 · High 48~73 · Medium 22~47), 중요 자산일수록 크게 반영해요. 아직 평가하지 못한 자산은 점수에서 빼고 평가 범위로 보여 줘요.
      </p>
    </article>
  )
}

function ScoreBody({ data }: { data: SecurityScoreResponse }) {
  const i = data.indicators
  return (
    <>
      <div className="row between">
        <div>
          <strong className="score-number">{data.score ?? '—'}</strong>
          <span className="unit">/ 100</span>
          <p className="caption">
            평가 범위 {data.coverage}%
            <br />
            열린 Critical {i.openCritical} · 기한 초과 {i.overdue} · 미평가 {i.unassessed}
          </p>
        </div>
        {data.score != null && <ScoreRing score={data.score} />}
      </div>
      {i.staleAssets.length > 0 && (
        <p className="notice">평가가 끊긴 자산: {i.staleAssets.join(', ')}. 마지막 결과와 High 중 큰 감점으로 계산했어요.</p>
      )}
    </>
  )
}

/** 점수 구간 색: 0~49 빨강, 50~79 노랑, 80~100 초록 */
const barColor = (score: number) => (score < 50 ? 'var(--critical)' : score < 80 ? '#e0a63a' : 'var(--success)')

const ROW = {
  display: 'grid',
  gridTemplateColumns: 'minmax(150px, 220px) minmax(140px, 260px) minmax(0, 1fr) 16px',
  gap: 20,
  alignItems: 'center',
  padding: '13px 0',
  borderTop: '1px solid var(--divider)',
} as const

function ScoreBar({ score }: { score: number | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, height: 8, background: '#eef0f3', borderRadius: 99, overflow: 'hidden' }}>
        {score != null && (
          <i style={{ display: 'block', height: '100%', width: `${Math.max(score, 2)}%`, background: barColor(score), borderRadius: 99 }} />
        )}
      </div>
      <strong style={{ width: 34, textAlign: 'right', color: score == null ? 'var(--text-muted)' : 'var(--text)' }}>{score ?? '—'}</strong>
    </div>
  )
}

/** 응답에 link가 없을 때(옛 서버) 기능 화면으로 */
const PART_LINK: Record<string, string> = {
  SECRET: '/secrets',
  IAC: '/iac',
  VULNERABILITY: '/vulnerabilities',
  COMPLIANCE: '/configuration',
  CODE: '/code',
}

const ellipsis = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const

type Asset = SecurityScoreResponse['assets'][number]

/** 자산 한 줄. 위험을 볼 화면이 있으면 줄 전체가 링크다. nested면 묶음 아래 펼친 줄이라 이름을 들여 쓴다 */
function AssetRow({ asset, nested = false }: { asset: Asset; nested?: boolean }) {
  const grade = asset.worst ? GRADE[asset.worst.grade]?.label ?? asset.worst.grade : null
  const link = asset.worst ? asset.worst.link ?? PART_LINK[asset.worst.part] : undefined
  const cells = (
    <>
      <div style={{ ...ellipsis, paddingLeft: nested ? 18 : 0 }}>
        <strong>{asset.name}</strong> <span className="caption">{asset.tier}등급</span>
        {asset.status === 'STALE' && <> <Badge label="평가 끊김" tone="high" /></>}
      </div>
      <ScoreBar score={asset.score} />
      <span className="caption" style={ellipsis} title={asset.worst?.title}>
        {asset.worst ? `${grade} · ${asset.worst.title}` : asset.status === 'STALE' ? '검사가 끊겨 High로 계산했어요' : '열린 위험 없음'}
      </span>
      <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>{link ? '›' : ''}</span>
    </>
  )
  return link ? (
    <Link role="listitem" to={link} className="score-asset-row" style={{ ...ROW, color: 'inherit', textDecoration: 'none' }}
      aria-label={`${asset.name} ${asset.score ?? '—'}점, ${grade ?? ''} ${asset.worst?.title ?? ''} 보기`}>
      {cells}
    </Link>
  ) : (
    <div role="listitem" style={ROW}>{cells}</div>
  )
}

/** 점수가 같은 자산 묶음. 처음엔 접혀 있고 누르면 자산별 줄이 아래에 펼쳐진다 */
function AssetGroup({ assets, open, onToggle }: { assets: Asset[]; open: boolean; onToggle: () => void }) {
  const score = assets[0].score
  const grades = [...new Set(assets.map((a) => a.worst?.grade).filter((g): g is string => g != null))]
  const names = assets.map((a) => a.name).join(' · ')
  // 모두 같은 등급이면 앞에 등급을 붙인다(같은 점수면 보통 같은 등급)
  const summary = grades.length === 1 ? `${GRADE[grades[0]]?.label ?? grades[0]} · ${names}` : names
  return (
    <div role="listitem">
      <button type="button" className="score-asset-row" aria-expanded={open} onClick={onToggle}
        style={{ border: 0, ...ROW, width: '100%', background: 'none', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
        <div style={ellipsis}>
          <strong>{score ?? '—'}점 자산</strong> <span className="caption">{assets.length}개</span>
          {assets.some((a) => a.status === 'STALE') && <> <Badge label="평가 끊김" tone="high" /></>}
        </div>
        <ScoreBar score={score} />
        <span className="caption" style={ellipsis} title={names}>{summary}</span>
        <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div role="list" aria-label={`${score ?? '—'}점 자산`}>
          {assets.map((asset) => <AssetRow key={asset.id} asset={asset} nested />)}
        </div>
      )}
    </div>
  )
}

/**
 * 자산별 보안 점수. 점수가 낮은 자산부터 막대로 보여 주고, 감점을 정한 위험 하나를 붙인다.
 * 점수가 같은 자산이 둘 이상이면 한 줄로 묶어 접어 두고(누르면 펼침), 평가 안 된 자산은 따로 접어 둔다
 */
export function SecurityScoreAssets() {
  const score = useSecurityScore()
  const [showUnevaluated, setShowUnevaluated] = useState(false)
  // 펼친 묶음의 점수. 조회할 때마다 다시 묶으므로 점수가 바뀌면 자산이 다른 묶음으로 옮겨 간다
  const [openScores, setOpenScores] = useState<ReadonlySet<number | null>>(new Set())
  if (!score.isSuccess) return null
  const assets = score.data.assets
  const unevaluated = assets.filter((a) => a.status === 'NOT_EVALUATED')
  const ranked = assets
    .filter((a) => a.status !== 'NOT_EVALUATED')
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0) || a.tier - b.tier)
  const groups: Asset[][] = []
  for (const asset of ranked) {
    const last = groups.at(-1)
    if (last && last[0].score === asset.score) last.push(asset)
    else groups.push([asset])
  }
  const toggle = (s: number | null) =>
    setOpenScores((prev) => {
      const next = new Set(prev)
      if (!next.delete(s)) next.add(s)
      return next
    })
  return (
    <section className="card" aria-labelledby="score-assets-title">
      <style>{'.score-asset-row:hover{background:var(--surface-subtle)}.score-asset-row:hover strong{color:var(--primary-text)}'}</style>
      <div className="card-head">
        <h2 id="score-assets-title">자산별 보안 점수</h2>
        {unevaluated.length > 0 && (
          <span className="caption">
            평가 안 됨 {unevaluated.length}개 ({unevaluated.map((a) => a.name).join(', ')}) {showUnevaluated ? '' : '숨김 '}
            <button type="button" style={{ color: 'var(--primary-text)', fontWeight: 600, background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
              onClick={() => setShowUnevaluated((v) => !v)}>
              {showUnevaluated ? '접기' : '보기'}
            </button>
          </span>
        )}
      </div>
      <div role="list">
        {groups.map((group) =>
          group.length === 1 ? (
            <AssetRow key={group[0].id} asset={group[0]} />
          ) : (
            <AssetGroup key={`score-${group[0].score}`} assets={group} open={openScores.has(group[0].score)} onToggle={() => toggle(group[0].score)} />
          ),
        )}
        {showUnevaluated &&
          unevaluated.map((asset) => (
            <div role="listitem" key={asset.id} style={{ ...ROW, opacity: 0.7 }}>
              <div style={ellipsis}>
                <strong>{asset.name}</strong> <span className="caption">{asset.tier}등급</span>
              </div>
              <ScoreBar score={null} />
              <span className="caption">평가 안 됨 · 검사 결과가 없거나 기준 기간 안에 성공한 검사가 없어요</span>
            </div>
          ))}
      </div>
    </section>
  )
}
