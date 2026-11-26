import type { ActionStatus } from '@/api/actionRecords'

export const actionStatusLabels: Record<ActionStatus, string> = {
  NOT_STARTED: '시작 전', IN_PROGRESS: '조치 중', AWAITING_CHECK: '확인 대기', RECORDED: '조치 기록 완료',
}
export const verificationLabels = { PENDING: '검사 확인 대기', UNCONFIRMED: '확인 불가', FOUND: '다시 발견', NOT_FOUND: '검사에서 미발견' }
export function actionRecordError(status: ActionStatus, assignee: number | null, note: string, confirmed: boolean): string | null {
  if (status !== 'NOT_STARTED' && assignee === null) return '조치를 진행할 담당자를 선택하세요.'
  if (note.length > 2000) return '조치 내용은 2,000자까지 입력할 수 있어요.'
  if ((status === 'AWAITING_CHECK' || status === 'RECORDED') && !note.trim()) return '수행한 조치와 확인할 내용을 적어 주세요.'
  if (status === 'RECORDED' && !confirmed) return '기록한 조치를 실제로 수행했는지 확인해 주세요.'
  return null
}
