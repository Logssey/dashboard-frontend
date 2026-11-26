import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { writeFile, unlink, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { build } from 'esbuild'
import ts from 'typescript'
import { scanReason } from '../src/lib/secretScan.ts'

const bundle = await build({
  stdin: {
    contents:
      "export * from './src/api/secretConnections'; export * from './src/lib/secretConnectionManagement'; export { ApiError } from './src/api/client'; export { SecretConnectionManager, SecretConnectionCredentialForm } from './src/components/SecretConnectionManager'; export { SecretConnectionReadiness } from './src/components/SecretConnectionReadiness'; export { SecretDefaultStoragePolicy } from './src/components/SecretDefaultStoragePolicy'; export { SecretConnectionsPage } from './src/pages/SecretConnectionsPage'; export { SecretDetailPanel } from './src/components/SecretDetailPanel'",
    resolveDir: resolve('.')
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  packages: 'external',
  loader: { '.css': 'empty' },
  alias: { '@': resolve('src') }
})
const bundlePath = resolve(
  'node_modules/.secret-connection-management-test.mjs'
)
await writeFile(bundlePath, bundle.outputFiles[0].contents)
const api = await import(pathToFileURL(bundlePath).href)
after(() => unlink(bundlePath))

const pem =
  '-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----'
const setup = {
  enabled: true,
  canCreate: true,
  credentialStorageConfigured: true,
  providers: ['GITHUB', 'AWS'],
  aws: {
    accountId: '123456789012',
    regions: ['global', 'ap-northeast-1'],
    targetKinds: [
      'IAM_ACCESS_KEY_METADATA',
      'AWS_S3_BUCKET_METADATA',
      'AWS_SECRETS_MANAGER_METADATA',
      'AWS_SSM_PARAMETER_METADATA'
    ]
  }
}
const github = {
  connectionId: 7,
  provider: 'GITHUB',
  displayName: '개발 저장소',
  status: 'PAUSED',
  scopeVersion: 3,
  credentialConfigured: true,
  credentialVersion: 1,
  githubApp: { appId: 101, installationId: 202 },
  githubTargets: [
    { repository: 'Logssey/test-find-key', branch: 'main', path: 'fixtures/' }
  ],
  awsTargets: [],
  canManage: true
}
const aws = {
  ...github,
  connectionId: 8,
  provider: 'AWS',
  displayName: '운영 AWS',
  credentialVersion: null,
  githubApp: null,
  githubTargets: [],
  awsTargets: [{ kind: 'IAM_ACCESS_KEY_METADATA', region: 'global' }]
}

function render(Component, props, entries = []) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity }
    }
  })
  for (const [key, value] of entries) client.setQueryData(key, value)
  const html = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(MemoryRouter, null, createElement(Component, props))
    )
  )
  client.clear()
  return html
}

function credentialSubmit(source, componentName, bindings) {
  const file = ts.createSourceFile(
    'SecretConnectionManager.tsx',
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TSX
  )
  const component = file.statements.find(
    (statement) =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === componentName
  )
  assert.ok(component, `${componentName} exists`)
  let initializer
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'submit'
    )
      initializer = node.initializer
    ts.forEachChild(node, visit)
  }
  visit(component)
  assert.ok(
    initializer && ts.isArrowFunction(initializer),
    `${componentName} has a submit handler`
  )
  const javascript = ts.transpileModule(
    `const submit = ${initializer.getText(file)}`,
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext
      }
    }
  ).outputText
  return new Function(
    ...Object.keys(bindings),
    `${javascript}\nreturn submit;`
  )(...Object.values(bindings))
}

