import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/Badge'
import { fetchIacJobs } from './api'
import { formatDateTime, jobLabel, jobStatusBadge } from './labels'

/** 검사 주기와 상태 (S-01 H). 기다리는 작업이 있으면 5초마다 다시 읽는다 */
export function JobSection() {
  const jobs = useQuery({
    queryKey: ['iac', 'jobs'],
    queryFn: fetchIacJobs,
    refetchInterval: (query) => (query.state.data?.some((job) => job.pending > 0) ? 5000 : false),
  })

  return (
    <section className="card list-card" aria-labelledby="iac-jobs-title">
      <div className="card-head">
        <h2 id="iac-jobs-title">검사 주기와 상태</h2>
        <span className="caption">주기는 대시보드 호스트 타이머·CI 워크플로에서 바꿔요</span>
      </div>
      {jobs.isPending ? (
        <div className="iac-card-body"><div className="skeleton" /></div>
      ) : jobs.isError ? (
        <p className="notice error iac-card-body">작업 상태를 불러오지 못했어요.</p>
      ) : (
        <div className="table-scroll" tabIndex={0} role="region" aria-label="검사 작업 표. 좁은 화면에서는 가로로 스크롤하세요.">
          <table>
            <thead>
              <tr>
                <th scope="col">작업</th>
                <th scope="col">주기</th>
                <th scope="col">입력</th>
                <th scope="col">마지막 실행</th>
                <th scope="col">상태</th>
              </tr>
            </thead>
            <tbody>
              {jobs.data.map((job) => (
                <tr key={job.job}>
                  <td><strong>{jobLabel[job.job] ?? job.job}</strong></td>
                  <td>{job.schedule}</td>
                  <td className="muted">{job.input}</td>
                  <td className="muted">{formatDateTime(job.lastFinishedAt)}</td>
                  <td>
                    <div className="row">
                      <Badge {...jobStatusBadge(job)} />
                      {job.lastStatus === 'FAILED' && job.lastErrorCode && <code className="iac-address">{job.lastErrorCode}</code>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
