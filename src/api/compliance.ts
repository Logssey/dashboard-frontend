import { apiRequest } from './client'

export type ComplianceEnvironment = 'ALL' | 'PROD' | 'DEV'
export type ComplianceResult = 'PASS' | 'FAIL' | 'ERROR' | 'NEEDS_REVIEW'
export type ComplianceReportFramework = 'all' | 'isms' | 'iso' | 'csap'

export interface ComplianceCounts {
  total: number
  pass: number
  fail: number
  error: number
  needsReview: number
}

export interface ComplianceRun {
  runId: number
  environment: 'prod' | 'dev'
  status: 'COMPLETED' | 'COMPLETED_WITH_WARNINGS'
  source: string
  product: string
  scannerVersion: string
  counts: ComplianceCounts
  duplicateCount: number
  warningCount: number
  createdBy: string
  finishedAt: string
}

export interface FrameworkSummary {
  id: 'isms' | 'iso' | 'csap'
  name: string
  shortName: string
  version: string
  totalControls: number
  technicalFail: number
  technicallySatisfied: number
  needsReview: number
  notAssessed: number
  manualControls: number
}

export interface ComplianceOverview {
  latestRun: ComplianceRun | null
  frameworks: FrameworkSummary[]
}

export interface ComplianceResultItem {
  resultId: number
  checkId: string
  title: string
  provider: string
  result: ComplianceResult
  asset: string
  currentValue: string
  expectedValue: string
  observedAt: string
  region: string
  severity: string
  assetType: string
  guide?: {
    disposition: string
    expectedState: string
    applicability: string
    changeImpact: string
    verification: string
    rollback: string
    sourceUrl: string
    sourceVersion: string
  }
}

export interface ComplianceRunDetail {
  run: ComplianceRun
  frameworks: FrameworkSummary[]
  results: ComplianceResultItem[]
  resultsTruncated: boolean
  assessmentContext: {
    profile: ComplianceAssessmentProfile
    policyVersion: string
    inferredServices: string[]
  }
}

export interface ComplianceCatalog {
  prowlerVersion: string
  generatedAt: string
  frameworks: Array<{
    id: string
    name: string
    shortName: string
    version: string
    status: string
    controls: number
    mappings: number
    manualControls: number
  }>
}

export interface ComplianceScanScope {
  regions: string[]
  services: string[]
  checks: string[]
}

export interface ComplianceScopeCatalog {
  provider: 'aws'
  executionEnabled: boolean
  connectionTestsEnabled: boolean
  prowlerVersion: string
  commit: string
  services: string[]
  checks: Array<{ id: string; service: string }>
}

export type ComplianceJobStatus = 'QUEUED' | 'LEASED' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'

