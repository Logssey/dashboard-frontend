import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { saveReachReview, type ReachFindingDetail, type ReachReviewInput, type ReachReviewState } from '@/api/reach'
import { REVIEW_NOTE_MAX, noteLength, reviewInput } from '@/lib/reach'
import { reachStatusLabel } from '@/lib/reachLabels'

type HumanStatus = NonNullable<ReachReviewInput['status']>
type HumanReviewState = Exclude<ReachReviewState, 'UNREVIEWED'>

const HUMAN_STATUSES: HumanStatus[] = ['REACHABLE', 'UNKNOWN', 'UNREACHABLE']

interface Feedback {
  kind: 'success' | 'error'
  message: string
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return '다른 사람이 먼저 저장했어요. 최신 내용을 불러왔으니 확인한 뒤 다시 저장해 주세요.'
  }
  if (error instanceof ApiError && error.status === 400) {
    return '입력한 내용을 확인해 주세요. 확정·잠정에는 판정과 메모(2,000자 이하)가 필요해요.'
  }
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return '저장 권한이 없거나 로그인이 끝났어요. 다시 로그인해 주세요.'
  }
  return '검토를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
}

/** SCR-03 사람 검토 입력 (API-06). 도구 판정은 바꾸지 않고, 도구가 판정하지 않은 항목만 사람 판정이 현재 판정이 된다 */
export function ReachReviewForm({ findingId, detail }: { findingId: number; detail: ReachFindingDetail }) {
  const { review, verdict } = detail
  const queryClient = useQueryClient()
  const [reviewState, setReviewState] = useState<HumanReviewState>(
    review.reviewState === 'PROVISIONAL' ? 'PROVISIONAL' : 'CONFIRMED',
  )
  const [status, setStatus] = useState<HumanStatus | ''>(review.status ?? '')
  const [note, setNote] = useState(review.note ?? '')
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const save = useMutation({
    mutationFn: (input: ReachReviewInput) => saveReachReview(findingId, input),
    onSuccess: (_, input) => {
      setFeedback({ kind: 'success', message: input.reviewState === 'UNREVIEWED' ? '검토 전으로 되돌렸어요.' : '검토를 저장했어요.' })
      if (input.reviewState === 'UNREVIEWED') {
        setStatus('')
        setNote('')
      }
    },
    onError: (error) => setFeedback({ kind: 'error', message: errorMessage(error) }),
    // 성공해도 실패해도(409면 최신 version을 받아야 함) 상세·목록·요약을 다시 읽는다
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['reach-finding', findingId] })
      void queryClient.invalidateQueries({ queryKey: ['reach-findings'] })
      void queryClient.invalidateQueries({ queryKey: ['reach-summary'] })
    },
  })

  // version은 저장 버튼을 누를 때의 최신 값을 쓴다. 저장 뒤 상세를 다시 읽으면 올라간 값이 들어온다
  const input = reviewInput(reviewState, status, note, review.version)
  const length = noteLength(note.trim())
  const becomesVerdict = verdict.status === 'NOT_ANALYZED' || verdict.method === 'MANUAL'

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (input) save.mutate(input)
  }

  const fillFromProposal = () => {
    if (!review.proposal) return
    setStatus(review.proposal.status)
    setNote(review.proposal.reference ? `${review.proposal.summary} (${review.proposal.reference})` : review.proposal.summary)
  }

  return (
    <form className="reach-review-form" onSubmit={submit} aria-label="사람 검토 기록">
      <div className="reach-review-row">
        <label className="field" htmlFor="reach-review-state">
          검토 상태
          <select
            className="select"
            id="reach-review-state"
            value={reviewState}
            onChange={(event) => setReviewState(event.target.value as HumanReviewState)}
          >
            <option value="CONFIRMED">확정</option>
            <option value="PROVISIONAL">잠정</option>
          </select>
        </label>
        <label className="field" htmlFor="reach-review-status">
          사람이 본 판정
          <select
            className="select"
            id="reach-review-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as HumanStatus | '')}
          >
            <option value="">판정 선택</option>
            {HUMAN_STATUSES.map((value) => (
              <option key={value} value={value}>
                {reachStatusLabel[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field" htmlFor="reach-review-note">
        근거 메모
        <textarea
          className="input reach-review-note"
          id="reach-review-note"
          rows={4}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          aria-describedby="reach-review-note-help"
        />
        <span id="reach-review-note-help" className={`caption ${length > REVIEW_NOTE_MAX ? 'field-error' : ''}`.trim()}>
          {length}/{REVIEW_NOTE_MAX}자 · 도구 판정과 다르게 봤으면 그 이유를 써 주세요.
        </span>
      </label>
      {becomesVerdict && (
        <p className="caption">도구가 판정하지 않은 항목이라, 저장한 판정이 현재 판정(방식: 수동)이 돼요.</p>
      )}
      <div className="reach-review-actions">
        <button className="btn primary" type="submit" disabled={!input || save.isPending}>
          {save.isPending ? '저장 중…' : '검토 저장'}
        </button>
        {review.proposal && (
          <button type="button" className="btn outline" onClick={fillFromProposal} disabled={save.isPending}>
            제안으로 채우기
          </button>
        )}
        {review.reviewState !== 'UNREVIEWED' && (
          <button
            type="button"
            className="btn outline"
            disabled={save.isPending}
            onClick={() => save.mutate({ reviewState: 'UNREVIEWED', version: review.version })}
          >
            검토 전으로 되돌리기
          </button>
        )}
      </div>
      {feedback && (
        <p className={`notice ${feedback.kind === 'error' ? 'error' : ''}`.trim()} role={feedback.kind === 'error' ? 'alert' : 'status'}>
          {feedback.message}
        </p>
      )}
    </form>
  )
}
