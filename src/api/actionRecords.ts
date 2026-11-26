import { apiRequest } from './client'

export type ActionKind = 'IMAGE' | 'IAC_PATH' | 'IAC_FINDING'
export type ActionStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'AWAITING_CHECK' | 'RECORDED'
export interface ActionRecord { assigneeUserId: number | null; status: ActionStatus; note: string; version: number }
export interface ActionDetail {
  record: ActionRecord
  source: { title: string; status: string; version: number; assigneeUserId: number | null; lastSeenAt: string }
  assignees: { userId: number; displayName: string }[]
  history: { version: number; assigneeUserId: number | null; status: ActionStatus; note: string; actorName: string; recordedAt: string }[]
  verification: ActionVerification
  checks: { scanId: number; status: string; finishedAt: string | null; target: string }[]
}
export interface ActionVerification { status: 'PENDING' | 'UNCONFIRMED' | 'FOUND' | 'NOT_FOUND'; message: string; checkId: number | null; checkedAt: string | null; href: string | null; target: string | null; scope: string | null }
export interface ActionItem { kind: ActionKind; id: number; title: string; assigneeUserId: number | null; assigneeName: string | null; status: ActionStatus; updatedAt: string; verification: ActionVerification }
export const fetchActionRecords = (area: string, assignee: string, page: number) => apiRequest<{ items: ActionItem[]; total: number; page: number; size: number }>(`/api/v1/action-records?${new URLSearchParams({area,assignee,page:String(page)})}`)
export const linkActionCheck = (kind: ActionKind, id: number, version: number, scanId: number) => apiRequest<ActionDetail>(`/api/v1/action-records/${kind}/${id}/verification`, { method: 'POST', body: JSON.stringify({version,scanId}) })
export const fetchActionRecord = (kind: ActionKind, id: number) => apiRequest<ActionDetail>(`/api/v1/action-records/${kind}/${id}`)
export const saveActionRecord = (kind: ActionKind, id: number, body: ActionRecord & { sourceVersion: number; confirmed: boolean }) =>
  apiRequest<ActionDetail>(`/api/v1/action-records/${kind}/${id}`, { method: 'PUT', body: JSON.stringify(body) })
