import { useEffect, useId, useRef, useState } from 'react'
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient
} from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import {
  createSecretConnection,
  deleteGitHubCredential,
  fetchConnectionSettings,
  fetchConnectionSetupOptions,
  fetchGitHubBranches,
  fetchGitHubRepositories,
  restoreGitHubCredential,
  updateSecretConnection,
  updateSecretTargets,
  type AwsScanTarget,
  type EditableSecretProvider,
  type GitHubScanTarget,
  type SecretConnectionSettings,
  type SecretConnectionSetupOptions
} from '@/api/secretConnections'
import {
  awsMetadataLabels,
  awsTargetOptions,
  connectionCreateRequestKey,
  connectionManagementError,
  githubCredential,
  githubCredentialError,
  githubTargetsError
} from '@/lib/secretConnectionManagement'
import { scanDate } from '@/lib/secretScan'
import { SecretConnectionReadiness } from './SecretConnectionReadiness'
import { SecretDefaultStoragePolicy } from './SecretDefaultStoragePolicy'
import { SecretDetailPanel } from './SecretDetailPanel'
import './secret-connection-manager.css'

const settingsKey = (id: number) => ['secret-connection-settings', id]
type SaveAction = (
  operation: () => Promise<SecretConnectionSettings>,
  message: string
) => Promise<boolean>
interface CredentialDraft {
  appId: string
  installationId: string
  privateKey: string
}

function CredentialFields({
  draft,
  onChange
}: {
  draft: CredentialDraft
  onChange: (draft: CredentialDraft | ((current: CredentialDraft) => CredentialDraft)) => void
}) {
  const prefix = useId()
  const [fileError, setFileError] = useState('')
  const fileReadId = useRef(0)
  useEffect(() => { fileReadId.current++ }, [draft.privateKey])
  useEffect(() => () => { fileReadId.current++ }, [])
  return (
    <div className="secret-manager-credential-fields">
      <details className="secret-manager-app-help">
        <summary>GitHub App 정보는 어디서 확인하나요?</summary>
        <ol>
          <li>GitHub 조직 설정의 Developer settings → GitHub Apps에서 App ID를 확인하세요.</li>
          <li>Install App의 설치 설정 주소에 있는 숫자가 Installation ID예요.</li>
          <li>검사할 저장소와 Contents 읽기 권한을 허용하고, App의 개인 키 PEM 파일을 선택하세요.</li>
        </ol>
      </details>
      <label htmlFor={`${prefix}-app`}>
        App ID
        <input
          id={`${prefix}-app`}
          inputMode="numeric"
          autoComplete="off"
          value={draft.appId}
          onChange={(event) =>
            onChange({ ...draft, appId: event.target.value })
          }
        />
      </label>
      <label htmlFor={`${prefix}-installation`}>
        Installation ID
        <input
          id={`${prefix}-installation`}
          inputMode="numeric"
          autoComplete="off"
          value={draft.installationId}
          onChange={(event) =>
            onChange({ ...draft, installationId: event.target.value })
          }
        />
      </label>
      <label className="secret-manager-pem" htmlFor={`${prefix}-key`}>
        App 개인 키
        <input type="file" accept=".pem" aria-label="GitHub App 개인 키 파일 선택"
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0]
            const readId = ++fileReadId.current
            event.currentTarget.value = ''
            setFileError('')
            if (!file) return
            if (file.size > 32_768) { setFileError('32KB 이하의 PEM 파일을 선택하세요.'); return }
            try {
              const text = (await file.text()).replace(/^\uFEFF/, '').trim()
              if (fileReadId.current !== readId) return
              if (!/^-----BEGIN (RSA )?PRIVATE KEY-----\r?\n[\s\S]+\r?\n-----END \1PRIVATE KEY-----$/.test(text)) {
                setFileError('GitHub App에서 내려받은 PEM 개인 키 파일을 선택하세요.'); return
              }
              onChange((current) => ({ ...current, privateKey: text }))
            } catch {
              if (fileReadId.current === readId) setFileError('파일을 읽지 못했어요. 파일을 다시 선택하세요.')
            }
          }} />
        <textarea
          id={`${prefix}-key`}
          rows={6}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={draft.privateKey}
          placeholder="PEM 파일을 선택하거나 전체 내용을 붙여넣으세요."
          onChange={(event) =>
            onChange({ ...draft, privateKey: event.target.value })
          }
        />
      </label>
      {fileError && <p className="caption" role="alert">{fileError}</p>}
      <p className="caption">
        입력한 개인 키를 암호화 보관해요. 인증 상태 확인과 교체·삭제 기능으로
        관리하세요.
      </p>
    </div>
  )
}

