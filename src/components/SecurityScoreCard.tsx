import { useQuery } from '@tanstack/react-query'
import { fetchSecurityScore, type ScoreAssetStatus, type SecurityScoreResponse } from '@/api/securityScore'
import { Badge } from '@/components/Badge'
import { ScoreRing } from '@/components/ScoreRing'
import { scanDate } from '@/lib/secretScan'

// 통합 현황 보안 점수 (dashboard-design-docs ADR-D012). 카드와 자산별 표가 같은 조회 하나를 나눠 쓴다

export const useSecurityScore = () => useQuery({ queryKey: ['overview', 'score'], queryFn: fetchSecurityScore })

const GRADE: Record<string, { label: string; tone: string }> = {
  CRITICAL: { label: 'Critical', tone: 'critical' },
  HIGH: { label: 'High', tone: 'high' },
  MEDIUM: { label: 'Medium', tone: 'medium' },
  LOW: { label: 'Low', tone: '' },
  UNASSESSED: { label: '미평가', tone: '' },
}

const STATUS: Record<ScoreAssetStatus, { label: string; tone: string }> = {
  EVALUATED: { label: '평가됨', tone: 'success' },
  STALE: { label: '평가 끊김', tone: 'high' },
  NOT_EVALUATED: { label: '평가 안 됨', tone: '' },
}

const NUM = { textAlign: 'right' } as const

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

/** 영역별 점수와 자산별 점수. 감점을 정한 위험 하나와 그 기능을 보여 준다 */
export function SecurityScoreAssets() {
  const score = useSecurityScore()
  if (!score.isSuccess) return null
  const { areas, assets, parts } = score.data
  const partLabel = (part: string) => parts.find((p) => p.part === part)?.label ?? part
  return (
    <section className="card list-card" aria-labelledby="score-assets-title">
      <div className="card-head">
        <div>
          <h2 id="score-assets-title">자산별 보안 점수</h2>
          <p className="section-intro">
            {areas.map((a) => `${a.label} ${a.score ?? '—'}`).join(' · ')}
          </p>
        </div>
        <Badge label={`설정 ${score.data.configVersion}`} />
      </div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="자산별 보안 점수 표. 좁은 화면에서는 가로로 스크롤하세요.">
        <table>
          <thead>
            <tr>
              <th scope="col">자산</th>
              <th scope="col" style={NUM}>중요도</th>
              <th scope="col">상태</th>
              <th scope="col" style={NUM}>점수</th>
              <th scope="col">감점을 정한 위험</th>
              <th scope="col" style={NUM}>열린 위험</th>
              <th scope="col">마지막 평가</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => {
              const status = STATUS[asset.status] ?? STATUS.NOT_EVALUATED
              const grade = asset.worst ? GRADE[asset.worst.grade] ?? { label: asset.worst.grade, tone: '' } : null
              return (
                <tr key={asset.id}>
                  <td>{asset.name}</td>
                  <td style={NUM}>{asset.tier}등급</td>
                  <td><Badge label={status.label} tone={status.tone} /></td>
                  <td style={NUM}><strong>{asset.score ?? '—'}</strong></td>
                  <td>
                    {asset.worst && grade ? (
                      <>
                        <Badge label={grade.label} tone={grade.tone} /> {partLabel(asset.worst.part)} · {asset.worst.title}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={NUM}>{asset.openCount}</td>
                  <td className="caption">{asset.lastEvaluatedAt ? scanDate(asset.lastEvaluatedAt) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="table-foot">점수 = 100 − 감점. 전체 점수는 평가된 자산의 감점을 중요도(1등급 3 · 2등급 2 · 3등급 1)로 평균해요.</div>
    </section>
  )
}
