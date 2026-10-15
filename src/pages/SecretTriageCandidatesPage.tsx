import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { fetchSecretTriageCandidates } from '@/api/secretTriage'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { componentStateLabel, credentialTypeLabel, issuerLabel } from '@/lib/labels'
import './secret-triage.css'

const pageSize = 20

export function SecretTriageCandidatesPage() {
  const [page, setPage] = useState(0)
  const candidates = useQuery({
    queryKey: ['secret-triage-candidates', page],
    queryFn: () => fetchSecretTriageCandidates(page, pageSize),
  })
  const pageCount = candidates.data ? Math.ceil(candidates.data.total / pageSize) : 0

  return <>
    <PageHeader title="수동 노출 판정" description="보안 담당자가 승인된 연결의 발견 위치를 검토하고, 근거를 남겨 대응 건을 등록해요." actions={
      <Link className="btn outline" to="/secrets/cases">대응 관리로</Link>
    } />
    <p className="notice secret-triage-intro">키 형식 탐지 결과는 노출 판정이 아니에요. 위치와 승인 범위를 확인한 뒤 TEST 또는 PRODUCTION을 구분하고, 판정 사유를 기록해 주세요. 키 원문이나 자유 입력 근거는 이 화면에 저장하지 않아요.</p>
    <section className="card list-card secret-triage-candidates" aria-labelledby="secret-triage-candidates-title">
      <div className="card-head"><div>
        <h2 id="secret-triage-candidates-title">검토 가능한 키</h2>
        <p className="caption">보안 담당자 권한이 있는 승인 범위만 표시해요. {candidates.isSuccess ? `전체 ${candidates.data.total}건` : '조회 중'}</p>
      </div></div>
      {candidates.isPending ? <div className="skeleton" />
        : candidates.isError ? <p className="notice error" role="alert">{
          candidates.error instanceof ApiError && candidates.error.status === 403
            ? '조회할 수 있는 Secret 보안 담당자 권한이 없어요.'
            : '판정 후보를 불러오지 못했어요.'
        } <button className="btn outline" type="button" onClick={() => void candidates.refetch()}>다시 조회</button></p>
          : candidates.data.items.length === 0 ? <EmptyState title="검토 가능한 키가 없어요" description="승인된 GitHub 연결에 발견 위치가 생기면 여기에 표시돼요." />
            : <div className="table-scroll" tabIndex={0} role="region" aria-label="수동 노출 판정 후보 목록. 좁은 화면에서는 가로로 스크롤해요.">
              <table><thead><tr><th scope="col">마스킹된 키</th><th scope="col">발급자·종류</th><th scope="col">구성</th><th scope="col">발견 위치</th><th scope="col"><span className="sr-only">판정</span></th></tr></thead>
                <tbody>{candidates.data.items.map((item) => <tr key={item.secretId}>
                  <td><strong>{item.maskedLabel || '마스킹된 키'}</strong></td>
                  <td>{issuerLabel[item.issuer]} · {credentialTypeLabel(item.credentialType)}</td>
                  <td>{componentStateLabel[item.componentState]}</td>
                  <td>{item.occurrenceCount}곳</td>
                  <td><Link className="secret-triage-target-link" to={`/secrets/triage/${item.secretId}`}>위치 확인</Link></td>
                </tr>)}</tbody>
              </table>
            </div>}
      {candidates.isSuccess && candidates.data.total > 0 && <div className="table-foot secret-triage-candidates-foot">
        <span>전체 {candidates.data.total}건 중 {candidates.data.items.length}건 표시</span>
        {(pageCount > 1 || page > 0) && <div className="row">
          <button className="btn outline" type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>이전</button>
          <span>{page + 1} / {Math.max(pageCount, 1)}</span>
          <button className="btn outline" type="button" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>다음</button>
        </div>}
      </div>}
    </section>
  </>
}
