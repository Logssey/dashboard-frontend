import { apiRequest } from './client'
import type { SecretOrigin } from './secrets'

export interface StorageRule {
  ruleId?: number
  connectionId: number
  scopeId: number
  contentType: string
  effect: 'ALLOW' | 'DENY'
  pathMatch: 'SCOPE' | 'EXACT' | 'PREFIX'
}
export interface PolicySummary {
  policyId: number
  version: number
  status: 'ACTIVE' | 'DRAFT' | 'RETIRED'
  reasonCode: string
  evidenceRef: string
  createdByUserId: number
  approvedByUserId: number | null
  createdAt: string
  validFrom: string
  validUntil: string | null
  approvedAt: string | null
  retiredAt: string | null
  usableNow: boolean
  rules: StorageRule[]
  capabilities: { canApprove: boolean; canRetire: boolean; canCreateVersion: boolean }
}
export interface ClassificationProposal {
  proposalId: number
  scopeId: number
  expectedScopeVersion: number
  version: number
  origin: SecretOrigin
  storagePolicyId: number | null
  storagePolicyVersion: number | null
  status: string
  proposedByUserId: number
  createdAt: string
  reasonCode: string
  evidenceRef: string
  capabilities: { canPropose: boolean; canApprove: boolean; canReject: boolean; canDraftPolicy: boolean }
}
export interface ScopeClassification {
  scopeId: number
  connectionId: number
  contentType: string
  displayName: string
  scopeRevision: number
  scopeVersion: number
  origin: SecretOrigin
  originVersion: number
  storagePolicyId: number | null
  storagePolicyVersion: number | null
  approvalStatus: string
  policyStatus: string
  approvedAt: string | null
  approvedByUserId: number | null
  storagePolicy: PolicySummary | null
  pendingProposal: ClassificationProposal | null
  history: { decisionId: number; decision: string; fromOrigin: string; toOrigin: string; reasonCode: string; evidenceRef: string; actorUserId: number; decidedAt: string; version: number }[]
  capabilities: { canPropose: boolean; canApprove: boolean; canReject: boolean; canDraftPolicy?: boolean }
}
export interface PolicyPage { items: PolicySummary[]; total: number; page: number; size: number }
export interface ClassificationPage { items: ScopeClassification[]; total: number; page: number; size: number }
export interface PolicyDraft {
  policyId: number | null
  expectedVersion: number | null
  reasonCode: 'AUTHORIZED_STORAGE' | 'PROHIBITED_STORAGE' | 'POLICY_UPDATE'
  evidenceRef: string
  validFrom: string
  validUntil: string | null
  rules: (StorageRule & { branchCondition: null; protectedPathCondition: null })[]
}
export interface ProposeClassification {
  origin: SecretOrigin
  storagePolicyId: number | null
  storagePolicyVersion: number | null
  reasonCode: 'POLICY_PENDING' | 'SOURCE_CLASSIFICATION' | 'SOURCE_CORRECTION'
  evidenceRef: string
  expectedScopeVersion: number
}
export const fetchScopeClassification = (scopeId: number) => apiRequest<ScopeClassification>(`/api/v1/secrets/scopes/${scopeId}/classification`)
export const fetchClassificationQueue = (page: number) => apiRequest<ClassificationPage>(`/api/v1/secrets/scopes?classificationStatus=NEEDS_REVIEW&page=${page}&size=20`)
export const fetchStoragePolicies = (status: string, page = 0) => apiRequest<PolicyPage>(`/api/v1/secrets/storage-policies?status=${status}&page=${page}&size=20`)
export const fetchStoragePolicy = (policyId: number, version: number) => apiRequest<PolicySummary>(`/api/v1/secrets/storage-policies/${policyId}/versions/${version}`)
export const createPolicyDraft = (request: PolicyDraft) => apiRequest<PolicySummary>('/api/v1/secrets/storage-policies/drafts', { method: 'POST', body: JSON.stringify(request) })
export const approveStoragePolicy = (policy: PolicySummary) => apiRequest<PolicySummary>(`/api/v1/secrets/storage-policies/${policy.policyId}/versions/${policy.version}/approve`, { method: 'POST', body: JSON.stringify({ expectedVersion: policy.version }) })
export const retireStoragePolicy = (policyId: number, request: { expectedVersion: number; reasonCode: string; evidenceRef: string }) => apiRequest<PolicySummary>(`/api/v1/secrets/storage-policies/${policyId}/retire`, { method: 'POST', body: JSON.stringify(request) })
export const proposeScopeClassification = (scopeId: number, request: ProposeClassification) => apiRequest<ScopeClassification>(`/api/v1/secrets/scopes/${scopeId}/classification-proposals`, { method: 'POST', body: JSON.stringify(request) })
export const approveScopeClassification = (scopeId: number, proposalId: number, request: { expectedScopeVersion: number; expectedProposalVersion: number }) => apiRequest<ScopeClassification>(`/api/v1/secrets/scopes/${scopeId}/classification-proposals/${proposalId}/approve`, { method: 'POST', body: JSON.stringify(request) })
export const rejectScopeClassification = (scopeId: number, proposalId: number, request: { reasonCode: string; expectedProposalVersion: number }) => apiRequest<ScopeClassification>(`/api/v1/secrets/scopes/${scopeId}/classification-proposals/${proposalId}/reject`, { method: 'POST', body: JSON.stringify(request) })
