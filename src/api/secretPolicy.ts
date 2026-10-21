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
  approvalMode?: ApprovalMode
  approvalRuleVersion?: string
  reviewerUserId?: number | null
  capabilities: { canPropose: boolean; canApprove: boolean; canReject: boolean; canDraftPolicy: boolean; canAssignReviewer?: boolean }
}
export interface ScopeClassification {
  taskGuidance?: import('@/lib/secretTaskGuidance').TaskGuidance
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
  setupReasonCodes?: string[]
  eligibleReviewers?: Reviewer[]
  changeResult?: ScopeChangeResult | null
  capabilities: { canPropose: boolean; canApprove: boolean; canReject: boolean; canDraftPolicy?: boolean; canAssignReviewer?: boolean }
}
export type ApprovalMode = 'DIRECT' | 'INDEPENDENT_REVIEW'
export interface Reviewer { userId: number; displayName: string }
export interface ScopeChangeResult { effect: 'APPLIED' | 'PENDING_REVIEW' | 'UNCHANGED'; proposalId: number; decisionId: number | null; approvalMode: ApprovalMode; remainingReasonCodes: string[] }
export interface ClassificationPreview { approvalMode: ApprovalMode; approvalRuleVersion: string; approvalReasonCodes: string[]; eligibleReviewers: Reviewer[]; canSubmit: boolean; remainingReasonCodes: string[] }
export interface PreviewClassification { origin: SecretOrigin; storagePolicyId: number | null; storagePolicyVersion: number | null; expectedScopeVersion: number }
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
  expectedApprovalMode?: ApprovalMode
  reviewerUserId?: number | null
  idempotencyKey?: string
}
export const previewScopeClassification = (scopeId: number, request: PreviewClassification) => apiRequest<ClassificationPreview>(`/api/v1/secrets/scopes/${scopeId}/classification-preview`, { method: 'POST', body: JSON.stringify(request) })
export const assignScopeReviewer = (scopeId: number, proposalId: number, request: { reviewerUserId: number | null; expectedProposalVersion: number; idempotencyKey: string }) => apiRequest<ScopeClassification>(`/api/v1/secrets/scopes/${scopeId}/classification-proposals/${proposalId}/assignment`, { method: 'PATCH', body: JSON.stringify(request) })
export const fetchScopeClassification = (scopeId: number) => apiRequest<ScopeClassification>(`/api/v1/secrets/scopes/${scopeId}/classification`)
export const fetchClassificationQueue = (page: number) => apiRequest<ClassificationPage>(`/api/v1/secrets/scopes?classificationStatus=NEEDS_REVIEW&page=${page}&size=20`)
export const fetchStoragePolicies = (status: string, page = 0) => apiRequest<PolicyPage>(`/api/v1/secrets/storage-policies?status=${status}&page=${page}&size=20`)
export const fetchStoragePolicy = (policyId: number, version: number) => apiRequest<PolicySummary>(`/api/v1/secrets/storage-policies/${policyId}/versions/${version}`)
export const createPolicyDraft = (request: PolicyDraft) => apiRequest<PolicySummary>('/api/v1/secrets/storage-policies/drafts', { method: 'POST', body: JSON.stringify(request) })
export const approveStoragePolicy = (policy: PolicySummary) => apiRequest<PolicySummary>(`/api/v1/secrets/storage-policies/${policy.policyId}/versions/${policy.version}/approve`, { method: 'POST', body: JSON.stringify({ expectedVersion: policy.version }) })
export const retireStoragePolicy = (policyId: number, request: { expectedVersion: number; reasonCode: string; evidenceRef: string }) => apiRequest<PolicySummary>(`/api/v1/secrets/storage-policies/${policyId}/retire`, { method: 'POST', body: JSON.stringify(request) })
export const proposeScopeClassification = (scopeId: number, request: ProposeClassification) => apiRequest<ScopeClassification>(`/api/v1/secrets/scopes/${scopeId}/classification-proposals`, { method: 'POST', body: JSON.stringify(request) })
export const approveScopeClassification = (scopeId: number, proposalId: number, request: { expectedScopeVersion: number; expectedProposalVersion: number; idempotencyKey?: string }) => apiRequest<ScopeClassification>(`/api/v1/secrets/scopes/${scopeId}/classification-proposals/${proposalId}/approve`, { method: 'POST', body: JSON.stringify(request) })
export const rejectScopeClassification = (scopeId: number, proposalId: number, request: { reasonCode: string; expectedProposalVersion: number; idempotencyKey?: string }) => apiRequest<ScopeClassification>(`/api/v1/secrets/scopes/${scopeId}/classification-proposals/${proposalId}/reject`, { method: 'POST', body: JSON.stringify(request) })
