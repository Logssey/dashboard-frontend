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
}

export interface ComplianceRunDetail {
  run: ComplianceRun
  frameworks: FrameworkSummary[]
  results: ComplianceResultItem[]
  resultsTruncated: boolean
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
  prowlerVersion: string
  commit: string
  services: string[]
  checks: Array<{ id: string; service: string }>
}

export type ComplianceJobStatus = 'QUEUED' | 'LEASED' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'

export interface ComplianceScanJob {
  jobId: number
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

export const fetchComplianceOverview = (environment: ComplianceEnvironment) =>
  apiRequest<ComplianceOverview>(`/api/v1/compliance/overview?environment=${environment}`)

export const fetchComplianceRuns = (environment: ComplianceEnvironment) =>
  apiRequest<{ items: ComplianceRun[] }>(`/api/v1/compliance/runs?environment=${environment}&limit=20`)

export const fetchComplianceRun = (runId: number) =>
  apiRequest<ComplianceRunDetail>(`/api/v1/compliance/runs/${runId}`)

export const fetchComplianceCatalog = () =>
  apiRequest<ComplianceCatalog>('/api/v1/compliance/catalog')

export const fetchComplianceScopeCatalog = () =>
  apiRequest<ComplianceScopeCatalog>('/api/v1/compliance/scope-catalog')

export const fetchComplianceJobs = () =>
  apiRequest<{ items: ComplianceScanJob[] }>('/api/v1/compliance/jobs?limit=20')

export const createComplianceJob = (environment: 'prod' | 'dev', scope: ComplianceScanScope) =>
  apiRequest<{ jobId: number; status: 'QUEUED' }>('/api/v1/compliance/jobs', {
    method: 'POST',
    body: JSON.stringify({ environment, scope }),
  })

export const cancelComplianceJob = (jobId: number) =>
  apiRequest<{ jobId: number; status: 'CANCELLED' }>(`/api/v1/compliance/jobs/${jobId}/cancel`, {
    method: 'POST',
  })

export const importProwlerResults = (file: File, environment: 'prod' | 'dev') => {
  const body = new FormData()
  body.append('file', file)
  return apiRequest<{ runId: number }>(`/api/v1/compliance/imports?environment=${environment}`, {
    method: 'POST',
    body,
  })
}

export const complianceReportUrl = (runId: number, framework: ComplianceReportFramework) =>
  `/api/v1/compliance/runs/${runId}/report?framework=${framework}`