function deferred() {
  let resolve
  const promise = new Promise((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}
const entries = (settings) => [
  [['secret-connection-setup-options'], setup],
  [['secret-connection-settings', settings.connectionId], settings]
]
const managerProps = (connectionId) => ({
  connectionId,
  onClose() {},
  onChanged() {},
  onReady() {}
})

test('GitHub App draft requires safe positive numeric IDs and a complete bounded PEM', () => {
  for (const value of [
    '',
    '0',
    '-1',
    '1.2',
    '1e2',
    '9007199254740992',
    'Infinity'
  ])
    assert.equal(api.parseGitHubAppId(value), null)
  assert.equal(api.parseGitHubAppId(' 101 '), 101)
  assert.equal(api.githubCredentialError('101', '202', pem), null)
  assert.equal(
    api.githubCredentialError('101', '202', pem.replaceAll('RSA ', '')),
    null
  )
  assert.match(
    api.githubCredentialError('101', '202', pem.replace('END RSA ', 'END ')),
    /PEM/
  )
  assert.match(api.githubCredentialError('101', '202', 'AAAA'), /PEM/)
  assert.match(
    api.githubCredentialError(
      '101',
      '202',
      pem.replace('AAAA', 'A'.repeat(33_000))
    ),
    /크기/
  )
  assert.deepEqual(api.githubCredential('101', '202', ` ${pem} `), {
    appId: 101,
    installationId: 202,
    privateKey: pem
  })
})

test('create retries keep a request ID only for the same canonical payload without retaining credentials', async () => {
  const identity = { current: { digest: '', key: '' } }
  const payload = {
    provider: 'GITHUB',
    displayName: '개발 저장소',
    githubCredential: { appId: 101, installationId: 202, privateKey: pem }
  }
  const original = await api.connectionCreateRequestKey(identity, payload)
  assert.equal(identity.current.digest.length, 64)
  assert.doesNotMatch(
    JSON.stringify(identity.current),
    /PRIVATE|AAAA|개발 저장소/
  )
  assert.equal(
    await api.connectionCreateRequestKey(identity, {
      ...payload,
      displayName: ' 개발 저장소 ',
      githubCredential: {
        ...payload.githubCredential,
        privateKey: `\n${pem}\n`
      }
    }),
    original
  )
  const changedKey = await api.connectionCreateRequestKey(identity, {
    ...payload,
    githubCredential: {
      ...payload.githubCredential,
      privateKey: pem.replace('AAAA', 'BBBB')
    }
  })
  assert.notEqual(changedKey, original)
  const awsKey = await api.connectionCreateRequestKey(identity, {
    provider: 'AWS',
    displayName: '개발 저장소'
  })
  assert.notEqual(awsKey, changedKey)
  assert.equal(
    await api.connectionCreateRequestKey(identity, {
      provider: 'AWS',
      displayName: '개발 저장소'
    }),
    awsKey
  )
  assert.deepEqual(Object.keys(identity.current).sort(), ['digest', 'key'])
})

test('repository root and slash branches are supported while traversal and duplicate scopes are rejected', () => {
  const target = {
    repository: 'Logssey/test-find-key',
    branch: 'feat/secret',
    path: ''
  }
  assert.equal(api.githubTargetsError([target]), null)
  assert.equal(
    api.githubTargetsError([{ ...target, path: 'fixtures/config/' }]),
    null
  )
  assert.equal(api.githubTargetsError([]), null)
  for (const path of [
    '/etc',
    '../private',
    'a/../b',
    'a\\b',
    '%2e%2e',
    'a?ref=b',
    'a\n'
  ])
    assert.ok(api.githubTargetsError([{ ...target, path }]))
  assert.match(
    api.githubTargetsError([target, { ...target, path: '/' }]),
    /상대 경로/
  )
  assert.match(
    api.githubTargetsError([
      { ...target, path: 'fixtures' },
      { ...target, path: 'fixtures/' }
    ]),
    /같은 저장소·브랜치의 폴더가 겹쳐요/
  )
  for (const path of ['a//b', 'a*/b', 'x'.repeat(250)])
    assert.ok(api.githubTargetsError([{ ...target, path }]))
  assert.equal(
    api.githubTargetsError([{ ...target, path: `${'x'.repeat(249)}/` }]),
    null
  )
  assert.match(
    api.githubTargetsError(
      Array.from({ length: 101 }, (_, index) => ({
        ...target,
        path: `folder${index}`
      }))
    ),
    /최대 100개/
  )
})

test('one connection supports different branches while rejecting overlaps within the exact branch', () => {
  const target = { repository: 'Logssey/test-find-key', branch: 'main', path: 'fixtures/' }
  const overlapMessage = '같은 저장소·브랜치의 폴더가 겹쳐요. 중복 대상을 정리하세요.'
  for (const other of [
    { ...target, path: '' },
    { ...target, path: 'fixtures/config' },
    { ...target, repository: 'logssey/TEST-FIND-KEY', path: 'fixtures' },
  ]) {
    assert.equal(api.githubTargetsError([target, other]), overlapMessage)
    assert.equal(api.githubTargetsError([other, target]), overlapMessage)
  }
  for (const other of [
    { ...target, branch: 'develop' },
    { ...target, branch: 'feat/secret', path: 'fixtures/config' },
    { ...target, branch: 'Main' },
    { ...target, repository: 'logssey/TEST-FIND-KEY', branch: 'develop', path: 'fixtures' },
    { ...target, path: 'fixtures-extra/' },
    { ...target, repository: 'Logssey/another-repo' },
    { ...target, path: 'Fixtures/' },
  ]) {
    assert.equal(api.githubTargetsError([target, other]), null)
    assert.equal(api.githubTargetsError([other, target]), null)
  }
})

test('GitHub approved references honor the encoded 500-character storage boundary', () => {
  const boundary = {
    repository: `o/${'r'.repeat(37)}`,
    branch: 'b'.repeat(200),
    path: 'x'.repeat(249)
  }
  assert.equal(api.githubTargetsError([boundary]), null)
  assert.equal(
    api.githubTargetsError([
      { ...boundary, repository: `o/${'r'.repeat(38)}` }
    ]),
    '저장소·브랜치·폴더 경로가 너무 길어요.'
  )
  const target = { repository: 'o/r', branch: 'main', path: '한'.repeat(249) }
  assert.equal(
    api.githubTargetsError([target]),
    '저장소·브랜치·폴더 경로가 너무 길어요.'
  )
  assert.equal(
    api.githubTargetsError([{ ...target, path: '설정/팀 자료/' }]),
    null
  )
  for (const character of ['!', "'", '(', ')', '~']) {
    assert.equal(
      api.githubTargetsError([
        {
          repository: 'o/r',
          branch: 'b'.repeat(200),
          path: character.repeat(100)
        }
      ]),
      '저장소·브랜치·폴더 경로가 너무 길어요.'
    )
  }
  assert.equal(
    api.githubTargetsError([{ ...target, path: '\ud800' }]),
    '브랜치·폴더 경로의 문자를 확인하세요.'
  )
})

test('scan cancellation caused by connection edits explains the actual interruption', () => {
  assert.equal(
    scanReason('SOURCE_CONFIGURATION_CHANGED'),
    '연결 설정 변경으로 중단'
  )
})

test('AWS choices use global IAM/S3 and regional metadata with legacy targets preserved', () => {
  const legacy = {
    kind: 'AWS_SSM_PARAMETER_METADATA',
    region: 'ap-northeast-2'
  }
  const options = api.awsTargetOptions(
    setup.aws.targetKinds,
    setup.aws.regions,
    [legacy]
  )
  assert.equal(options.length, 5)
  assert.deepEqual(
    options.filter((item) => item.kind === 'IAM_ACCESS_KEY_METADATA'),
    [{ kind: 'IAM_ACCESS_KEY_METADATA', region: 'global' }]
  )
  assert.ok(
    options.some(
      (item) =>
        item.kind === 'AWS_SECRETS_MANAGER_METADATA' &&
        item.region === 'ap-northeast-1'
    )
  )
  assert.ok(options.some((item) => item.region === legacy.region))
})

test('management errors never render provider error bodies or credential text', () => {
  for (const status of [400, 401, 403, 404, 409, 422, 429, 500, 503]) {
    const message = api.connectionManagementError(
      new api.ApiError(status, 'ECHO', 'PRIVATE-KEY-MUST-NOT-SHOW', {
        privateKey: 'PRIVATE-KEY-MUST-NOT-SHOW'
      })
    )
    assert.doesNotMatch(message, /PRIVATE-KEY-MUST-NOT-SHOW/)
  }
  assert.match(
    api.connectionManagementError(new api.ApiError(409, null, '')),
    /최신 설정/
  )
  assert.match(
    api.connectionManagementError(new api.ApiError(403, null, '')),
    /운영 권한/
  )
  assert.match(
    api.connectionManagementError(
      new api.ApiError(
        503,
        'SOURCE_CONNECTION_UNAVAILABLE',
        'PRIVATE-KEY-MUST-NOT-SHOW'
      )
    ),
    /서버 설정과 접근 권한/
  )
  assert.doesNotMatch(
    api.connectionManagementError(
      new api.ApiError(
        503,
        'SOURCE_CONNECTION_UNAVAILABLE',
        'PRIVATE-KEY-MUST-NOT-SHOW'
      )
    ),
    /입력값|PRIVATE-KEY/
  )
})

test('creation form uses App credentials and never requests AWS access keys', () => {
  const html = render(api.SecretConnectionManager, managerProps(null), [
    [['secret-connection-setup-options'], setup]
  ])
  assert.match(html, /연결 정보 입력 → 검사 대상 선택/)
  assert.match(html, /App ID/)
  assert.match(html, /Installation ID/)
  assert.match(html, /autoComplete="off"|autocomplete="off"/)
  assert.match(html, /spellCheck="false"|spellcheck="false"/)
  assert.doesNotMatch(html, /Secret Access Key|AWS Access Key|sk-ant-/)
  assert.doesNotMatch(html, /-----BEGIN RSA PRIVATE KEY-----/)
})

test('missing GitHub credential storage keeps the platform switch available for AWS creation', () => {
  const html = render(api.SecretConnectionManager, managerProps(null), [
    [
      ['secret-connection-setup-options'],
      { ...setup, credentialStorageConfigured: false }
    ]
  ])
  assert.match(html, /서버 설정이 필요해요/)
  assert.match(html, /<fieldset><legend>연결 정보/)
  assert.match(html, /<option value="AWS">AWS/)
  assert.match(html, /disabled=""[^>]*>연결 만들기/)
})

test('GitHub settings use live repository/branch options and retain configured root/folder targets', () => {
  const html = render(api.SecretConnectionManager, managerProps(7), [
    ...entries(github),
    [
      ['secret-github-repositories', 7, 1],
      {
        pages: [
          {
            items: [
              {
                fullName: 'Logssey/test-find-key',
                defaultBranch: 'main',
                private: true
              }
            ]
          }
        ],
        pageParams: [1]
      }
    ],
    [
      ['secret-github-branches', 7, 'Logssey/test-find-key'],
      {
        pages: [{ items: [{ name: 'main' }, { name: 'feat/secret' }] }],
        pageParams: [1]
      }
    ]
  ])
  assert.match(html, /Logssey\/test-find-key · 비공개/)
  assert.match(html, /feat\/secret/)
  assert.match(html, /value="fixtures\/"/)
  assert.match(html, /다른 브랜치 추가/)
  assert.match(html, /같은 저장소의 여러 브랜치/)
  assert.match(html, /연결 활성화/)
  assert.doesNotMatch(html, /<textarea/)
})

test('AWS settings show workload account and metadata choices without credential forms', () => {
  const html = render(
    api.SecretConnectionManager,
    managerProps(8),
    entries(aws)
  )
  assert.match(html, /123456789012/)
  assert.match(html, /서버 IAM 역할 사용/)
  for (const label of [
    'IAM 액세스 키',
    'S3 버킷',
    'Secrets Manager',
    'SSM Parameter Store'
  ])
    assert.match(html, new RegExp(label))
  assert.match(html, /도쿄 · ap-northeast-1/)
  assert.doesNotMatch(html, /인증 정보<\/button>|App 개인 키|<textarea/)
})

test('read-only settings disable writes and unconfigured GitHub asks for authentication first', () => {
  const readOnly = render(
    api.SecretConnectionManager,
    managerProps(8),
    entries({ ...aws, canManage: false })
  )
  assert.match(readOnly, /운영 권한/)
  assert.match(readOnly, /<fieldset disabled=""/)
  assert.match(readOnly, /disabled=""[^>]*>연결 활성화/)
  const missing = render(
    api.SecretConnectionManager,
    managerProps(7),
    entries({ ...github, credentialConfigured: false })
  )
  assert.match(missing, /GitHub App 인증을 등록하세요/)
  assert.doesNotMatch(missing, /<select/)
})

test('pending credential deletion leads to its recovery state without asking to paste another key', () => {
  const html = render(
    api.SecretConnectionManager,
    managerProps(7),
    entries({
      ...github,
      credentialConfigured: false,
      credentialDeletionPending: true,
      credentialRecoveryUntil: '2026-11-24T00:00:00Z',
      canRestoreCredential: true
    })
  )
  assert.match(html, /삭제 예약되어 있어요/)
  assert.match(html, /인증 상태 확인/)
  assert.doesNotMatch(html, /인증을 등록하세요|<textarea/)
})

test('Notion retains test and scan controls while GitHub/AWS receive settings', () => {
  const connection = {
    connectionId: 9,
    provider: 'NOTION',
    safeDisplayAlias: '승인 문서',
    connectionStatus: 'ACTIVE',
    approvedScopeCount: 1,
    scopeRevision: 1,
    latestProbe: null,
    lastFullScanAttempt: null,
    lastSuccessfulFullScan: null,
    nextDueAt: null,
    activeJob: null,
    capabilities: { canTest: true, canRun: true }
  }
  const html = render(api.SecretConnectionsPage, {}, [
    [['secret-connection-setup-options'], setup],
    [
      ['secret-connections-manage', 0, '', ''],
      { items: [connection], total: 1, size: 12, page: 0 }
    ]
  ])
  assert.match(html, /연결 테스트/)
  assert.match(html, /검사 요청/)
  assert.match(html, /\+ 연결 추가/)
  assert.doesNotMatch(html, />설정<\/button>/)
  const githubHtml = render(api.SecretConnectionsPage, {}, [
    [['secret-connection-setup-options'], setup],
    [
      ['secret-connections-manage', 0, '', ''],
      {
        items: [{ ...connection, provider: 'GITHUB' }],
        total: 1,
        size: 12,
        page: 0
      }
    ]
  ])
  assert.match(githubHtml, />설정<\/button>/)
})

test('disabled connection registration does not hide existing GitHub AWS or Notion controls', () => {
  const items = ['GITHUB', 'AWS', 'NOTION'].map((provider, index) => ({
    connectionId: index + 1, provider, safeDisplayAlias: `연결 ${index + 1}`,
    connectionStatus: 'PAUSED', approvedScopeCount: 1,
    capabilities: { canTest: false, canRun: false },
    scanBlockedReasonCode: 'CONNECTION_PAUSED',
  }))
  const html = render(api.SecretConnectionsPage, {}, [
    [['secret-connection-setup-options'], { ...setup, enabled: false, canCreate: false }],
    [['secret-connections-manage', 0, '', ''], { items, total: 3, size: 12, page: 0 }],
  ])
  assert.match(html, /새 연결 등록이 꺼져 있어요/)
  assert.doesNotMatch(html, /\+ 연결 추가/)
  for (const id of [1, 2, 3]) assert.match(html, new RegExp(`href="/secrets/connections/${id}/scopes"`))
  assert.equal((html.match(/>키 검증 설정<\/button>/g) ?? []).length, 3)
  assert.equal((html.match(/>설정<\/button>/g) ?? []).length, 2)
  assert.match(html, /Notion/)
})

test('API carries credentials only in write bodies and revisions on all updates', async () => {
  const originalFetch = globalThis.fetch
  const originalDocument = globalThis.document
  const requests = []
  globalThis.document = { cookie: 'XSRF-TOKEN=test-csrf' }
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init })
    return new Response(JSON.stringify(github), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  try {
    const credential = { appId: 101, installationId: 202, privateKey: pem }
    await api.createSecretConnection({
      provider: 'GITHUB',
      displayName: '개발',
      idempotencyKey: 'create-request',
      githubCredential: credential
    })
    await api.updateSecretConnection(7, {
      expectedScopeVersion: 3,
      displayName: '개발',
      status: 'PAUSED',
      githubCredential: credential
    })
    await api.updateSecretTargets(7, {
      expectedScopeVersion: 4,
      githubTargets: [
        { repository: 'Logssey/test-find-key', branch: 'feat/secret', path: '' }
      ]
    })
    await api.deleteGitHubCredential(7, 5)
    await api.restoreGitHubCredential(7, 6)
    await api.fetchGitHubBranches(7, 'Logssey/test-find-key', 2)
    assert.deepEqual(
      requests.map((request) => request.init.method),
      ['POST', 'PATCH', 'PUT', 'DELETE', 'POST', 'GET']
    )
    assert.equal(
      JSON.parse(requests[0].init.body).githubCredential.privateKey,
      pem
    )
    assert.equal(JSON.parse(requests[1].init.body).expectedScopeVersion, 3)
    assert.equal(JSON.parse(requests[2].init.body).githubTargets[0].path, '')
    assert.match(requests[3].url, /expectedScopeVersion=5/)
    assert.match(requests[4].url, /credential\/restore$/)
    assert.deepEqual(JSON.parse(requests[4].init.body), {
      expectedScopeVersion: 6
    })
    assert.match(requests[5].url, /repository=Logssey%2Ftest-find-key&page=2/)
    for (const request of requests) {
      assert.doesNotMatch(request.url, /PRIVATE|AAAA/)
      assert.equal(request.init.credentials, 'same-origin')
    }
    assert.equal(requests[0].init.headers.get('X-XSRF-TOKEN'), 'test-csrf')
  } finally {
    globalThis.fetch = originalFetch
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
  }
})

test('credential component avoids persistent and mutation caches and clears private-key drafts', async () => {
  const source = await readFile(
    resolve('src/components/SecretConnectionManager.tsx'),
    'utf8'
  )
  assert.doesNotMatch(source, /localStorage|sessionStorage|useMutation/)
  assert.match(
    source,
    /finally\s*\{\s*setDraft\(\(current\) => \(\{ \.\.\.current, privateKey: '' \}\)\)/
  )
  const html = render(api.SecretDetailPanel, {
    open: true,
    title: '설정',
    closeDisabled: true,
    onClose() {},
    children: '저장 중'
  })
  assert.match(html, /disabled=""[^>]*aria-label="위치 근거 닫기"/)
})

test('create clears the private-key input before fingerprinting and keeps it empty throughout pending or failed requests', async () => {
  const source = await readFile(
    resolve('src/components/SecretConnectionManager.tsx'),
    'utf8'
  )
  for (const fail of [false, true]) {
    let draft = { appId: '101', installationId: '202', privateKey: pem }
    let sent
    let created = false
    let message = ''
    const pending = deferred()
    const busy = []
    const submit = credentialSubmit(source, 'CreateConnectionForm', {
      disabled: false,
      name: '개발 저장소',
      validation: null,
      provider: 'GITHUB',
      draft,
      requestKey: { current: { digest: '', key: '' } },
      setBusy(value) {
        busy.push(value)
      },
      setError(value) {
        message = value
      },
      setDraft(update) {
        draft = update(draft)
      },
      githubCredential: api.githubCredential,
      async connectionCreateRequestKey(_reference, payload) {
        assert.equal(draft.privateKey, '')
        assert.equal(payload.githubCredential.privateKey, pem)
        await pending.promise
        return 'synthetic-request-id'
      },
      async createSecretConnection(payload) {
        assert.equal(draft.privateKey, '')
        sent = payload
        if (fail) throw new Error('synthetic failure')
        return github
      },
      onCreated() {
        created = true
      },
      connectionManagementError: api.connectionManagementError
    })
    const completion = submit()
    assert.equal(draft.privateKey, '')
    assert.equal(sent, undefined)
    pending.resolve()
    await completion
    assert.equal(sent.githubCredential.privateKey, pem)
    assert.equal(sent.idempotencyKey, 'synthetic-request-id')
    assert.equal(draft.privateKey, '')
    assert.equal(created, !fail)
    assert.deepEqual(busy, [true, false])
    assert.equal(Boolean(message), fail)
  }
})

test('credential replacement clears the input before save or network work starts while preserving its request payload', async () => {
  const source = await readFile(
    resolve('src/components/SecretConnectionManager.tsx'),
    'utf8'
  )
  for (const fail of [false, true]) {
    let draft = { appId: '101', installationId: '202', privateKey: pem }
    let sent
    const pending = deferred()
    const submit = credentialSubmit(source, 'SecretConnectionCredentialForm', {
      disabled: false,
      storageConfigured: true,
      error: null,
      settings: github,
      draft,
      setDraft(update) {
        draft = update(draft)
      },
      githubCredential: api.githubCredential,
      async save(operation) {
        assert.equal(draft.privateKey, '')
        try {
          await operation()
          return true
        } catch {
          return false
        }
      },
      async updateSecretConnection(connectionId, payload) {
        assert.equal(draft.privateKey, '')
        assert.equal(connectionId, github.connectionId)
        sent = payload
        await pending.promise
        if (fail) throw new Error('synthetic failure')
        return github
      }
    })
    const completion = submit()
    assert.equal(draft.privateKey, '')
    assert.equal(sent.githubCredential.privateKey, pem)
    assert.equal(sent.expectedScopeVersion, github.scopeVersion)
    assert.equal(sent.status, 'PAUSED')
    pending.resolve()
    await completion
    assert.equal(draft.privateKey, '')
  }
})

test('AWS creation uses workload identity and never asks for a private key', () => {
  const html = render(api.SecretConnectionManager, managerProps(null), [
    [['secret-connection-setup-options'], { ...setup, providers: ['AWS'] }]
  ])
  assert.match(html, /서버 IAM 역할로 인증/)
  assert.match(html, /접근 권한은 연결 테스트에서 확인/)
  assert.match(html, /123456789012/)
  assert.doesNotMatch(
    html,
    /<textarea|Installation ID|App ID|Secret Access Key/
  )
})

test('managed credential recovery shows the deletion deadline and never redraws a saved private key', () => {
  const html = render(api.SecretConnectionCredentialForm, {
    settings: {
      ...github,
      credentialConfigured: false,
      credentialDeletionPending: true,
      credentialRecoveryUntil: '2026-11-24T00:00:00Z',
      canRestoreCredential: true
    },
    storageConfigured: true,
    disabled: false,
    save: async () => true
  })
  assert.match(html, /인증 정보 삭제 예약됨/)
  assert.match(html, /복구 기한/)
  assert.match(html, /인증 복구/)
  assert.doesNotMatch(html, /<textarea|-----BEGIN/)
  const denied = render(api.SecretConnectionCredentialForm, {
    settings: {
      ...github,
      credentialConfigured: false,
      credentialDeletionPending: true,
      canRestoreCredential: true
    },
    storageConfigured: true,
    disabled: true,
    save: async () => true
  })
  assert.match(denied, /disabled=""[^>]*>인증 복구/)
})

test('legacy shared credentials use disconnect wording while managed credentials offer deletion', () => {
  const legacy = render(api.SecretConnectionCredentialForm, {
    settings: { ...github, credentialVersion: null },
    storageConfigured: true,
    disabled: false,
    save: async () => true
  })
  assert.match(legacy, />인증 해제<\/button>/)
  assert.doesNotMatch(legacy, /인증 정보 삭제<\/button>/)
  const managed = render(api.SecretConnectionCredentialForm, {
    settings: github,
    storageConfigured: true,
    disabled: false,
    save: async () => true
  })
  assert.match(managed, />인증 정보 삭제<\/button>/)
  assert.doesNotMatch(managed, /<textarea|-----BEGIN/)
})


test('saved connection readiness exposes server and scope blockers without claiming authentication success', () => {
  const html = renderToStaticMarkup(createElement(api.SecretConnectionReadiness, { settings: {
    ...github, status: 'ACTIVE', validationReadiness: {
      ready: false, reasonCodes: ['WORKER_CONFIGURATION_MISMATCH', 'SCOPES_NOT_APPROVED'],
      validators: [
        { issuer: 'GITHUB', serverEnabled: false, connectionAllowed: true, scopeCount: 6, allowedScopeCount: 6 },
        { issuer: 'AWS', serverEnabled: true, connectionAllowed: true, scopeCount: 6, allowedScopeCount: 2 },
      ],
    },
  } }))
  assert.match(html, /검사 사용 중/)
  assert.match(html, /서버 기능 꺼짐/)
  assert.match(html, /2 \/ 6개 대상에서 허용/)
  assert.match(html, /서버와 워커의 검증 기능 설정을 맞춰야/)
  assert.doesNotMatch(html, /인증 확인을 실행할 수 있어요/)
})


test('default storage policy shows approved rules and keeps read-only users from applying changes', () => {
  const html = render(api.SecretDefaultStoragePolicy, { connectionId: 7 }, [[['secret-default-storage-policy', 7], {
    selectedPolicyId: 3, selectedPolicyVersion: 2, settingsVersion: 8, canManage: false,
    applicableScopeCount: 4, ruleUpdateRequiredScopeCount: 2,
    policyOptions: [{ policyId: 3, version: 2, label: '보관 허용 · 검사 대상 4개' }],
  }]])
  assert.match(html, /보관 허용 · 검사 대상 4개/)
  assert.match(html, /규칙 보완 2개/)
  assert.match(html, /disabled=""/)
  assert.doesNotMatch(html, /모든 대상 정상|전체 안전/)
})


test('new targets show one default-policy review state while retaining pending approval semantics', () => {
  const summary = { selectedPolicyId: 9, selectedPolicyVersion: 2, status: 'PENDING_REVIEW', applicableScopeCount: 2, appliedScopeCount: 0, pendingReviewScopeCount: 2, ruleUpdateRequiredScopeCount: 1 }
  const data = { ...summary, settingsVersion: 3, policyOptions: [{ policyId: 9, version: 2 }], canManage: true }
  const html = render(api.SecretDefaultStoragePolicy, { connectionId: 7, summary }, [[['secret-default-storage-policy', 7], data]])
  assert.match(html, /<details[^>]* open=""/)
  assert.match(html, /승인 대기 2개/)
  assert.match(html, /대상별 정책 설정/)
  assert.doesNotMatch(html, /적용 완료|정상 보관/)
})
