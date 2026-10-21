import { Link } from 'react-router-dom'
import { actionLabels, blockerLabels, guidanceTargetPath, priorityLabels, roleLabels, type TaskGuidance } from '@/lib/secretTaskGuidance'
import { scanDate } from '@/lib/secretScan'
import { setupReasonLabels } from '@/lib/secretScopeSetup'
import './secret-task-guidance.css'

export function SecretTaskGuidance({ guidance, compact = false, showLink = false }: { guidance?: TaskGuidance | null; compact?: boolean; showLink?: boolean }) {
  if (!guidance) return null
  const target = guidanceTargetPath(guidance)
  return <div className={`secret-task-guidance${compact ? ' compact' : ''}`}>
    <strong>{actionLabels[guidance.nextActionCode] ?? '다음 작업 확인'}</strong>
    {!!guidance.priorityReasonCodes?.length && <div className="secret-task-reasons">{guidance.priorityReasonCodes.map((code) => <span key={code}>{priorityLabels[code] ?? '추가 확인'}</span>)}</div>}
    {!guidance.canExecute && <p>{blockerLabels[guidance.blockedReasonCode ?? ''] ?? '작업 조건을 확인하세요.'}{guidance.requiredRole && ` 필요한 역할: ${roleLabels[guidance.requiredRole] ?? '담당자'}`}</p>}
    {!compact && <>{guidance.evidenceObservedAt && <p>근거 시각 {scanDate(guidance.evidenceObservedAt)}</p>}{guidance.waitingSince && <p>요청 시각 {scanDate(guidance.waitingSince)}</p>}{!!guidance.remainingReasonCodes?.length && <p>남은 확인: {guidance.remainingReasonCodes.map((code) => setupReasonLabels[code] ?? '검사 근거 확인').join(' · ')}</p>}</>}
    {guidance.relatedTaskId ? <Link to={`/secrets/triage/investigations/${guidance.relatedTaskId}`}>기존 확인 요청</Link> : showLink && target ? <Link to={target}>대상에서 확인</Link> : null}
  </div>
}
