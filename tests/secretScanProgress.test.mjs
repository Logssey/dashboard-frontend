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
function render(data, expectedConnectionId) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (data) client.setQueryData(['secret-run-progress', 91, expectedConnectionId ?? null], data)
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null,
    createElement(modules.component.SecretScanProgress, { runId: 91, expectedConnectionId }))))
}

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