function CreateConnectionForm({
  setup,
  busy,
  setBusy,
  onCreated
}: {
  setup: SecretConnectionSetupOptions
  busy: boolean
  setBusy: (value: boolean) => void
  onCreated: (settings: SecretConnectionSettings) => void
}) {
  const [provider, setProvider] = useState<EditableSecretProvider>(
    setup.providers.includes('GITHUB') ? 'GITHUB' : 'AWS'
  )
  const [name, setName] = useState('')
  const [draft, setDraft] = useState<CredentialDraft>({
    appId: '',
    installationId: '',
    privateKey: ''
  })
  const [error, setError] = useState('')
  const requestKey = useRef({ digest: '', key: '' })
  const validation =
    provider === 'GITHUB'
      ? githubCredentialError(
          draft.appId,
          draft.installationId,
          draft.privateKey
        )
      : null
  const storageMissing =
    provider === 'GITHUB' && !setup.credentialStorageConfigured
  const disabled = busy || !setup.enabled || !setup.canCreate || storageMissing
  const submit = async () => {
    if (disabled || !name.trim() || validation) return
    setBusy(true)
    setError('')
    try {
      // Credentials stay outside the React Query mutation cache.
      const payload = {
        provider,
        displayName: name.trim(),
        ...(provider === 'GITHUB'
          ? {
              githubCredential: githubCredential(
                draft.appId,
                draft.installationId,
                draft.privateKey
              )
            }
          : {})
      }
      setDraft((current) => ({ ...current, privateKey: '' }))
      const idempotencyKey = await connectionCreateRequestKey(
        requestKey,
        payload
      )
      const created = await createSecretConnection({
        ...payload,
        idempotencyKey
      })
      onCreated(created)
    } catch (failure) {
      setError(connectionManagementError(failure))
    } finally {
      setDraft((current) => ({ ...current, privateKey: '' }))
      setBusy(false)
    }
  }
  return (
    <form
      className="secret-manager-form"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <p className="secret-manager-step">연결 정보 입력 → 검사 대상 선택</p>
      <fieldset disabled={busy || !setup.enabled || !setup.canCreate}>
        <legend>연결 정보</legend>
        <label>
          플랫폼
          <select
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value as EditableSecretProvider)
              setDraft({ appId: '', installationId: '', privateKey: '' })
            }}
          >
            {setup.providers.map((value) => (
              <option key={value} value={value}>
                {value === 'GITHUB' ? 'GitHub' : 'AWS'}
              </option>
            ))}
          </select>
        </label>
        <label>
          연결 이름
          <input
            value={name}
            maxLength={200}
            placeholder={
              provider === 'GITHUB' ? '예: 개발 저장소' : '예: 운영 AWS'
            }
            onChange={(event) => {
              setName(event.target.value)
            }}
          />
        </label>
      </fieldset>
      {provider === 'GITHUB' ? (
        <fieldset disabled={disabled}>
          <legend>GitHub App 인증</legend>
          <CredentialFields draft={draft} onChange={setDraft} />
          <p className="caption">
            수집할 저장소에 설치한 App의 Contents 읽기 권한을 사용해요.
          </p>
        </fieldset>
      ) : (
        <section className="secret-manager-account">
          <h3>AWS 실행 역할</h3>
          <dl>
            <dt>계정</dt>
            <dd>{setup.aws.accountId || '서버 설정 확인 필요'}</dd>
            <dt>인증</dt>
            <dd>서버 IAM 역할로 인증</dd>
          </dl>
          <p>접근 권한은 연결 테스트에서 확인해요.</p>
        </section>
      )}
      {storageMissing && (
        <p className="notice" role="status">
          GitHub 인증 저장소의 서버 설정이 필요해요.
        </p>
      )}
      {(!setup.enabled || !setup.canCreate) && (
        <p className="notice" role="status">
          연결을 추가할 운영 권한과 서버 설정을 확인하세요.
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="secret-manager-footer">
        <button
          className="btn primary"
          type="submit"
          disabled={disabled || !name.trim() || !!validation}
        >
          {busy ? '등록 중…' : '연결 만들기'}
        </button>
      </div>
      {!busy && provider === 'GITHUB' && draft.privateKey && validation && (
        <p className="caption" role="status">
          {validation}
        </p>
      )}
    </form>
  )
}

