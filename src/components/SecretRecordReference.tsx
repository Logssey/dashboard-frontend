import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/api/client'
import { scanDate } from '@/lib/secretScan'

interface RecordDetail { recordId: number; targetType: string; targetId: number; targetVersion: number; eventCode: string; actorDisplayName: string; createdAt: string }
const events: Record<string, string> = { CHECKLIST_CONFIRMED: '체크리스트 확인', EVIDENCE_ADDED: '조사 내용 기록', EVIDENCE_SUBMITTED: '판단 자료 제출', TRIAGE_DECISION: '노출 검토', POLICY_DRAFTED: '보관 정책 제안', POLICY_RETIRED: '보관 정책 폐기', CLASSIFICATION_PROPOSED: '보관 규칙 변경', LIFECYCLE_SUBMITTED: '폐기 또는 교체 확인 요청', TRANSFER_SUBMITTED: '이관 요청', TRANSFER_ACCEPTANCE_CONFIRMED: '인수 확인 승인' }
export function SecretRecordReference({ value }: { value?: string | null }) {
  const [open, setOpen] = useState(false)
  const id = /^CHANGE:RECORD-([1-9][0-9]{0,9})$/.exec(value ?? '')?.[1]
  const record = useQuery({ queryKey: ['secret-internal-record', id], queryFn: () => apiRequest<RecordDetail>(`/api/v1/secrets/internal-records/${id}`), enabled: !!id && open, retry: false, staleTime: 0 })
  if (!id) return <span>{value?.replace(/^CHANGE:ACTION-/, '조치 기록 #').replace(/^CHANGE:PERMISSION-/, '권한 조회 기록 #') ?? '기록 없음'}</span>
  return <span><button type="button" className="btn outline" aria-expanded={open} onClick={() => setOpen(!open)}>내부 기록 #{id}</button>{open && <span role="status">{record.isPending ? ' 기록 확인 중…' : record.isError ? ' 현재 권한으로 기록을 확인할 수 없어요.' : record.data ? ` ${events[record.data.eventCode] ?? '확인 기록'} · ${record.data.actorDisplayName} · ${scanDate(record.data.createdAt)}` : ''}</span>}</span>
}
