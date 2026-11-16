import { Link } from 'react-router-dom'
import type { WorkbenchFilters, WorkbenchSummary } from '@/api/secretSummary'
import { setupReasonLabels } from '@/lib/secretScopeSetup'
import { scanReason } from '@/lib/secretScan'
import { workbenchQueuePath } from '@/lib/secretWorkbench'

const reasonLabels: Record<string, string> = {
  INCOMPLETE_CREDENTIAL: '키 구성의 일부만 발견',
  POLICY_REVIEW_REQUIRED: '보관 정책 검토',
  EXPOSURE_REVIEW_REQUIRED: '발견 위치 검토',
  CASE_LINK_REQUIRED: '확인된 노출의 대응 연결',
}

export function SecretCommonCauses({ summary, filters }: { summary: WorkbenchSummary; filters: WorkbenchFilters }) {
  const groups = summary.commonCauseGroups?.filter((group) => group.count > 0) ?? []
  if (!groups.length) return null
  return <details className="secret-common-causes">
    <summary>연결별 공통 원인 {groups.length}개</summary>
    <p>같은 원인으로 연결된 항목을 모아 확인하세요.</p>
    <ul>{groups.map((group) => {
      const scoped = group.unit === 'Scope' || group.target.type === 'SCOPE'
      const href = scoped
        ? `/secrets/connections/${group.connectionId}/scopes`
        : workbenchQueuePath({ ...filters, connectionId: group.connectionId }, 'REVIEW_REQUIRED', '')
      const label = reasonLabels[group.code] ?? setupReasonLabels[group.code] ?? scanReason(group.code)
      return <li key={`${group.connectionId}:${group.unit}:${group.code}`}>
        <div><strong>{label}</strong><span>{group.connectionLabel ?? `연결 #${group.connectionId}`} · {group.count}{scoped ? '개 검사 대상' : '곳의 발견 위치'}</span></div>
        <Link to={href}>{scoped ? '연결 설정 확인' : '관련 발견 보기'}</Link>
      </li>
    })}</ul>
  </details>
}