function GitHubTargetRow({
  connectionId,
  target,
  repositories,
  onChange,
  onRemove
}: {
  connectionId: number
  target: GitHubScanTarget
  repositories: { fullName: string; defaultBranch: string; private: boolean }[]
  onChange: (value: GitHubScanTarget) => void
  onRemove: () => void
}) {
  const branches = useInfiniteQuery({
    queryKey: ['secret-github-branches', connectionId, target.repository],
    queryFn: ({ pageParam }) =>
      fetchGitHubBranches(connectionId, target.repository, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, _pages, page) =>
      last.items.length === 100 && page < 100 ? page + 1 : undefined,
    enabled: !!target.repository,
    retry: false,
    refetchOnWindowFocus: false
  })
  const options = [
    ...new Set(
      [
        target.branch,
        ...(branches.data?.pages.flatMap((page) =>
          page.items.map((item) => item.name)
        ) ?? [])
      ].filter(Boolean)
    )
  ]
  const hasRepository = repositories.some(
    (item) => item.fullName === target.repository
  )
  return (
    <div className="secret-manager-target">
      <div className="secret-manager-target-heading">
        <strong>저장소 검사 대상</strong>
        <button className="btn outline" type="button" onClick={onRemove}>
          삭제
        </button>
      </div>
      <label>
        저장소
        <select
          value={target.repository}
          onChange={(event) => {
            const repository = repositories.find(
              (item) => item.fullName === event.target.value
            )
            onChange({
              repository: event.target.value,
              branch: repository?.defaultBranch ?? '',
              path: ''
            })
          }}
        >
          <option value="">저장소 선택</option>
          {target.repository && !hasRepository && (
            <option value={target.repository}>
              {target.repository} · 기존 대상
            </option>
          )}
          {repositories.map((item) => (
            <option key={item.fullName} value={item.fullName}>
              {item.fullName}
              {item.private ? ' · 비공개' : ' · 공개'}
            </option>
          ))}
        </select>
      </label>
      <label>
        브랜치
        <select
          value={target.branch}
          disabled={!target.repository || branches.isPending}
          onChange={(event) =>
            onChange({ ...target, branch: event.target.value })
          }
        >
          <option value="">
            {branches.isFetching ? '브랜치 조회 중…' : '브랜치 선택'}
          </option>
          {options.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {branches.isError && (
        <div className="secret-manager-inline-error" role="alert">
          <p>{connectionManagementError(branches.error)}</p>
          <button
            type="button"
            className="btn outline"
            onClick={() => void branches.refetch()}
          >
            브랜치 다시 조회
          </button>
        </div>
      )}
      {branches.isSuccess &&
        branches.data.pages.every((page) => page.items.length === 0) && (
          <p className="caption">
            브랜치를 찾지 못했어요. 저장소의 커밋을 확인하세요.
          </p>
        )}
      {branches.hasNextPage && (
        <button
          type="button"
          className="btn outline"
          disabled={branches.isFetchingNextPage}
          onClick={() => void branches.fetchNextPage()}
        >
          브랜치 더 보기
        </button>
      )}
      <label>
        폴더
        <input
          value={target.path}
          maxLength={250}
          placeholder="전체 저장소"
          autoComplete="off"
          onChange={(event) =>
            onChange({ ...target, path: event.target.value })
          }
        />
        <small>비워두면 저장소 전체를 검사해요.</small>
      </label>
    </div>
  )
}

function GitHubTargetsForm({
  settings,
  disabled,
  save,
  onCredential
}: {
  settings: SecretConnectionSettings
  disabled: boolean
  save: SaveAction
  onCredential: () => void
}) {
  const [rows, setRows] = useState(() =>
    settings.githubTargets.map((target, key) => ({ key, target }))
  )
  const [activate, setActivate] = useState(settings.status === 'ACTIVE' || settings.githubTargets.length === 0)
  const nextKey = useRef(rows.length)
  const repositories = useInfiniteQuery({
    queryKey: [
      'secret-github-repositories',
      settings.connectionId,
      settings.credentialVersion
    ],
    queryFn: ({ pageParam }) =>
      fetchGitHubRepositories(settings.connectionId, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, _pages, page) =>
      last.items.length === 100 && page < 100 ? page + 1 : undefined,
    enabled: settings.credentialConfigured,
    retry: false,
    refetchOnWindowFocus: false
  })
  const targets = rows.map((row) => row.target)
  const error = githubTargetsError(targets)
  const changed =
    JSON.stringify(targets) !== JSON.stringify(settings.githubTargets)
  const items = [
    ...new Map(
      repositories.data?.pages
        .flatMap((page) => page.items)
        .map((item) => [item.fullName, item]) ?? []
    ).values()
  ]
  if (!settings.credentialConfigured)
    return (
      <div className="secret-manager-empty">
        <p>
          {settings.credentialDeletionPending
            ? 'App 인증 정보가 삭제 예약되어 있어요. 인증 상태를 확인하세요.'
            : '저장소를 선택하려면 GitHub App 인증을 등록하세요.'}
        </p>
        <button className="btn outline" onClick={onCredential}>
          {settings.credentialDeletionPending ? '인증 상태 확인' : '인증 등록'}
        </button>
      </div>
    )
  return (
    <form
      className="secret-manager-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!disabled && !error && changed)
          void save(
            () =>
              updateSecretTargets(settings.connectionId, {
                expectedScopeVersion: settings.scopeVersion,
                expectedSettingsVersion: settings.settingsVersion,
                ...(settings.capabilities?.activateTargets ? { activate } : {}),
                githubTargets: targets.map((target) => ({
                  ...target,
                  path: target.path.trim()
                }))
              }),
            '검사 대상을 저장했어요. 아래에서 실행 준비 상태를 확인하세요.'
          )
      }}
    >
      <p className="caption">
        App에 허용된 저장소에서 브랜치와 폴더를 선택하세요.
      </p>
      {repositories.isPending && (
        <p role="status">저장소를 불러오는 중이에요.</p>
      )}
      {repositories.isSuccess && !items.length && (
        <p className="notice">
          App에 허용된 저장소가 없어요. GitHub 설치 설정을 확인하세요.
        </p>
      )}
      {repositories.isError && (
        <div className="secret-manager-inline-error" role="alert">
          <p>{connectionManagementError(repositories.error)}</p>
          <button
            type="button"
            className="btn outline"
            disabled={disabled}
            onClick={() => void repositories.refetch()}
          >
            저장소 다시 조회
          </button>
        </div>
      )}
      {repositories.hasNextPage && (
        <button
          type="button"
          className="btn outline"
          disabled={disabled || repositories.isFetchingNextPage}
          onClick={() => void repositories.fetchNextPage()}
        >
          저장소 더 보기
        </button>
      )}
      <fieldset disabled={disabled} className="secret-manager-target-list">
        <legend className="sr-only">GitHub 검사 대상</legend>
        {!rows.length && (
          <p className="secret-manager-empty">등록된 검사 대상이 없어요.</p>
        )}
        {rows.map((row) => (
          <GitHubTargetRow
            key={row.key}
            connectionId={settings.connectionId}
            target={row.target}
            repositories={items}
            onRemove={() =>
              setRows((current) =>
                current.filter((item) => item.key !== row.key)
              )
            }
            onChange={(target) =>
              setRows((current) =>
                current.map((item) =>
                  item.key === row.key ? { ...item, target } : item
                )
              )
            }
          />
        ))}
        <button
          className="btn outline"
          type="button"
          disabled={rows.length >= 100}
          onClick={() =>
            setRows((current) => [
              ...current,
              {
                key: nextKey.current++,
                target: { repository: '', branch: '', path: '' }
              }
            ])
          }
        >
          + 검사 대상 추가
        </button>
      </fieldset>
      {error && (
        <p className="caption" role="status">
          {error}
        </p>
      )}
      {changed && !targets.length && (
        <p className="notice">검사 대상을 모두 삭제하면 연결이 일시중지돼요.</p>
      )}
      {settings.capabilities?.activateTargets && targets.length > 0 && <label className="secret-manager-checkbox">
        <input type="checkbox" checked={activate} disabled={disabled} onChange={(event) => setActivate(event.target.checked)} />
        <span><strong>저장 후 검사 사용</strong><small>수동 검사와 6시간 주기 검사를 사용할 수 있어요.</small></span>
      </label>}
      {settings.scanLimits && <p className="caption">검사 한도 · 텍스트 {settings.scanLimits.maxFiles.toLocaleString()}개 · 파일당 {Math.round(settings.scanLimits.maxFileBytes / 1_048_576)}MB · 총 {Math.round(settings.scanLimits.maxTotalBytes / 1_048_576)}MB. 이미지 등 본문 검사 대상에서 제외한 파일과 읽지 못한 파일을 결과에서 구분해요.</p>}
      <div className="secret-manager-footer">
        <button
          className="btn primary"
          type="submit"
          disabled={disabled || !!error || !changed}
        >
          검사 대상 저장
        </button>
      </div>
    </form>
  )
}

