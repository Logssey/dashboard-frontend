import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { askHelp, fetchHelpStatus } from '@/api/help'
import {
  buildHistory,
  HELP_QUESTION_MAX,
  helpErrorMessages,
  loadHelpMessages,
  looksLikeSecret,
  saveHelpMessages,
  suggestedQuestions,
  type HelpMessage,
} from '@/lib/helpChat'
import { Icon } from './Icon'
import './help-chat.css'

/**
 * 상단 바 "?" 도움말 버튼과 사용법 도우미 서랍 (docs/design/usage-chatbot-design.md 3장)
 * - 사용 가이드 문서만 근거로 답한다. 실제 키·탐지 결과는 볼 수 없다.
 * - 답변은 일반 텍스트로만 그린다(HTML·링크로 해석하지 않음).
 */
export function HelpChat({ page }: { page: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<HelpMessage[]>(() => loadHelpMessages())
  const [draft, setDraft] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)

  const status = useQuery({ queryKey: ['help', 'status'], queryFn: fetchHelpStatus, enabled: open, staleTime: 60_000 })
  const ready = status.data?.ready === true

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    saveHelpMessages(messages)
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages])

  const ask = useMutation({
    mutationFn: ({ question, history }: { question: string; history: ReturnType<typeof buildHistory> }) =>
      askHelp(question, page, history),
    onSuccess: (response) =>
      setMessages((current) => [
        ...current,
        { role: 'assistant', text: response.answer, grounded: response.grounded, sources: response.sources },
      ]),
    onError: (error) => {
      const code = error instanceof ApiError ? error.code : null
      const text =
        (code && helpErrorMessages[code]) ||
        (error instanceof ApiError && error.status === 429 ? error.message : '답변을 받지 못했어요. 잠시 후 다시 시도해 주세요.')
      setMessages((current) => [...current, { role: 'assistant', text, error: true }])
    },
  })

  const send = (text: string) => {
    const question = text.trim()
    if (!question || ask.isPending) return
    if (question.length > HELP_QUESTION_MAX) {
      setInputError(helpErrorMessages.INVALID_INPUT)
      return
    }
    if (looksLikeSecret(question)) {
      // 브라우저에서 먼저 막는다. 이 질문은 서버로도, 대화 기록으로도 나가지 않는다.
      setInputError(helpErrorMessages.QUESTION_REJECTED)
      return
    }
    setInputError(null)
    const history = buildHistory(messages)
    setMessages((current) => [...current, { role: 'user', text: question }])
    setDraft('')
    ask.mutate({ question, history })
  }

  const handleBackdropClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      setOpen(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="icon-btn help-trigger"
        onClick={() => setOpen(true)}
        aria-label="도움말 열기"
        aria-haspopup="dialog"
        title="사용법 도우미"
      >
        ?
      </button>
      <dialog
        ref={dialogRef}
        className="drawer help-drawer"
        aria-labelledby="help-title"
        onClose={() => setOpen(false)}
        onClick={handleBackdropClick}
      >
        {open && (
          <>
            <div className="drawer-head">
              <h2 id="help-title">사용법 도우미</h2>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="도움말 닫기">
                <Icon name="close" />
              </button>
            </div>
            <p className="help-notice">
              사용 가이드 문서로만 답해요. 실제 키·탐지 결과는 볼 수 없어요. 질문에 키나 비밀번호를 넣지 마세요.
            </p>

            <div className="help-messages" ref={listRef} aria-live="polite">
              {messages.length === 0 && (
                <div className="help-suggestions">
                  <p className="caption">이 화면에서 자주 묻는 질문</p>
                  {suggestedQuestions(page).map((question) => (
                    <button
                      key={question}
                      type="button"
                      className="btn outline small"
                      disabled={!ready || ask.isPending}
                      onClick={() => send(question)}
                    >
                      {question}
                    </button>
                  ))}
                </div>
              )}
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`help-message ${message.role} ${message.error ? 'error' : ''} ${message.grounded === false ? 'ungrounded' : ''}`.trim()}
                >
                  <p>{message.text}</p>
                  {message.sources && message.sources.length > 0 && (
                    <ul className="help-sources" aria-label="근거 문서">
                      {message.sources.map((source) => (
                        <li key={`${source.doc}#${source.section}`}>
                          근거: {source.title}
                          {source.section && source.section !== source.title ? ` › ${source.section}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {ask.isPending && <div className="help-message assistant pending">답변을 찾는 중…</div>}
            </div>

            <form
              className="help-form"
              onSubmit={(event) => {
                event.preventDefault()
                send(draft)
              }}
            >
              {status.isSuccess && !ready && <p className="notice">도움말 챗봇이 아직 준비되지 않았어요.</p>}
              {status.isError && <p className="notice error">도움말 상태를 확인하지 못했어요.</p>}
              {inputError && (
                <p className="notice error" role="alert">
                  {inputError}
                </p>
              )}
              <label className="sr-only" htmlFor="help-question">
                질문
              </label>
              <textarea
                id="help-question"
                value={draft}
                maxLength={HELP_QUESTION_MAX}
                rows={2}
                placeholder="예: 대응 건은 어떻게 만들어요?"
                disabled={!ready}
                onChange={(event) => {
                  setDraft(event.target.value)
                  if (inputError) setInputError(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    send(draft)
                  }
                }}
              />
              <div className="row between">
                <span className="caption">
                  {draft.length}/{HELP_QUESTION_MAX}
                </span>
                <button type="submit" className="btn primary small" disabled={!ready || ask.isPending || !draft.trim()}>
                  보내기
                </button>
              </div>
            </form>
          </>
        )}
      </dialog>
    </>
  )
}
