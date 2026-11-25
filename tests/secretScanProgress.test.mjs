import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { writeFile, unlink, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const modules = {}, paths = []
for (const [key, entry] of Object.entries({ lib: 'src/lib/secretScanProgress.ts', component: 'src/components/SecretScanProgress.tsx', api: 'src/api/secretScanProgress.ts' })) {
  const result = await build({ entryPoints: [resolve(entry)], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', alias: { '@': resolve('src') }, loader: { '.css': 'empty' } })
  const path = resolve(`node_modules/.scan-progress-${key}-test.mjs`)
  paths.push(path)
  await writeFile(path, result.outputFiles[0].contents)
  modules[key] = await import(pathToFileURL(path).href)
}
after(() => Promise.all(paths.map((path) => unlink(path))))
const event = (id, operationCode = 'GITHUB_TREE_GET') => ({ id, attemptNo: 1, stage: 'COLLECTION', operationCode, outcome: 'COMPLETED', httpStatus: 200, reasonCode: null, processedCount: null, totalCount: null, durationMs: 53, observedAt: '2026-11-11T01:02:03Z' })
const stage = (key, status) => ({ key, status, startedAt: null, finishedAt: null, reasonCode: null, processedCount: null, totalCount: null, unit: null })
const value = {
  runId: 91, connectionId: 3, provider: 'GITHUB', status: 'RUNNING', attemptNo: 1, maxAttempts: 3,
  requestedAt: '2026-11-11T01:00:00Z', startedAt: '2026-11-11T01:00:30Z', finishedAt: null, availableAt: null,
  scopeCount: 1, finishedScopeCount: 0, collectedObjectCount: null, findingCount: null,
  capturedAt: '2026-11-11T01:02:00Z', latestActivityAt: '2026-11-11T01:02:00Z', pollAfterMs: 2500,
  eventsStatus: 'AVAILABLE', historyComplete: true, truncated: false, suppressedEventCount: 0,
  stages: [stage('QUEUE', 'SUCCEEDED'), stage('COLLECTION', 'RUNNING'), stage('DETECTION', 'RUNNING'), stage('VALIDATION', 'PENDING'), stage('RESULT', 'PENDING')],
  events: [event(1)], nextAfterEventId: 1, hasMore: false,
}
const validationSummary = {
  reuseRecorded: true, newRequestCount: 0, completedRequestCount: 0,
  reusedResultCount: 7, uncheckedCount: 2, incompleteCount: 2, unknownCount: 0, reusedResultsTruncated: false,
  reusedResults: [
    { issuer: 'GITHUB', result: 'INVALID', reasonCode: 'AUTHENTICATION_REJECTED', providerCheckedAt: '2026-11-11T17:10:20Z', sourceRunId: 85, count: 2 },
    { issuer: 'AWS', result: 'INVALID', reasonCode: 'INVALID_ACCESS_KEY', providerCheckedAt: '2026-11-11T17:10:30Z', sourceRunId: 85, count: 3 },
    { issuer: 'NOTION', result: 'INVALID', reasonCode: 'AUTHENTICATION_REJECTED', providerCheckedAt: '2026-11-11T17:10:32Z', sourceRunId: 85, count: 2 },
  ],
}
const incompleteRun = {
  ...value, status: 'PARTIAL', finishedAt: '2026-11-11T17:13:53Z', validationSummary,
  stages: [stage('QUEUE', 'SUCCEEDED'), stage('COLLECTION', 'SUCCEEDED'), stage('DETECTION', 'SUCCEEDED'),
    { ...stage('VALIDATION', 'PARTIAL'), reasonCode: 'VALIDATION_INCONCLUSIVE' },
    { ...stage('RESULT', 'PARTIAL'), reasonCode: 'VALIDATION_INCONCLUSIVE' }],
  events: [], capabilities: { canViewFindings: true },
}
function render(data, expectedConnectionId) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (data) client.setQueryData(['secret-run-progress', 91, expectedConnectionId ?? null], data)
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null,
    createElement(modules.component.SecretScanProgress, { runId: 91, expectedConnectionId }))))
}

test('metadata inventory is distinguished from secret detection and hides irrelevant validation zeros', () => {
  const data = { ...value, provider: 'AWS', status: 'SUCCEEDED', validationSummary,
    stages: [stage('QUEUE', 'SUCCEEDED'), stage('COLLECTION', 'SUCCEEDED'),
      { ...stage('DETECTION', 'SKIPPED'), reasonCode: 'NOT_APPLICABLE_METADATA' },
      { ...stage('VALIDATION', 'SKIPPED'), reasonCode: 'NOT_APPLICABLE_METADATA' }, stage('RESULT', 'SUCCEEDED')] }
  const html = render(data)
  assert.match(html, /목록 조회 완료/)
  assert.match(html, /S3 파일, Secrets Manager 값, Parameter Store 값은 읽지 않았어요/)
  assert.match(html, /\/secrets\/connections\/3\/scopes/)
  assert.doesNotMatch(html, /인증 확인 결과 요약|구성 부족/)
  assert.equal(modules.lib.scanIsMetadataOnly({ ...data, stages: [stage('DETECTION', 'SUCCEEDED'), data.stages[3]] }), false)
  assert.notEqual(modules.lib.scanProgressStatusLabel({ ...data, status: 'FAILED' }), '목록 조회 완료')
})

