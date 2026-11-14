import { useQuery } from '@tanstack/react-query'
import { fetchRiskExceptions } from '@/api/secretClosure'
import type { SecretCaseDetail } from '@/api/secretCases'
import { caseStageLabels } from '@/lib/secretResponse'

export function SecretCaseStatus({ detail }: { detail: SecretCaseDetail }) {
  const exceptions = useQuery({ queryKey: ['secret-case-exceptions', detail.caseId], queryFn: () => fetchRiskExceptions(detail.caseId), retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false })
  const data = exceptions.data
  const accepted = data?.caseId === detail.caseId && data.caseVersion === detail.version && data.fullyRiskAccepted === true
  return <div className="secret-response-status"><span className="secret-response-stage">{accepted ? '위험 수용 중' : caseStageLabels[detail.stage] ?? '상태 확인 필요'}</span>{accepted && <p className="caption">조치 단계: {caseStageLabels[detail.stage] ?? '상태 확인 필요'} · 해결과 별도</p>}{exceptions.isError && <p className="caption">위험 수용 현황 조회 실패</p>}{data?.caseId === detail.caseId && data.caseVersion !== null && data.caseVersion !== detail.version && <p className="caption">위험 수용 조건 변경 · 최신 상태 조회 필요</p>}</div>
}
