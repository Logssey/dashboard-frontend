import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/Badge'
import { EmptyState } from '@/components/EmptyState'
import { fetchIacDrifts, fetchIacJobs, fetchIacStateSummary } from './api'
import { driftLevel, formatDateTime, severityLabel, severityTone } from './labels'

/** 아직 계산하지 않는 값은 0 이 아니라 — 로 둔다 */
const countText = (value: number | null) => (value === null ? '—' : `${value}개`)

/** 상태 파일과 설정 변경 (S-01 F). 드리프트는 속성 이름만 보여주고 값은 다루지 않는다 */
export function StateSection() {
  const state = useQuery({ queryKey: ['iac', 'state'], queryFn: fetchIacStateSummary })
  const drifts = useQuery({ queryKey: ['iac', 'drifts', 'OPEN'], queryFn: fetchIacDrifts })
  // 드리프트 점검(main 매일 점검)을 한 번도 하지 않았으면 "없음"과 구분한다. 검사 주기 표와 같은 요청을 나눠 쓴다
  const jobs = useQuery({ queryKey: ['iac', 'jobs'], queryFn: fetchIacJobs })
  const driftChecked = jobs.data?.find((job) => job.job === 'CHECK_DRIFT')?.lastFinishedAt != null
  const buckets = state.data?.tfstate ?? []

  return (
    <section className="card list-card" aria-labelledby="iac-state-title">
      <div className="card-head">
        <h2 id="iac-state-title" tabIndex={-1}>상태 파일과 설정 변경</h2>
        <span className="caption">State 점검 {formatDateTime(state.data?.checkedAt ?? null)}</span>
      </div>

      <div className="iac-card-body">
        {state.isPending ? (
          <div className="skeleton" />
        ) : state.isError || !state.data ? (
          <p className="notice error">State 점검 결과를 불러오지 못했어요.</p>
        ) : state.data.checkedAt === null ? (
          <p className="notice">State 점검 기록이 아직 없어요.</p>
        ) : (
          <>
            <dl className="facts iac-facts-wide">
              <dt>tfstate 를 읽을 수 있는 주체</dt>
              <dd>{state.data.readerCount}개</dd>
              <dt>민감 값 후보 → 실제</dt>
              <dd>{countText(state.data.sensitiveCandidates)} → {countText(state.data.sensitiveActual)}</dd>
              <dt>버킷 정책 점검</dt>
              <dd>{state.data.bucketPolicy === null ? '—' : '점검함'}</dd>
            </dl>
            {buckets.map((bucket) => (
              <div key={bucket.arn} className="iac-bucket">
                <span className="caption" title={bucket.arn}>{bucket.name}</span>
                <div className="iac-hops">
                  {bucket.readers.map((reader) => (
                    <span key={`${reader.kind}-${reader.name}`} className="iac-hop">
                      <b>{reader.kind === 'AWSUser' ? '사용자' : reader.kind === 'AWSGroup' ? '그룹' : '역할'}</b>
                      <span>{reader.name}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <h3 className="iac-subhead">확인이 필요한 설정 변경</h3>
      {drifts.isPending ? (
        <div className="iac-card-body"><div className="skeleton" /></div>
      ) : drifts.isError ? (
        <p className="notice error iac-card-body">드리프트 목록을 불러오지 못했어요.</p>
      ) : drifts.data.length === 0 && jobs.isSuccess && !driftChecked ? (
        <EmptyState title="드리프트 점검 기록 없음" description="main 매일 점검(iac-drift)이 한 번 돌면 코드 밖에서 바뀐 리소스가 여기에 보여요." />
      ) : drifts.data.length === 0 ? (
        <EmptyState title="확인이 필요한 설정 변경 없음" description="코드 밖에서 바뀐 리소스가 없어요. 태그·노이즈 속성 변경은 빼고 셉니다." />
      ) : (
        <div className="table-scroll" tabIndex={0} role="region" aria-label="확인이 필요한 설정 변경 표. 좁은 화면에서는 가로로 스크롤하세요.">
          <table>
            <thead>
              <tr>
                <th scope="col">정도</th>
                <th scope="col">리소스</th>
                <th scope="col">바뀐 속성</th>
                <th scope="col">마지막 확인</th>
                <th scope="col">조치</th>
              </tr>
            </thead>
            <tbody>
              {drifts.data.map((drift) => {
                const level = driftLevel[drift.ruleId] ?? { label: drift.ruleId, tone: '' }
                return (
                  <tr key={drift.findingId}>
                    <td>
                      <div className="row">
                        <Badge label={level.label} tone={level.tone} />
                        {drift.severity && <Badge label={severityLabel[drift.severity]} tone={severityTone[drift.severity]} />}
                      </div>
                    </td>
                    <td>
                      <code className="iac-address">{drift.address}</code>
                      <span className="caption"> {drift.action === 'delete' ? '코드 밖에서 삭제됨' : '코드 밖에서 변경됨'}</span>
                    </td>
                    <td>{drift.attributes.length > 0 ? drift.attributes.join(', ') : <span className="muted">—</span>}</td>
                    <td className="muted">{formatDateTime(drift.lastSeenAt)}</td>
                    <td>
                      <Link className="finding-link" to={`/iac/findings/${drift.findingId}`} state={{ from: "/iac/changes" }}>조치 관리</Link>
                      <span className="asset">{drift.assigneeUserId ? `담당자 #${drift.assigneeUserId}` : "미지정"}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