test('disabled validation keeps its skip reason and matching settings without the key summary', () => {
  const data = { ...value, status: 'SUCCEEDED', validationSummary: { ...validationSummary, uncheckedCount: 4,
    incompleteCount: 0, reusedResultCount: 0, reusedResults: [], uncheckedReasons: [{ reasonCode: 'VALIDATOR_NOT_ALLOWED', count: 4 }] },
    stages: [stage('DETECTION', 'SUCCEEDED'), { ...stage('VALIDATION', 'SKIPPED'), reasonCode: 'VALIDATOR_NOT_ALLOWED' }, stage('RESULT', 'SUCCEEDED')] }
  const html = render(data)
  assert.match(html, /처리 완료/)
  assert.doesNotMatch(html, /인증 미확인 사유/)
  assert.match(html, /validationConnectionId=3/)
  assert.match(html, /키 발급 서비스의 검증을 허용하지 않았어요/)
  assert.match(html, /stage-skipped/)
  const aggregate = { ...event(2, 'STAGE_SUMMARY'), stage: 'VALIDATION', outcome: 'SKIPPED', reasonCode: 'NO_CANDIDATES' }
  assert.match(modules.lib.scanProgressEventReason(aggregate, data), /허용하지 않았어요/)
  assert.equal(modules.lib.scanProgressEventReason({ ...aggregate, attemptNo: 0 }, data), '인증 확인 대상 없음')
  assert.equal(modules.lib.scanNeedsValidationSetup({ ...data, validationSummary: { ...validationSummary, uncheckedReasons: [] }, stages: [{ ...stage('VALIDATION', 'SKIPPED'), reasonCode: 'SYNTHETIC_FIXTURE' }] }), false)
})

test('five real phases allow concurrent collection and detection and show actual response metadata', () => {
  const html = render(value, 3)
  assert.equal((html.match(/aria-controls="scan-terminal-91"/g) ?? []).length, 5)
  assert.equal((html.match(/class="stage-running"/g) ?? []).length, 2)
  assert.match(html, /GitHub API · 파일 목록 조회/)
  assert.match(html, /HTTP 200 · 처리 완료 · 53ms/)
  assert.match(html, /요청 형식/)
  assert.match(html, /GET \/repos\/\{owner\}\/\{repo\}\/git\/trees\/\{sha\}/)
  assert.doesNotMatch(html, /100%|시험 출처|작업 완료 0/)
})

test('unknown quantities stay absent and a legacy run explains missing detailed events', () => {
  assert.equal(modules.lib.scanStageCount(stage('COLLECTION', 'RUNNING')), null)
  assert.equal(modules.lib.scanStageCount({ ...stage('COLLECTION', 'RUNNING'), processedCount: -1 }), null)
  const html = render({ ...value, eventsStatus: 'NOT_RECORDED', events: [] })
  assert.match(html, /상세 내역이 기록되지 않았어요/)
  assert.doesNotMatch(html, /HTTP 200|항목 0개 처리/)
})

test('metadata scans describe resource lookup and distinguish excluded value checks', () => {
  const html = render({ ...value, provider: 'AWS', scanKind: 'METADATA',
    stages: [stage('QUEUE', 'SUCCEEDED'), stage('COLLECTION', 'RUNNING'),
      stage('DETECTION', 'SKIPPED'), stage('VALIDATION', 'SKIPPED'), stage('RESULT', 'PENDING')],
  })
  assert.match(html, /AWS 메타데이터 조회/)
  assert.match(html, /리소스 정보 조회/)
  assert.match(html, /키 값 탐지 · 적용 제외/)
  assert.match(html, /인증 확인 · 적용 제외/)
})

test('truncated detail logs still expose current counters and the last worker activity', () => {
  const html = render({ ...value, truncated: true, suppressedEventCount: 14, collectedObjectCount: 2089 })
  assert.match(html, /현재 처리량<\/dt><dd>2089개/)
  assert.match(html, /대기 시간<\/dt><dd>30초/)
  assert.match(html, /최근 활동/)
  assert.match(html, /위의 현재 처리량과 최근 활동에서 진행 상태/)
})

