import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { createReachScan, fetchReachApps, type ReachScan } from '@/api/reach'
import { type NewScanForm, newScanRequest, scanRequestErrorText } from '@/lib/reach'

// SCR-05-09 새 스캔 대화상자. [스캔 요청] → API-01. 대화상자를 열 때마다 멱등 키를 새로 만들어,
// 같은 대화상자에서 두 번 눌러도(응답이 늦어 다시 누름) 스캔은 하나만 생긴다 (API 명세 2-7)

function newKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `reach-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function ReachNewScanDialog({ initial, onClose, onCreated }: {
  /** null이면 닫힌 상태 */
  initial: NewScanForm | null
  onClose: () => void
  onCreated: (scan: ReachScan) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [form, setForm] = useState<NewScanForm | null>(initial)
  const [key, setKey] = useState(newKey)
  const [touched, setTouched] = useState(false)

  const create = useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: NonNullable<ReturnType<typeof newScanRequest>['input']>; idempotencyKey: string }) =>
      createReachScan(input, idempotencyKey),
    onSuccess: (scan) => onCreated(scan),
  })

  useEffect(() => {
    const dialog = dialogRef.current
    if (initial) {
      setForm(initial)
      setKey(newKey())
      setTouched(false)
      create.reset()
      if (dialog && !dialog.open) dialog.showModal()
    } else if (dialog?.open) {
      dialog.close()
    }
    // create는 매 렌더 새 객체라 넣지 않는다. 열 때만 초기화한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])

  const set = <K extends keyof NewScanForm>(name: K, value: NewScanForm[K]) => {
    setForm((previous) => (previous ? { ...previous, [name]: value } : previous))
    // 내용을 바꾸면 다른 요청이다. 같은 키로 다른 본문을 보내면 409라 키를 새로 만든다
    setKey(newKey())
  }

  // 앱 선택지와 입력 예시는 설치 설정(API-14)에서 온다. 못 받으면 "자동으로 정하기"만 남는다
  const apps = useQuery({ queryKey: ['reach', 'apps'], queryFn: fetchReachApps, enabled: Boolean(form), staleTime: 300_000 })
  const appItems = apps.data?.data ?? []
  const appCodes = appItems.map((app) => app.code)
  if (form?.app && !appCodes.includes(form.app)) appCodes.push(form.app)   // 주소로 받은 값은 목록에 없어도 보인다
  const example = {
    image: appItems.find((app) => app.image)?.image ?? 'org/app',
    repo: appItems.find((app) => app.repo)?.repo ?? 'app-repo',
    path: appItems.find((app) => app.path)?.path ?? 'sub-dir',
  }

  const result = form ? newScanRequest(form) : { errors: {} }
  const errors = touched ? result.errors : {}
  const requestError =
    create.error instanceof ApiError
      ? scanRequestErrorText(create.error.status, create.error.code, create.error.message)
      : create.error
        ? '스캔을 요청하지 못했어요. 연결을 확인하고 다시 시도하세요.'
        : null

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (!result.input || create.isPending) return
    create.mutate({ input: result.input, idempotencyKey: key })
  }

  return (
    <dialog ref={dialogRef} className="reach-dialog" aria-labelledby="reach-new-scan-title" onClose={onClose}>
      {form && (
        <form className="reach-dialog-body" onSubmit={submit} noValidate>
          <div className="reach-dialog-head">
            <h2 id="reach-new-scan-title">새 스캔</h2>
            <button type="button" className="btn outline small" onClick={onClose} aria-label="닫기">
              닫기
            </button>
          </div>

          <fieldset className="reach-fieldset">
            <legend>대상 유형</legend>
            <label className="reach-radio">
              <input type="radio" name="type" checked={form.type === 'IMAGE'} onChange={() => set('type', 'IMAGE')} /> 이미지 digest
            </label>
            <label className="reach-radio">
              <input type="radio" name="type" checked={form.type === 'REPO'} onChange={() => set('type', 'REPO')} /> 레포 커밋
            </label>
          </fieldset>

          {form.type === 'IMAGE' ? (
            <>
              <label className="field">
                이미지 저장소
                <input
                  className="input"
                  value={form.repository}
                  placeholder={example.image}
                  aria-invalid={Boolean(errors.repository)}
                  onChange={(event) => set('repository', event.target.value)}
                />
                {errors.repository && <span className="field-error">{errors.repository}</span>}
              </label>
              <label className="field">
                digest
                <input
                  className="input reach-mono"
                  value={form.digest}
                  placeholder="sha256:…"
                  aria-invalid={Boolean(errors.digest)}
                  onChange={(event) => set('digest', event.target.value)}
                />
                {errors.digest && <span className="field-error">{errors.digest}</span>}
                <span className="caption">태그는 바뀔 수 있어 digest로 지정해요.</span>
              </label>
            </>
          ) : (
            <>
              <label className="field">
                레포
                <input
                  className="input"
                  value={form.repoName}
                  placeholder={example.repo}
                  aria-invalid={Boolean(errors.repoName)}
                  onChange={(event) => set('repoName', event.target.value)}
                />
                {errors.repoName && <span className="field-error">{errors.repoName}</span>}
              </label>
              <label className="field">
                커밋 SHA
                <input
                  className="input reach-mono"
                  value={form.commit}
                  placeholder="40자"
                  aria-invalid={Boolean(errors.commit)}
                  onChange={(event) => set('commit', event.target.value)}
                />
                {errors.commit && <span className="field-error">{errors.commit}</span>}
              </label>
              <label className="field">
                레포 안 경로 (선택)
                <input className="input" value={form.path} placeholder={example.path} onChange={(event) => set('path', event.target.value)} />
              </label>
            </>
          )}

          <label className="field">
            앱
            <select className="select" value={form.app} onChange={(event) => set('app', event.target.value)}>
              <option value="">설정의 레포·저장소로 정하기</option>
              {appCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="reach-fieldset">
            <legend>단계</legend>
            <label className="reach-radio">
              <input type="checkbox" checked disabled /> SBOM 생성 · CVE 대조 (항상)
            </label>
            <label className="reach-radio">
              <input type="checkbox" checked={form.l1} onChange={(event) => set('l1', event.target.checked)} /> L1 배포 확인
            </label>
            <label className="reach-radio">
              <input type="checkbox" checked={form.l2} onChange={(event) => set('l2', event.target.checked)} /> L2 판정
            </label>
            <label className="reach-radio reach-disabled">
              <input type="checkbox" disabled /> L3 실제 호출 (계획)
            </label>
            <span className="caption">L2 판정은 앱 1개에 약 40초 걸려요(bootJar 빌드 제외).</span>
          </fieldset>

          {requestError && (
            <p className="notice error" role="alert">
              {requestError}
            </p>
          )}

          <div className="reach-dialog-foot">
            <button type="button" className="btn outline" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="btn primary" disabled={create.isPending}>
              {create.isPending ? '요청 중…' : '스캔 요청'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}