function AwsTargetsForm({
  settings,
  setup,
  disabled,
  save
}: {
  settings: SecretConnectionSettings
  setup: SecretConnectionSetupOptions
  disabled: boolean
  save: SaveAction
}) {
  const [targets, setTargets] = useState(settings.awsTargets)
  const [activate, setActivate] = useState(settings.status === 'ACTIVE' || settings.awsTargets.length === 0)
  const options = awsTargetOptions(
    setup.aws.targetKinds,
    setup.aws.regions,
    settings.awsTargets
  )
  const contains = (target: AwsScanTarget) =>
    targets.some(
      (item) => item.kind === target.kind && item.region === target.region
    )
  const changed =
    JSON.stringify(targets) !== JSON.stringify(settings.awsTargets)
  return (
    <form
      className="secret-manager-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!disabled && changed)
          void save(
            () =>
              updateSecretTargets(settings.connectionId, {
                expectedScopeVersion: settings.scopeVersion,
                expectedSettingsVersion: settings.settingsVersion,
                awsTargets: targets,
                ...(settings.capabilities?.activateTargets ? { activate } : {})
              }),
            '검사 대상을 저장했어요. 아래에서 실행 준비 상태를 확인하세요.'
          )
      }}
    >
      <section className="secret-manager-account">
        <h3>AWS 실행 역할</h3>
        <dl>
          <dt>계정</dt>
          <dd>{setup.aws.accountId || '서버 설정 확인 필요'}</dd>
          <dt>인증</dt>
          <dd>
            {settings.credentialConfigured
              ? '서버 IAM 역할 사용'
              : '서버 IAM 역할 확인 필요'}
          </dd>
        </dl>
      </section>
      <fieldset disabled={disabled}>
        <legend>조회할 메타데이터</legend>
        {options.map((target) => (
          <label
            className="secret-manager-checkbox"
            key={`${target.kind}:${target.region}`}
          >
            <input
              type="checkbox"
              checked={contains(target)}
              onChange={(event) =>
                setTargets((current) =>
                  event.target.checked
                    ? [...current, target]
                    : current.filter(
                        (item) =>
                          item.kind !== target.kind ||
                          item.region !== target.region
                      )
                )
              }
            />
            <span>
              <strong>{awsMetadataLabels[target.kind] ?? target.kind}</strong>
              <small>
                {target.region === 'global'
                  ? '전체 리전'
                  : target.region === 'ap-northeast-1'
                    ? '도쿄 · ap-northeast-1'
                    : target.region}
              </small>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="caption">
        키 상태·버킷 설정·비밀 이름 등 메타데이터를 조회해요.
      </p>
      {changed && !targets.length && (
        <p className="notice">검사 대상을 모두 삭제하면 연결이 일시중지돼요.</p>
      )}
      {settings.capabilities?.activateTargets && targets.length > 0 && <label className="secret-manager-checkbox">
        <input type="checkbox" checked={activate} disabled={disabled} onChange={(event) => setActivate(event.target.checked)} />
        <span><strong>저장 후 검사 사용</strong><small>선택한 메타데이터의 수동·정기 검사를 사용해요.</small></span>
      </label>}
      <div className="secret-manager-footer">
        <button
          className="btn primary"
          type="submit"
          disabled={disabled || !changed}
        >
          검사 대상 저장
        </button>
      </div>
    </form>
  )
}

function ConnectionInfoForm({
  settings,
  disabled,
  save
}: {
  settings: SecretConnectionSettings
  disabled: boolean
  save: SaveAction
}) {
  const [name, setName] = useState(settings.displayName)
  const [active, setActive] = useState(settings.status === 'ACTIVE')
  const hasTargets =
    settings.githubTargets.length + settings.awsTargets.length > 0
  const changed =
    name.trim() !== settings.displayName ||
    active !== (settings.status === 'ACTIVE')
  return (
    <form
      className="secret-manager-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!disabled && changed && name.trim())
          void save(
            () =>
              updateSecretConnection(settings.connectionId, {
                expectedScopeVersion: settings.scopeVersion,
                expectedSettingsVersion: settings.settingsVersion,
                displayName: name.trim(),
                status: active ? 'ACTIVE' : 'PAUSED'
              }),
            '연결 정보를 저장했어요.'
          )
      }}
    >
      <fieldset disabled={disabled}>
        <legend>연결 정보</legend>
        <label>
          연결 이름
          <input
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="secret-manager-checkbox">
          <input
            type="checkbox"
            checked={active}
            disabled={
              !active && (!settings.credentialConfigured || !hasTargets)
            }
            onChange={(event) => setActive(event.target.checked)}
          />
          <span>
            <strong>연결 활성화</strong>
            <small>활성 연결에서 정기 검사와 수동 스캔을 실행해요.</small>
          </span>
        </label>
      </fieldset>
      {!active && (!settings.credentialConfigured || !hasTargets) && (
        <p className="caption">
          인증과 검사 대상을 등록하면 활성화할 수 있어요.
        </p>
      )}
      <div className="secret-manager-footer">
        <button
          type="submit"
          className="btn primary"
          disabled={disabled || !name.trim() || !changed}
        >
          연결 정보 저장
        </button>
      </div>
    </form>
  )
}

