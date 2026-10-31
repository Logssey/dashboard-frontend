import type { CaseRiskSeverity, CaseRiskValidity, WorkbenchFilters } from '../api/secretSummary'
import { workbenchQueuePath } from './secretWorkbench'

export const caseRiskSeverityLabels: Record<CaseRiskSeverity, string> = { CRITICAL: '치명적', HIGH: '높음', MEDIUM: '보통', LOW: '낮음', UNASSESSED: '미평가', NOT_APPLICABLE: '평가 대상 외' }
export const caseRiskValidityLabels: Record<CaseRiskValidity, string> = { VALID: '유효', INVALID: '사용 불가', UNKNOWN: '확인 불가', UNCHECKED: '미검증' }
export const riskSeverities = Object.keys(caseRiskSeverityLabels) as CaseRiskSeverity[]
export const riskValidities = Object.keys(caseRiskValidityLabels) as CaseRiskValidity[]
export interface CaseRiskSelection { severity: string; validity: string }
export function parseCaseRiskSelection(params: URLSearchParams) {
  const severity = params.get('severity') ?? '', validity = params.get('validity') ?? ''
  return { severity, validity, valid: (!severity || Object.hasOwn(caseRiskSeverityLabels, severity)) && (!validity || Object.hasOwn(caseRiskValidityLabels, validity)) }
}
export function caseRiskQueuePath(filters: WorkbenchFilters, snapshotId: string, severity: CaseRiskSeverity, validity?: CaseRiskValidity): string {
  const base = workbenchQueuePath(filters, 'CURRENT_CASES', snapshotId)
  const [path, search] = base.split('?'), params = new URLSearchParams(search)
  params.set('severity', severity)
  if (validity) params.set('validity', validity)
  return `${path}?${params}`
}
export const validRiskCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
