import { Fragment, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/api/client'
import {
  askHelp,
  draftReport,
  fetchCveImpact,
  fetchHelpStatus,
  fetchIncidentStatus,
  type HelpCard,
  type HelpMode,
  type HelpSignals,
} from '@/api/help'
import {
  buildHistory,
  maskPrivate,
  REPORT_MEMO_MAX,
  reportText,
  signalsForAI,
  CHECKLIST_DEFAULT_QUESTION,
  HELP_SCREEN_ROUTES,
  helpScreenRoute,
  impactLines,
  incidentCves,
  incidentPriorities,
  incidentRows,
  incidentTypeLabel,
  incidentTypes,
  firstSeenBaseline,
  incidentSignals,
  loadSeenSignals,
  saveSeenSignals,
  signalCheckTime,
  signalQuestion,
  signalSnapshot,
  type SignalSnapshot,
  looksLikeIncident,
  usableCve,
  usableCards,
  HELP_QUESTION_MAX,
  helpErrorMessages,
  loadHelpMessages,
  looksLikeSecret,
  saveHelpMessages,
  sourcesToggleLabel,
  suggestedQuestions,
  type HelpMessage,
} from '@/lib/helpChat'
import { Icon } from './Icon'
import './help-chat.css'

/** 새 보안 신호를 확인하는 주기. 탭이 보일 때만 읽는다 */
const SIGNAL_POLL_MS = 15 * 60_000

/**
 * 질문 속 CVE의 우리 환경 영향 (설계 문서 14장). 기존 취약점 API를 내 권한으로 직접 부른다.
 * 숫자는 화면에만 그리고 대화 기록·Claude로 보내지 않는다.
 */
/**
 * 사고 이야기에 붙이는 "지금 우리 환경 현황"과 숫자로 정한 "먼저 볼 것" (설계 문서 15장).
 * 기존 취약점·런타임 API를 내 권한으로 읽기만 하고, 숫자와 순서는 AI에 보내지 않는다.
 */
function IncidentStatusBox({ types, onOpen }: { types: string[]; onOpen: (screen: string) => void }) {
  const status = useQuery({ queryKey: ['help', 'incident-status'], queryFn: fetchIncidentStatus, staleTime: 60_000, retry: false })
  const denied = status.error instanceof ApiError && status.error.status === 403
  const data = status.data
  const priorities = data ? incidentPriorities(data, types) : null
  const labels = types.map(incidentTypeLabel).filter((label): label is string => !!label)
  return (
    <section className="help-message assistant help-impact" aria-label="지금 우리 환경 현황">
      <strong className="help-card-title">지금 우리 환경 현황</strong>
      <p className="caption">
        내 권한으로 런타임·시크릿·IaC·취약점 데이터를 직접 센 숫자와, 그 숫자로 정한 순서예요. AI가 만든 값이 아니고, AI에 보내지
        않아요.
      </p>
      {labels.length > 0 && <p className="caption">사고 유형: {labels.join(', ')} (질문 낱말 기준)</p>}
      {status.isPending && <p>환경 데이터를 조회하는 중…</p>}
      {denied && <p>환경 데이터를 볼 권한이 없어요.</p>}
      {status.isError && !denied && <p>환경 데이터를 조회하지 못했어요. 각 화면에서 직접 확인해 주세요.</p>}
      {priorities && (
        <>
          <strong className="help-card-title">먼저 볼 것</strong>
          <ol className="help-priorities">
            {priorities.map((item) => {
              const route = helpScreenRoute(item.screen)
              return (
                <li key={item.text}>
                  <span>{item.text}</span>
                  {route && (
                    <button type="button" className="btn outline small" onClick={() => onOpen(item.screen)}>
                      {route.title} 열기
                    </button>
                  )}
                </li>
              )
            })}
          </ol>
        </>
      )}
      {data &&
        incidentRows(data).map((group) => (
          <div key={group.title} className="help-incident-group">
            <strong className="help-incident-group-title">{group.title}</strong>
            {group.note ? (
              <p className="caption">{group.note}</p>
            ) : (
              <dl className="help-impact-rows">
                {group.rows.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ))}
    </section>
  )
}

function CveImpactBox({ cve, onOpenFindings }: { cve: string; onOpenFindings: () => void }) {
  const impact = useQuery({ queryKey: ['help', 'cve-impact', cve], queryFn: () => fetchCveImpact(cve), staleTime: 60_000, retry: false })
  const denied = impact.error instanceof ApiError && impact.error.status === 403
  const lines = impact.data ? impactLines(impact.data) : null
  return (
    <section className="help-message assistant help-impact" aria-label={`${cve} 우리 환경 조회 결과`}>
      <strong className="help-card-title">우리 환경 조회 결과 · {cve}</strong>
      <p className="caption">내 권한으로 취약점 데이터를 직접 센 숫자예요. AI가 만든 값이 아니고, AI에 보내지 않아요.</p>
      {impact.isPending && <p>취약점 데이터를 조회하는 중…</p>}
      {denied && <p>취약점 데이터를 볼 권한이 없어요.</p>}
      {impact.isError && !denied && <p>취약점 데이터를 조회하지 못했어요. Finding 목록에서 직접 검색해 보세요.</p>}
      {lines && (
        <>
          <dl className="help-impact-rows">
            {lines.rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {lines.notes.map((note) => (
            <p key={note} className="help-impact-note">
              {note}
            </p>
          ))}
        </>
      )}
      {!denied && (
        <div className="row help-card-foot">
          <button type="button" className="btn outline small" onClick={onOpenFindings}>
            {HELP_SCREEN_ROUTES.VULN_FINDINGS?.title} 열기
          </button>
        </div>
      )}
    </section>
  )
}

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

  // 새 보안 신호 (설계 문서 16장): 탭이 보이는 동안 15분마다(또는 "지금 확인"을 누르면 바로) 기존 API를 읽어 기준과 비교한다. AI는 쓰지 않는다.
  const signalStatus = useQuery({
    queryKey: ['help', 'incident-status'],
    queryFn: fetchIncidentStatus,
    refetchInterval: SIGNAL_POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
    retry: false,
  })
  const [seenSignals, setSeenSignals] = useState<SignalSnapshot | null>(() => loadSeenSignals())
  const currentSignals = signalStatus.data ? signalSnapshot(signalStatus.data) : null
  useEffect(() => {
    if (currentSignals && seenSignals === null) {
      const baseline = firstSeenBaseline(currentSignals)
      setSeenSignals(baseline)
      saveSeenSignals(baseline)
    }
  }, [currentSignals, seenSignals])
  const signals = currentSignals && seenSignals ? incidentSignals(seenSignals, currentSignals) : []
  const acknowledgeSignals = () => {
    if (!currentSignals) return
    setSeenSignals(currentSignals)
    saveSeenSignals(currentSignals)
  }
  // "지금 확인": 주기를 기다리지 않고 바로 다시 읽는다. 누르는 동안에는 다시 누를 수 없다.
  const checkSignalsNow = () => {
    if (!signalStatus.isFetching) void signalStatus.refetch()
  }
  const signalCheckedAt = signalStatus.dataUpdatedAt ? signalCheckTime(signalStatus.dataUpdatedAt) : null

  // 사고 보고서 초안 (설계 문서 18.4): 메모는 이 화면에만 두고 저장소에 남기지 않는다.
  const [reportOpen, setReportOpen] = useState(false)
  const [memo, setMemo] = useState('')
  const [reportOut, setReportOut] = useState<string | null>(null)
  const [reportError, setReportError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const report = useMutation({
    mutationFn: (notes: string) => draftReport(notes),
    onSuccess: (draft) => {
      setReportError(null)
      setReportOut(reportText(draft, signalStatus.data, signalStatus.dataUpdatedAt || null, Date.now()))
    },
    onError: (error) => {
      const code = error instanceof ApiError ? error.code : null
      setReportError(
        (code && helpErrorMessages[code]) ||
          (error instanceof ApiError && error.status === 429 ? error.message : '초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.'),
      )
    },
  })
  const makeReport = () => {
    const typed = memo.trim()
    if (!typed || report.isPending) return
    if (typed.length > REPORT_MEMO_MAX) return setReportError(helpErrorMessages.MEMO_INVALID)
    const notes = maskPrivate(typed)
    if (looksLikeSecret(notes)) return setReportError(helpErrorMessages.QUESTION_REJECTED)
    setReportOut(null)
    setCopied(false)
    report.mutate(notes)
  }
  const copyReport = async () => {
    if (!reportOut) return
    try {
      await navigator.clipboard.writeText(reportOut)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

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
    mutationFn: ({
      question,
      history,
      mode,
      signals,
    }: {
      question: string
      history: ReturnType<typeof buildHistory>
      mode?: HelpMode
      signals?: HelpSignals
    }) => askHelp(question, page, history, mode, signals),
    onSuccess: (response) =>
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: response.answer,
          grounded: response.grounded,
          sources: response.sources,
          cards: usableCards(response.cards),
        },
      ]),
    onError: (error) => {
      const code = error instanceof ApiError ? error.code : null
      const text =
        (code && helpErrorMessages[code]) ||
        (error instanceof ApiError && error.status === 429 ? error.message : '답변을 받지 못했어요. 잠시 후 다시 시도해 주세요.')
      setMessages((current) => [...current, { role: 'assistant', text, error: true }])
    },
  })

  const send = (text: string, mode?: HelpMode) => {
    const typed = text.trim()
    if (!typed || ask.isPending) return
    // 고객 정보(이메일·IP·전화번호 등)는 보내기 전에 가린다. 화면과 대화 기록에도 가린 글만 남는다 (설계 문서 18.1).
    const question = maskPrivate(typed)
    const masked = question !== typed
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
    const impact = incidentCves(question)
    const userMessage: HelpMessage = {
      role: 'user',
      text: question,
      ...(masked ? { masked: true } : {}),
      ...(impact.cves.length ? { impactCves: impact.cves } : {}),
      ...(impact.name ? { incidentName: impact.name } : {}),
      ...(looksLikeIncident(question) || mode === 'checklist' ? { incidentStatus: true } : {}),
    }
    const types = incidentTypes(question)
    if (userMessage.incidentStatus && types.length) userMessage.incidentTypes = types
    setMessages((current) => [...current, userMessage])
    setDraft('')
    // 사고 질문이면 환경 신호를 예/아니오로만 함께 보낸다 (설계 문서 18.3). 숫자·이름은 보내지 않는다.
    const incident = userMessage.incidentStatus === true || impact.cves.length > 0
    ask.mutate({ question, history, mode, signals: incident ? signalsForAI(signalStatus.data) : undefined })
  }

  // "화면 열기": 카드의 화면 키를 고정 표에서 찾은 내부 경로로만 이동한다. 서랍은 열어 둔다.
  const navigate = useNavigate()
  const openScreen = (card: HelpCard) => {
    const route = helpScreenRoute(card.screen)
    if (route) navigate(route.path)
  }
  const openFindings = () => openKey('VULN_FINDINGS')
  const openKey = (screen: string) => {
    const route = helpScreenRoute(screen)
    if (route) navigate(route.path)
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
        className={`icon-btn help-trigger${signals.length ? ' has-signal' : ''}`}
        onClick={() => setOpen(true)}
        aria-label={signals.length ? `도움말 열기 (새 보안 신호 ${signals.length}개)` : '도움말 열기'}
        aria-haspopup="dialog"
        title={signals.length ? `새 보안 신호 ${signals.length}개` : '사용법 도우미'}
      >
        ?{signals.length > 0 && <span className="help-signal-dot" aria-hidden="true" />}
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
              답은 사용 가이드 문서로만 해요. 사고 이야기나 CVE 번호·사고 이름이 있으면 내 권한으로 현황 숫자만 직접 조회해 보여
              주고, 그 숫자는 AI에 보내지 않아요. 질문에 키나 비밀번호를 넣지 마세요.
            </p>
            <div className="row between help-signal-bar">
              <span className="caption" role="status">
                {signalStatus.isFetching
                  ? '보안 신호를 확인하는 중…'
                  : signalStatus.isError
                    ? '보안 신호를 확인하지 못했어요.'
                    : signals.length > 0
                      ? `새 보안 신호 ${signals.length}개 · ${signalCheckedAt} 확인`
                      : signalCheckedAt
                        ? `새 보안 신호 없음 · ${signalCheckedAt} 확인 (15분마다 자동)`
                        : '보안 신호를 15분마다 확인해요.'}
              </span>
              <button type="button" className="btn outline small" disabled={signalStatus.isFetching} onClick={checkSignalsNow}>
                지금 확인
              </button>
            </div>

            <div className="help-messages" ref={listRef} aria-live="polite">
              {reportOpen && (
                <section className="help-report" aria-label="사고 보고서 초안">
                  <strong className="help-card-title">사고 보고서 초안</strong>
                  <p className="caption">
                    확인하고 조치한 내용을 메모로 적으면 AI가 보고서 문장으로 다듬어요. 시각과 숫자는 Logssey가 채우고, 메모에 없는
                    숫자는 막아요. 고객 정보는 가려서 보내고 메모는 저장하지 않아요.
                  </p>
                  <label className="sr-only" htmlFor="help-report-memo">
                    조치 메모
                  </label>
                  <textarea
                    id="help-report-memo"
                    value={memo}
                    maxLength={REPORT_MEMO_MAX}
                    rows={4}
                    placeholder="예: 14시 웹 서버 2대 격리. 런타임 탐지 확인했고 이상 없음. 서버 키 교체는 내일."
                    onChange={(event) => setMemo(event.target.value)}
                  />
                  {reportError && (
                    <p className="notice error" role="alert">
                      {reportError}
                    </p>
                  )}
                  <div className="row between">
                    <span className="caption">
                      {memo.length}/{REPORT_MEMO_MAX}
                    </span>
                    <button type="button" className="btn primary small" disabled={!ready || report.isPending || !memo.trim()} onClick={makeReport}>
                      {report.isPending ? '초안 만드는 중…' : '초안 만들기'}
                    </button>
                  </div>
                  {reportOut && (
                    <>
                      <pre className="help-report-out">{reportOut}</pre>
                      <div className="row help-form-actions">
                        <button type="button" className="btn outline small" onClick={copyReport}>
                          {copied ? '복사했어요' : '복사'}
                        </button>
                      </div>
                    </>
                  )}
                </section>
              )}
              {signals.length > 0 && (
                <section className="help-signals" aria-label="새 보안 신호">
                  <strong className="help-card-title">새 보안 신호</strong>
                  <p className="caption">마지막으로 확인한 뒤 새로 생긴 것이에요. 15분마다(또는 "지금 확인"으로) 내 권한으로 확인하고, AI가 만든 값이 아니에요.</p>
                  <ul>
                    {signals.map((signal) => {
                      const route = helpScreenRoute(signal.screen)
                      return (
                        <li key={signal.kind}>
                          <span>{signal.text}</span>
                          {route && (
                            <button type="button" className="btn outline small" onClick={() => openKey(signal.screen)}>
                              {route.title} 열기
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                  <div className="row help-form-actions">
                    <button
                      type="button"
                      className="btn primary small"
                      disabled={!ready || ask.isPending}
                      onClick={() => send(signalQuestion(signals))}
                    >
                      대응 순서 물어보기
                    </button>
                    <button type="button" className="btn outline small" onClick={acknowledgeSignals}>
                      확인했어요
                    </button>
                  </div>
                </section>
              )}
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
              {messages.map((message, index) => {
                const impactCves =
                  message.role === 'user'
                    ? (message.impactCves ?? []).map(usableCve).filter((cve): cve is string => cve !== undefined)
                    : []
                return (
                <Fragment key={index}>
                <div
                  className={`help-message ${message.role} ${message.error ? 'error' : ''} ${message.grounded === false ? 'ungrounded' : ''}`.trim()}
                >
                  {message.cards && usableCards(message.cards) ? (
                    <ol className="help-cards" aria-label="사고 대응 체크리스트">
                      {message.cards.map((card, cardIndex) => {
                        const route = helpScreenRoute(card.screen)
                        return (
                          <li key={cardIndex} className="help-card">
                            <strong className="help-card-title">{card.titles.join(' · ')}</strong>
                            <p>{card.focus}</p>
                            <div className="row between help-card-foot">
                              <span className="caption">{route ? route.title : 'Logssey 밖에서 확인'}</span>
                              {route && (
                                <button type="button" className="btn outline small" onClick={() => openScreen(card)}>
                                  {route.title} 열기
                                </button>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ol>
                  ) : (
                    <p>{message.text}</p>
                  )}
                  {message.role === 'user' && message.masked === true && (
                    <p className="help-masked-note">이메일·IP·전화번호처럼 보이는 값은 가려서 보냈어요.</p>
                  )}
                  {message.sources && message.sources.length > 0 && (
                    <details className="help-sources">
                      <summary>{sourcesToggleLabel(message.sources.length)}</summary>
                      <ul aria-label="근거 문서">
                        {message.sources.map((source) => (
                          <li key={`${source.doc}#${source.section}`}>
                            근거: {source.title}
                            {source.section && source.section !== source.title ? ` › ${source.section}` : ''}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
                {message.role === 'user' && message.incidentStatus === true && (
                  <IncidentStatusBox types={message.incidentTypes ?? []} onOpen={openKey} />
                )}
                {message.role === 'user' && message.incidentName && impactCves.length > 0 && (
                  <p className="caption help-incident-name">
                    {message.incidentName} → {impactCves.join(', ')} 로 찾아봤어요 (정해진 표 기준)
                  </p>
                )}
                {impactCves.map((cve) => (
                  <CveImpactBox key={cve} cve={cve} onOpenFindings={openFindings} />
                ))}
                </Fragment>
                )
              })}
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
                <div className="row help-form-actions">
                  <button
                    type="button"
                    className="btn outline small"
                    disabled={!ready || ask.isPending}
                    title="입력한 질문(비어 있으면 기본 질문)을 사고 대응 체크리스트 카드로 받아요"
                    onClick={() => send(draft.trim() || CHECKLIST_DEFAULT_QUESTION, 'checklist')}
                  >
                    사고 대응 체크리스트
                  </button>
                  <button
                    type="button"
                    className="btn outline small"
                    aria-expanded={reportOpen}
                    title="조치 메모로 사고 보고서 초안을 만들어요"
                    onClick={() => setReportOpen((value) => !value)}
                  >
                    보고서 초안
                  </button>
                  <button type="submit" className="btn primary small" disabled={!ready || ask.isPending || !draft.trim()}>
                    보내기
                  </button>
                </div>
              </div>
            </form>
          </>
        )}
      </dialog>
    </>
  )
}