export function SecretConnectionCredentialForm({
  settings,
  storageConfigured,
  disabled,
  save
}: {
  settings: SecretConnectionSettings
  storageConfigured: boolean
  disabled: boolean
  save: SaveAction
}) {
  const [editing, setEditing] = useState(
    !settings.credentialConfigured && !settings.credentialDeletionPending
  )
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [draft, setDraft] = useState<CredentialDraft>({
    appId: String(settings.githubApp?.appId ?? ''),
    installationId: String(settings.githubApp?.installationId ?? ''),
    privateKey: ''
  })
  const error = githubCredentialError(
    draft.appId,
    draft.installationId,
    draft.privateKey
  )
  const submit = async () => {
    if (disabled || !storageConfigured || error) return
    const payload = {
      expectedScopeVersion: settings.scopeVersion,
                expectedSettingsVersion: settings.settingsVersion,
      displayName: settings.displayName,
      status: 'PAUSED' as const,
      githubCredential: githubCredential(
        draft.appId,
        draft.installationId,
        draft.privateKey
      )
    }
    setDraft((current) => ({ ...current, privateKey: '' }))
    try {
      await save(
        () => updateSecretConnection(settings.connectionId, payload),
        '인증을 저장했어요. 검사 대상을 확인하고 연결을 활성화하세요.'
      )
    } finally {
      setDraft((current) => ({ ...current, privateKey: '' }))
    }
  }
  return (
    <section className="secret-manager-form">
      <dl className="secret-manager-credential-summary">
        <dt>인증 상태</dt>
        <dd>{settings.credentialConfigured ? '설정됨' : '등록 필요'}</dd>
        <dt>App ID</dt>
        <dd>{settings.githubApp?.appId ?? '등록 전'}</dd>
        <dt>Installation ID</dt>
        <dd>{settings.githubApp?.installationId ?? '등록 전'}</dd>
        {settings.credentialVersion != null && (
          <>
            <dt>인증 버전</dt>
            <dd>{settings.credentialVersion}</dd>
          </>
        )}
      </dl>
      {settings.credentialConfigured && (
        <div className="row">
          <button
            type="button"
            className="btn outline"
            disabled={disabled || !storageConfigured}
            onClick={() => {
              setEditing(!editing)
              setDraft((current) => ({ ...current, privateKey: '' }))
              setConfirmDelete(false)
            }}
          >
            {editing ? '교체 취소' : '인증 교체'}
          </button>
          <button
            type="button"
            className="btn outline"
            disabled={disabled}
            onClick={() => {
              setConfirmDelete(!confirmDelete)
              setEditing(false)
              setDraft((current) => ({ ...current, privateKey: '' }))
            }}
          >
            {settings.credentialVersion == null
              ? '인증 해제'
              : '인증 정보 삭제'}
          </button>
        </div>
      )}
      {settings.credentialDeletionPending && (
        <div className="secret-manager-delete-confirm">
          <strong>인증 정보 삭제 예약됨</strong>
          {settings.credentialRecoveryUntil && (
            <p>복구 기한 {scanDate(settings.credentialRecoveryUntil)}</p>
          )}
          {settings.canRestoreCredential && (
            <button
              type="button"
              className="btn outline"
              disabled={disabled || !storageConfigured}
              onClick={() =>
                void save(
                  () =>
                    restoreGitHubCredential(
                      settings.connectionId,
                      settings.scopeVersion
                    ),
                  '인증을 복구했어요. 검사 대상을 확인하고 연결을 활성화하세요.'
                )
              }
            >
              인증 복구
            </button>
          )}
        </div>
      )}
      {!storageConfigured && (
        <p className="notice">
          인증 등록·교체에는 서버의 인증 저장소 설정이 필요해요.
        </p>
      )}
      {editing && (
        <form
          className="secret-manager-form"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <fieldset disabled={disabled || !storageConfigured}>
            <legend>
              GitHub App 인증 {settings.credentialConfigured ? '교체' : '등록'}
            </legend>
            <CredentialFields draft={draft} onChange={setDraft} />
          </fieldset>
          {draft.privateKey && error && (
            <p className="caption" role="status">
              {error}
            </p>
          )}
          <div className="secret-manager-footer">
            <button
              type="submit"
              className="btn primary"
              disabled={disabled || !storageConfigured || !!error}
            >
              인증 저장
            </button>
          </div>
        </form>
      )}
      {confirmDelete && (
        <div className="secret-manager-delete-confirm">
          <strong>
            {settings.credentialVersion == null
              ? '이 연결의 인증을 해제할까요?'
              : 'App 인증 정보를 삭제 예약할까요?'}
          </strong>
          <p>
            {settings.credentialVersion == null
              ? '이 연결의 인증 사용을 해제하고 연결을 중지해요. 공유 인증 파일은 서버에서 관리해요.'
              : '연결을 중지하고 인증 정보를 삭제 예약해요. 7일의 복구 기간 후 삭제돼요.'}
          </p>
          <div className="row">
            <button
              className="btn outline"
              disabled={disabled}
              onClick={() => setConfirmDelete(false)}
            >
              취소
            </button>
            <button
              className="btn outline"
              disabled={disabled}
              onClick={() =>
                void save(
                  () =>
                    deleteGitHubCredential(
                      settings.connectionId,
                      settings.scopeVersion
                    ),
                  settings.credentialVersion == null
                    ? '인증을 해제하고 연결을 일시중지했어요.'
                    : '인증 정보 삭제를 예약하고 연결을 일시중지했어요.'
                )
              }
            >
              {settings.credentialVersion == null
                ? '인증 해제 확인'
                : '삭제 예약 확인'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function ConnectionEditor({
  settings,
  setup,
  busy,
  setBusy,
  onSaved,
  onReload,
  onReady,
  newlyCreated
}: {
  settings: SecretConnectionSettings
  setup: SecretConnectionSetupOptions
  busy: boolean
  setBusy: (value: boolean) => void
  onSaved: (value: SecretConnectionSettings) => void
  onReload: () => Promise<boolean>
  onReady: () => Promise<void>
  newlyCreated: boolean
}) {
  const [tab, setTab] = useState<'targets' | 'info' | 'credential'>('targets')
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState(
    newlyCreated ? '연결을 만들었어요. 검사 대상을 선택하세요.' : ''
  )
  const [stale, setStale] = useState(false)
  const disabled = busy || !settings.canManage || !setup.enabled || stale
  const hasTargets =
    settings.githubTargets.length + settings.awsTargets.length > 0
  const save: SaveAction = async (operation, message) => {
    if (disabled) return false
    setBusy(true)
    setError('')
    setReceipt('')
    try {
      const value = await operation()
      onSaved(value)
      setReceipt(message)
      return true
    } catch (failure) {
      setError(connectionManagementError(failure))
      setStale(
        failure instanceof ApiError && [403, 404, 409].includes(failure.status)
      )
      return false
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="secret-manager-editor" aria-busy={busy}>
      <div className="secret-manager-heading">
        <div>
          <strong>{settings.displayName}</strong>
          <span>
            {settings.provider === 'GITHUB' ? 'GitHub App' : 'AWS'} 연결
          </span>
        </div>
        <span
          className={`secret-connection-state ${settings.status === 'ACTIVE' ? '' : 'inactive'}`}
        >
          {settings.status === 'ACTIVE'
            ? '사용 중'
            : settings.status === 'ERROR'
              ? '확인 필요'
              : '일시중지'}
        </span>
      </div>
      {receipt && (
        <p className="secret-manager-receipt" role="status">
          {receipt}
        </p>
      )}
      <SecretConnectionReadiness settings={settings} />
      <SecretDefaultStoragePolicy connectionId={settings.connectionId} />
      {error && (
        <div className="secret-manager-inline-error" role="alert">
          <p>{error}</p>
          <button
            className="btn outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                if (await onReload()) {
                  setError('')
                  setStale(false)
                  setReceipt('최신 설정을 불러왔어요.')
                }
              } finally {
                setBusy(false)
              }
            }}
          >
            최신 설정 다시 조회
          </button>
        </div>
      )}
      {(!settings.canManage || !setup.enabled) && (
        <p className="notice">
          연결 설정을 변경할 운영 권한과 서버 설정을 확인하세요.
        </p>
      )}
      <div
        className="secret-manager-tabs"
        role="group"
        aria-label="연결 설정 항목"
      >
        <button
          className={tab === 'targets' ? 'active' : ''}
          aria-pressed={tab === 'targets'}
          disabled={busy}
          onClick={() => setTab('targets')}
        >
          검사 대상
        </button>
        <button
          className={tab === 'info' ? 'active' : ''}
          aria-pressed={tab === 'info'}
          disabled={busy}
          onClick={() => setTab('info')}
        >
          연결 정보
        </button>
        {settings.provider === 'GITHUB' && (
          <button
            className={tab === 'credential' ? 'active' : ''}
            aria-pressed={tab === 'credential'}
            disabled={busy}
            onClick={() => setTab('credential')}
          >
            인증 정보
          </button>
        )}
      </div>
      {tab === 'targets' &&
        (settings.provider === 'GITHUB' ? (
          <GitHubTargetsForm
            key={settings.scopeVersion}
            settings={settings}
            disabled={disabled}
            save={save}
            onCredential={() => setTab('credential')}
          />
        ) : (
          <AwsTargetsForm
            key={settings.scopeVersion}
            settings={settings}
            setup={setup}
            disabled={disabled}
            save={save}
          />
        ))}
      {tab === 'info' && (
        <ConnectionInfoForm
          key={settings.scopeVersion}
          settings={settings}
          disabled={disabled}
          save={save}
        />
      )}
      {tab === 'credential' && settings.provider === 'GITHUB' && (
        <SecretConnectionCredentialForm
          key={settings.scopeVersion}
          settings={settings}
          storageConfigured={setup.credentialStorageConfigured}
          disabled={disabled}
          save={save}
        />
      )}
      <div className="secret-manager-bottom">
        {settings.status !== 'ACTIVE' &&
          settings.credentialConfigured &&
          hasTargets && (
            <button
              className="btn primary"
              disabled={disabled}
              onClick={() =>
                void save(
                  () =>
                    updateSecretConnection(settings.connectionId, {
                      expectedScopeVersion: settings.scopeVersion,
                expectedSettingsVersion: settings.settingsVersion,
                      displayName: settings.displayName,
                      status: 'ACTIVE'
                    }),
                  '연결을 활성화했어요. 연결 테스트와 스캔을 시작할 수 있어요.'
                )
              }
            >
              연결 활성화
            </button>
          )}
        <button
          className="btn outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onReady()
            } catch (failure) {
              setError(connectionManagementError(failure))
            } finally {
              setBusy(false)
            }
          }}
        >
          연결 목록에서 확인
        </button>
      </div>
      {busy && (
        <p className="caption" role="status">
          설정을 저장하는 중이에요.
        </p>
      )}
    </section>
  )
}

