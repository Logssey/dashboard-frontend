import type { InvestigationDetail } from '@/api/secretInvestigations'
import { positiveId } from './secretScan'
export function investigationClosureOptions(task: InvestigationDetail) {
  const eligible = task.eligibleClosureEvidence
  return [
    ...(eligible?.decisions ?? []).map((entry) => ({ value: `decision:${entry.decisionId}`, label: `위치 판정 #${entry.decisionId}` })),
    ...(eligible?.runScopes ?? []).map((entry) => ({ value: `scope:${entry.runScopeId}`, label: `복구 검사 SCAN-${entry.runId}` })),
    ...(eligible?.scopeDecisions ?? []).map((entry) => ({ value: `origin:${entry.scopeOriginDecisionId}`, label: `출처 결정 #${entry.scopeOriginDecisionId}` })),
    ...(eligible?.policyBindings ?? []).map((entry) => ({ value: `policy:${entry.policyBindingId}`, label: `보관 정책 적용 #${entry.policyBindingId}` })),
    ...(eligible?.acceptedEvidence ?? []).map((entry) => ({ value: `evidence:${entry.historyId}`, label: `검토 완료 근거 #${entry.historyId}` })),
  ]
}
export function investigationClosureRequest(value: string, version: number) {
  const [type, rawId] = value.split(':'), id = positiveId(rawId)
  return { expectedVersion: version, resolvingDecisionId: type === 'decision' ? id : null, restoredRunScopeId: type === 'scope' ? id : null,
    scopeOriginDecisionId: type === 'origin' ? id : null, policyBindingId: type === 'policy' ? id : null, acceptedEvidenceHistoryId: type === 'evidence' ? id : null }
}