export interface ComplianceScanJob {
  jobId: number
  targetKey: string
  targetName: string
  jobKind: 'ASSESSMENT' | 'CONNECTION_TEST'
  environment: 'prod' | 'dev'
  provider: 'aws'
  status: ComplianceJobStatus
  scope: ComplianceScanScope
  attemptCount: number
  maxAttempts: number
  requestedBy: string
  errorCode: string | null
  runId: number | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export type ComplianceConnectionStatus = 'NOT_TESTED' | 'VERIFYING' | 'VERIFIED' | 'FAILED'
export type ComplianceServiceUsage = 'USED' | 'NOT_USED' | 'UNKNOWN'
export type ComplianceRequirement = 'REQUIRED' | 'NOT_REQUIRED' | 'UNKNOWN'

export interface ComplianceAssessmentProfile {
  schemaVersion: 1
  serviceUsage: Record<string, ComplianceServiceUsage>
  requirements: Record<string, ComplianceRequirement>
}

export interface ComplianceTarget {
  targetKey: string
  displayName: string
  provider: 'aws'
  awsAccountId: string
  roleArn: string
  externalId: string
  defaultRegions: string[]
  enabled: boolean
  assessmentProfile: ComplianceAssessmentProfile
  connectionStatus: ComplianceConnectionStatus
  connectionErrorCode: string | null
  connectionCheckedAt: string | null
  version: number
  createdAt: string
  updatedAt: string
}

const targetQuery = (targetKey: string) => `targetKey=${encodeURIComponent(targetKey)}`

export const fetchComplianceTargets = () =>
  apiRequest<{ items: ComplianceTarget[] }>('/api/v1/compliance/targets')

export const createComplianceTarget = (request: {
  targetKey: string; displayName: string; awsAccountId: string; roleArn: string; defaultRegions: string[]
}) => apiRequest<ComplianceTarget>('/api/v1/compliance/targets', {
  method: 'POST', body: JSON.stringify(request),
})

export const updateComplianceTarget = (target: ComplianceTarget, changes: Partial<Pick<ComplianceTarget,
  'displayName' | 'awsAccountId' | 'roleArn' | 'defaultRegions' | 'enabled' | 'assessmentProfile'>>) =>
  apiRequest<ComplianceTarget>(`/api/v1/compliance/targets/${encodeURIComponent(target.targetKey)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      expectedVersion: target.version,
      displayName: changes.displayName ?? target.displayName,
      awsAccountId: changes.awsAccountId ?? target.awsAccountId,
      roleArn: changes.roleArn ?? target.roleArn,
      defaultRegions: changes.defaultRegions ?? target.defaultRegions,
      enabled: changes.enabled ?? target.enabled,
      assessmentProfile: changes.assessmentProfile ?? target.assessmentProfile,
    }),
  })

export const verifyComplianceTarget = (targetKey: string) =>
  apiRequest<{ jobId: number; status: 'QUEUED' }>(
    `/api/v1/compliance/targets/${encodeURIComponent(targetKey)}/connection-tests`, { method: 'POST' })

export const fetchComplianceOverview = (targetKey: string, environment: ComplianceEnvironment) =>
  apiRequest<ComplianceOverview>(`/api/v1/compliance/overview?${targetQuery(targetKey)}&environment=${environment}`)

export const fetchComplianceRuns = (targetKey: string, environment: ComplianceEnvironment) =>
  apiRequest<{ items: ComplianceRun[] }>(`/api/v1/compliance/runs?${targetQuery(targetKey)}&environment=${environment}&limit=20`)

export const fetchComplianceRun = (targetKey: string, runId: number) =>
  apiRequest<ComplianceRunDetail>(`/api/v1/compliance/runs/${runId}?${targetQuery(targetKey)}`)

export const fetchComplianceCatalog = () =>
  apiRequest<ComplianceCatalog>('/api/v1/compliance/catalog')

export const fetchComplianceScopeCatalog = () =>
  apiRequest<ComplianceScopeCatalog>('/api/v1/compliance/scope-catalog')

export const fetchComplianceJobs = (targetKey: string) =>
  apiRequest<{ items: ComplianceScanJob[] }>(`/api/v1/compliance/jobs?${targetQuery(targetKey)}&limit=20`)

export const createComplianceJob = (targetKey: string, environment: 'prod' | 'dev', scope: ComplianceScanScope) =>
  apiRequest<{ jobId: number; status: 'QUEUED' }>('/api/v1/compliance/jobs', {
    method: 'POST',
    body: JSON.stringify({ targetKey, environment, scope }),
  })

export const cancelComplianceJob = (targetKey: string, jobId: number) =>
  apiRequest<{ jobId: number; status: 'CANCELLED' }>(`/api/v1/compliance/jobs/${jobId}/cancel?${targetQuery(targetKey)}`, {
    method: 'POST',
  })

export const importProwlerResults = (targetKey: string, file: File, environment: 'prod' | 'dev') => {
  const body = new FormData()
  body.append('file', file)
  return apiRequest<{ runId: number }>(`/api/v1/compliance/imports?${targetQuery(targetKey)}&environment=${environment}`, {
    method: 'POST',
    body,
  })
}

export const complianceReportUrl = (targetKey: string, runId: number, framework: ComplianceReportFramework) =>
  `/api/v1/compliance/runs/${runId}/report?${targetQuery(targetKey)}&framework=${framework}`