export function SecretConnectionManager({
  connectionId,
  onClose,
  onChanged,
  onReady
}: {
  connectionId: number | null
  onClose: () => void
  onChanged: (id: number) => void
  onReady: (id: number) => Promise<void>
}) {
  const client = useQueryClient()
  const [id, setId] = useState(connectionId)
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const setup = useQuery({
    queryKey: ['secret-connection-setup-options'],
    queryFn: fetchConnectionSetupOptions,
    retry: false,
    refetchOnWindowFocus: false
  })
  const settings = useQuery({
    queryKey: settingsKey(id ?? 0),
    queryFn: () => fetchConnectionSettings(id!),
    enabled: id != null,
    retry: false,
    refetchOnWindowFocus: false
  })
  const saved = (value: SecretConnectionSettings) => {
    if (!mounted.current) return
    client.setQueryData(settingsKey(value.connectionId), value)
    for (const key of [
      'secret-connections-manage',
      'secret-connection-scopes',
      'secret-managed-scopes',
      'secret-connection-validation-policy',
      'secret-github-repositories',
      'secret-github-branches'
    ])
      void client.invalidateQueries({ queryKey: [key] })
    onChanged(value.connectionId)
  }
  return (
    <SecretDetailPanel
      open
      title={id == null ? '연결 추가' : '연결 설정'}
      closeLabel="연결 설정 닫기"
      closeDisabled={busy}
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      {setup.isPending ? (
        <p role="status">연결 설정을 불러오는 중이에요.</p>
      ) : setup.isError ? (
        <div role="alert">
          <p>{connectionManagementError(setup.error)}</p>
          <button className="btn outline" onClick={() => void setup.refetch()}>
            다시 조회
          </button>
        </div>
      ) : id == null ? (
        <CreateConnectionForm
          setup={setup.data}
          busy={busy}
          setBusy={setBusy}
          onCreated={(value) => {
            saved(value)
            if (mounted.current) setId(value.connectionId)
          }}
        />
      ) : settings.isPending ? (
        <p role="status">연결 정보를 불러오는 중이에요.</p>
      ) : settings.isError ? (
        <div role="alert">
          <p>{connectionManagementError(settings.error)}</p>
          <button
            className="btn outline"
            onClick={() => void settings.refetch()}
          >
            다시 조회
          </button>
        </div>
      ) : settings.data?.connectionId !== id ? (
        <p role="alert">연결 정보를 다시 선택하세요.</p>
      ) : (
        <ConnectionEditor
          key={id}
          settings={settings.data}
          setup={setup.data}
          busy={busy}
          setBusy={setBusy}
          onSaved={saved}
          onReload={async () => !(await settings.refetch()).isError}
          onReady={() => onReady(id)}
          newlyCreated={connectionId == null}
        />
      )}
    </SecretDetailPanel>
  )
}
