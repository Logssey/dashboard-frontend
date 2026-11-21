import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { createReachScan, fetchReachApps, fetchReachScans, fetchReachWorkloads, type ReachScan } from '@/api/reach'
import {
  isScanPicked,
  newIdempotencyKey as newKey,
  type NewScanForm,
  newScanRequest,
  type ScanPick,
  scanPicks,
  scanRequestErrorText,
} from '@/lib/reach'

// SCR-05-09 새 스캔 대화상자. [스캔 요청] → API-01. 대화상자를 열 때마다 멱등 키를 새로 만들어,
// 같은 대화상자에서 두 번 눌러도(응답이 늦어 다시 누름) 스캔은 하나만 생긴다 (API 명세 2-7)
// 대상은 적지 않고 고른다: 실행 중인 이미지(API-07)와 최근 스캔한 대상(API-02)을 줄로 보여 주고, 누르면 칸이 채워진다.
// 목록에 없는 대상만 "직접 입력"을 펼쳐 적는다

const NO_FILTER = { scanStatus: [], trigger: [] }

/** 대상 칸을 채워서 열었는가 (워크로드의 [스캔 요청], 실패한 스캔의 [다시 실행]) */
function hasTarget(form: NewScanForm | null): boolean {
  return Boolean(form && (form.repository || form.digest || form.repoName || form.commit))
}

function PickGroup({ title, picks, form, onPick }: { title: string; picks: ScanPick[]; form: NewScanForm; onPick: (pick: ScanPick) => void }) {
  if (picks.length === 0) return null
  return (
    <div className="reach-pick-group">
      <h3>{title}</h3>
      <ul className="reach-pick-list">
        {picks.map((pick) => (
          <li key={pick.key}>
            <button type="button" className="reach-pick" aria-pressed={isScanPicked(form, pick)} onClick={() => onPick(pick)}>
              <span className="reach-pick-title">{pick.title}</span>
              <span className="reach-pick-note">{pick.note}</span>
              <span className="reach-pick-ref reach-mono" title={pick.full}>
                {pick.ref}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
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
  // "직접 입력"을 펼쳤는가. 값을 채워서 연 경우(워크로드의 [스캔 요청], [다시 실행])는 채운 값이 보이게 펼쳐서 연다
  const [manual, setManual] = useState(() => hasTarget(initial))

  const create = useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: NonNullable<ReturnType<typeof newScanRequest>['input']>; idempotencyKey: string }) =>
      createReachScan(input, idempotencyKey),
    onSuccess: (scan) => onCreated(scan),
    // 422는 앱을 정하지 못한 것이다. 앱을 고르는 칸이 직접 입력 안에 있어 펼친다
    onError: (error) => {
      if (error instanceof ApiError && error.status === 422) setManual(true)
    },
  })

  useEffect(() => {
    const dialog = dialogRef.current
    if (initial) {
      setForm(initial)
      setKey(newKey())
      setTouched(false)
      setManual(hasTarget(initial))
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

  // 고를 대상. 예시 값(개발 서버에서 API가 없을 때)은 실제 대상이 아니라 넣지 않는다. 못 받으면 직접 입력만 남는다
  const workloads = useQuery({ queryKey: ['reach-workloads'], queryFn: fetchReachWorkloads, enabled: Boolean(form), staleTime: 60_000 })
  const recentScans = useQuery({
    queryKey: ['reach-scans', 'picks'],
    queryFn: () => fetchReachScans(NO_FILTER, null),
    enabled: Boolean(form),
    staleTime: 60_000,
  })
  const picks = scanPicks(
    workloads.data && !workloads.data.sample ? workloads.data.data.items : [],
    recentScans.data && !recentScans.data.sample ? recentScans.data.data.items : [],
  )
  const picksLoading = workloads.isPending || recentScans.isPending
  const noPicks = !picksLoading && picks.running.length === 0 && picks.recent.length === 0
  const picked = form ? [...picks.running, ...picks.recent].find((pick) => isScanPicked(form, pick)) : undefined
  const pick = (chosen: ScanPick) => {
    setForm((previous) => (previous ? { ...previous, ...chosen.fill } : previous))
    setKey(newKey())
    setTouched(false)
  }

  const result = form ? newScanRequest(form) : { errors: {} }
  const errors = touched ? result.errors : {}
  // 아무것도 고르지 않고 요청하면 직접 입력 칸의 오류 대신 고르라고 알린다
  const nothingChosen = touched && !result.input && !manual && !noPicks && !picked
  const requestError =
    create.error instanceof ApiError
      ? scanRequestErrorText(create.error.status, create.error.code, create.error.message)
      : create.error
        ? '스캔을 요청하지 못했어요. 연결을 확인하고 다시 시도하세요.'
        : null

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setTouched(true)
    // 고른 줄의 값이 규칙에 안 맞으면(있어서는 안 되지만) 어느 칸인지 보이게 직접 입력을 펼친다
    if (!result.input && picked) setManual(true)
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

          {(picksLoading || !noPicks) && (
            <div className="reach-picks">
              {picksLoading && (
                <p className="caption" role="status">
                  고를 대상을 불러오는 중…
                </p>
              )}
              <PickGroup title="실행 중인 이미지" picks={picks.running} form={form} onPick={pick} />
              <PickGroup title="최근 스캔한 대상" picks={picks.recent} form={form} onPick={pick} />
              {nothingChosen && (
                <p className="field-error" role="alert">
                  스캔할 대상을 고르거나 직접 입력하세요.
                </p>
              )}
            </div>
          )}

          <details className="reach-manual" open={manual || noPicks} onToggle={(event) => setManual(event.currentTarget.open)}>
            <summary>{picked && !manual ? `직접 입력 (지금 고른 대상: ${picked.title})` : '직접 입력'}</summary>
            <div className="reach-manual-body">
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
            </div>
          </details>

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
              <input type="checkbox" disabled /> L3 실제 실행 (PR 이미지가 빌드될 때 자동으로 돌아요)
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