test('expiry, omitted details, skip reasons and final navigation are independently rendered', () => {
  const skipped = { ...stage('VALIDATION', 'SKIPPED'), reasonCode: 'SYNTHETIC_FIXTURE', processedCount: 0, totalCount: 0, unit: 'ATTEMPT' }
  const data = { ...value, status: 'PARTIAL', eventsStatus: 'EXPIRED', events: [], truncated: true, suppressedEventCount: 9,
    finishedAt: '2026-11-11T01:03:00Z', stages: [stage('QUEUE', 'SUCCEEDED'), stage('COLLECTION', 'SUCCEEDED'), stage('DETECTION', 'SUCCEEDED'), skipped, stage('RESULT', 'PARTIAL')], capabilities: { canViewFindings: true } }
  const html = render(data)
  assert.match(html, /보존 기간이 지났어요/)
  assert.match(html, /외부 인증 확인 제외/)
  assert.doesNotMatch(html, /<span>0 \/ 0/)
  assert.match(html, /일부 상세 생략 9개/)
  assert.match(html, /\/secrets\/history\/91\/findings/)
  assert.match(html, /\/secrets\/history\/91#coverage-title/)
})

test('a mismatched connection never displays another selected connection run', () => {
  const html = render(value, 8)
  assert.match(html, /선택한 연결과 실행이 달라요/)
  assert.doesNotMatch(html, /GitHub 검사|HTTP 200/)
})

test('cursor event merge is ordered, idempotent and does not collapse separate attempts', () => {
  const result = modules.lib.mergeScanEvents([event(2), event(1)], [event(2), { ...event(3), attemptNo: 2 }])
  assert.deepEqual(result.map((item) => item.id), [1, 2, 3])
  assert.equal(result[2].attemptNo, 2)
  assert.equal(modules.lib.scanOperationLabel('UNREGISTERED_SENSITIVE_VALUE'), '검사 처리')
  assert.equal(modules.lib.scanRequestFormat('UNREGISTERED_SENSITIVE_VALUE'), null)
  assert.equal(modules.lib.scanRequestFormat('GITHUB_CREDENTIAL_CHECK'), 'GET /user')
})

test('incomplete AWS credentials retain their exact validation reasons in the execution log', () => {
  assert.equal(modules.lib.scanProgressReason('INCOMPLETE_PAIR'), 'AWS 키 ID와 Secret Access Key를 한 쌍으로 확인하지 못했어요.')
  assert.equal(modules.lib.scanProgressReason('MISSING_SESSION_TOKEN'), '임시 AWS 키에 필요한 세션 토큰이 없어요.')
  const data = { ...value,
    stages: [stage('QUEUE', 'SUCCEEDED'), stage('COLLECTION', 'SUCCEEDED'), stage('DETECTION', 'SUCCEEDED'), stage('VALIDATION', 'RUNNING'), stage('RESULT', 'PENDING')],
    events: [
      { ...event(1, 'AWS_CREDENTIAL_CHECK'), stage: 'VALIDATION', outcome: 'SKIPPED', httpStatus: null, reasonCode: 'INCOMPLETE_PAIR' },
      { ...event(2, 'AWS_CREDENTIAL_CHECK'), stage: 'VALIDATION', outcome: 'SKIPPED', httpStatus: null, reasonCode: 'MISSING_SESSION_TOKEN' },
    ],
  }
  const html = render(data)
  assert.match(html, /AWS 키 ID와 Secret Access Key를 한 쌍으로 확인하지 못했어요/)
  assert.match(html, /임시 AWS 키에 필요한 세션 토큰이 없어요/)
  assert.doesNotMatch(html, /최근 검사 일부 누락|검사 근거 확인 필요|HTTP 200/)
})

test('inconclusive key validity does not turn completed processing stages into warnings', () => {
  const html = render(incompleteRun)
  assert.equal((html.match(/class="stage-succeeded"/g) ?? []).length, 5)
  assert.match(html, /secret-run-badge succeeded">처리 완료/)
  assert.doesNotMatch(html, /stage-partial|인증 미확인|인증을 확인하지 못한 키|인증 확인 결과|구성 부족|실패 대상 확인/)
  assert.match(html, /href="\/secrets\/history\/91\/findings"[^>]*>발견 결과 보기/)
  assert.match(html, /href="\/secrets\/history\/91"[^>]*>실행 이력/)
  assert.equal(incompleteRun.status, 'PARTIAL')
  assert.equal(incompleteRun.validationSummary.uncheckedCount, 2)
  assert.equal(incompleteRun.validationSummary.reusedResultCount, 7)
})

test('real collection, validation and result failures remain visible', () => {
  for (const [key, reasonCode] of [['COLLECTION', 'NETWORK_ERROR'], ['VALIDATION', 'VALIDATION_ATTEMPT_FAILED'], ['RESULT', 'RESULT_COMMIT_FAILED']]) {
    const data = { ...incompleteRun, stages: incompleteRun.stages.map((item) => item.key === key ? { ...item, status: 'PARTIAL', reasonCode } : item) }
    const html = render(data)
    assert.match(html, /stage-partial/)
    assert.match(html, /secret-run-badge partial">일부 실패/)
    assert.match(html, /실패 대상 확인/)
    assert.equal(modules.lib.scanValidationOnlyIssue(data), false)
  }
  for (const [status, label] of [['FAILED', '실패'], ['CANCELLED', '취소']]) {
    assert.equal(modules.lib.scanProgressStatusLabel({ ...incompleteRun, status }), label)
    assert.match(render({ ...incompleteRun, status }), new RegExp(`secret-run-badge ${status.toLowerCase()}">${label}`))
  }
  assert.equal(modules.lib.scanProgressStatusLabel({ ...incompleteRun, status: 'SUCCEEDED' }), '처리 완료')
})

test('completed validation summaries keep per-key reasons while actual partial and failed operations stay factual', () => {
  const summary = { ...event(1, 'STAGE_SUMMARY'), stage: 'VALIDATION', outcome: 'PARTIAL', httpStatus: null, reasonCode: 'VALIDATION_INCONCLUSIVE' }
  assert.equal(modules.lib.scanProgressEventOutcome(summary, incompleteRun), '처리 완료')
  const html = render({ ...incompleteRun, events: [{ ...summary, stage: 'RESULT' }] })
  assert.match(html, /class="event-completed"/)
  assert.doesNotMatch(html, /인증을 확인하지 못한 키|event-partial/)
  assert.equal(modules.lib.scanProgressReason(summary.reasonCode), '인증을 확인하지 못한 키가 있어요. 키별 사유를 확인하세요.')
  assert.equal(modules.lib.scanProgressEventOutcome({ ...summary, stage: 'RESULT' }, incompleteRun), '처리 완료')
  assert.equal(modules.lib.scanProgressEventOutcome({ ...summary, operationCode: 'GITHUB_CREDENTIAL_CHECK' }, incompleteRun), '일부 처리')
  assert.equal(modules.lib.scanProgressEventOutcome({ ...summary, stage: 'COLLECTION' }, incompleteRun), '일부 처리')
  assert.equal(modules.lib.scanProgressEventOutcome({ ...summary, outcome: 'FAILED', reasonCode: 'NETWORK_ERROR' }, incompleteRun), '실패')
  assert.equal(modules.lib.scanProgressEventOutcome(summary, { ...incompleteRun, status: 'FAILED' }), '일부 처리')
  assert.equal(modules.lib.scanProgressEventOutcome(summary, { ...incompleteRun, stages: incompleteRun.stages.map((item) => item.key === 'COLLECTION' ? { ...item, status: 'PARTIAL' } : item) }), '일부 처리')
})

test('reuse operations never claim a new HTTP request format', () => {
  assert.equal(modules.lib.scanOperationLabel('CREDENTIAL_RESULT_REUSED'), '이전 인증 결과 재사용')
  assert.equal(modules.lib.scanRequestFormat('CREDENTIAL_RESULT_REUSED'), null)
  const data = { ...value, validationSummary,
    stages: [stage('QUEUE', 'SUCCEEDED'), stage('COLLECTION', 'SUCCEEDED'), stage('DETECTION', 'SUCCEEDED'), stage('VALIDATION', 'RUNNING'), stage('RESULT', 'PENDING')],
    events: [{ ...event(1, 'CREDENTIAL_RESULT_REUSED'), stage: 'VALIDATION', httpStatus: null, durationMs: null, reasonCode: 'AUTHENTICATION_REJECTED' }],
  }
  const html = render(data)
  assert.match(html, /이전 인증 결과 재사용/)
  assert.doesNotMatch(html, /요청 형식|GET \/user|HTTP 401/)
})

test('progress API passes the cursor and abort signal without registering an execution', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }) }
  try {
    const controller = new AbortController()
    await modules.api.fetchSecretScanProgress(91, 25, controller.signal)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, '/api/v1/secrets/runs/91/progress?afterEventId=25&size=100')
    assert.equal(calls[0].init.method, 'GET')
    assert.equal(calls[0].init.signal, controller.signal)
  } finally { globalThis.fetch = originalFetch }
})

test('terminal states end polling and motion has a reduced-motion equivalent', async () => {
  for (const status of ['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED', 'SKIPPED']) assert.equal(modules.lib.scanProgressTerminal(status), true)
  for (const status of ['PENDING', 'RUNNING']) assert.equal(modules.lib.scanProgressTerminal(status), false)
  const css = await readFile(resolve('src/components/secret-scan-progress.css'), 'utf8')
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(css, /animation: none/)
  assert.match(css, /\.secret-scan-execution-panel\.stale.*animation-play-state: paused/)
})
