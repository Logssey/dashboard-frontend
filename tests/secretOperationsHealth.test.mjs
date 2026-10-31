import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { build } from 'esbuild'
const output = await build({ stdin: { contents: "export * from './src/api/secretOperations'; export * from './src/components/SecretOperationsHealth'; export {ApiError} from './src/api/client';", resolveDir: resolve('.') }, bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, alias: { '@': resolve('src') } })
const modulePath = resolve('node_modules/.secret-operations-health-test.mjs'); await writeFile(modulePath, output.outputFiles[0].contents); const api = await import(pathToFileURL(modulePath).href); after(() => unlink(modulePath))
const health = { status: 'AVAILABLE', asOf: '2026-10-31T00:00:00Z', components: [{ component: 'EXECUTOR', enabled: true, status: 'STALE', liveInstances: 0, expectedInstances: 1, lastHeartbeatAt: '2026-10-30T23:00:00Z', lastSuccessAt: null, activeJobs: 0 }, { component: 'ASSESSMENT', enabled: false, status: 'DISABLED', liveInstances: 0, expectedInstances: 0, lastHeartbeatAt: null, lastSuccessAt: null, activeJobs: 0 }], queue: { status: 'AVAILABLE', ready: 2, delayed: 1, leased: 0, expiredLeases: 1, oldestReadySeconds: 7210, failed24h: 1, partial24h: 2 }, alerts: { open: 2, total: 3, recovered: 1 }, maintenance: { ledgerPurgeEnabled: false, snapshotCleanupEnabled: true, lastSnapshotCleanupAt: null }, reasonCode: null }
function render(value, error) { const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); if (value) client.setQueryData(['secret-operations-health'], value); if (error) { const query = client.getQueryCache().build(client, { queryKey: ['secret-operations-health'] }); query.setState({ status: 'error', error, fetchStatus: 'idle' }) } const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, createElement(api.SecretOperationsHealth)))); client.clear(); return html }
test('component liveness, disabled settings and last successful processing stay distinct', () => {
  const html = render(health)
  assert.match(html, /수집·재검사/); assert.match(html, /응답 지연/); assert.match(html, /중지됨/); assert.match(html, /최근 작업 확인 성공/)
  assert.match(html, /2시간 0분/); assert.match(html, /30초마다 갱신/)
  assert.doesNotMatch(html, /전체 검사 성공|모두 정상|실패 0/)
})
test('unavailable operational database data and denied scope never become healthy zero counts', () => {
  const unavailable = render({ ...health, status: 'UNAVAILABLE', components: [], queue: { status: 'UNAVAILABLE' }, reasonCode: 'DATABASE_UNAVAILABLE' })
  assert.match(unavailable, /운영 상태를 확인하지 못했어요/); assert.doesNotMatch(unavailable, /0건|정상 응답/)
  const denied = render(null, new api.ApiError(403, null, 'secret-sentinel'))
  assert.match(denied, /공통 보안·운영 담당자만 조회/); assert.doesNotMatch(denied, /secret-sentinel|0건/)
})
test('only registered connection targets become links and no raw reason body is reflected', () => {
  assert.equal(api.operationAlertTarget({ subjectType: 'CONNECTION', subjectId: '12' }), '/secrets/connections/12/scopes')
  assert.equal(api.operationAlertTarget({ subjectType: 'CONNECTION', subjectId: 'https://external' }), null)
  assert.equal(api.operationAlertTarget({ subjectType: 'GLOBAL', subjectId: '12' }), null)
  assert.equal(api.operationCount(-1), '—'); assert.equal(api.operationCount(null), '—'); assert.equal(api.operationWaitTime(undefined), '확인 불가')
})
test('operations status and alert API reads remain read-only with explicit pagination and state', async () => {
  const original = globalThis.fetch, calls = []; globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }) }
  try { await api.fetchSecretOperationsHealth(); await api.fetchSecretOperationAlerts(2, 'RECOVERED'); assert.equal(calls[0].url, '/api/v1/secrets/operations/health'); assert.equal(calls[1].url, '/api/v1/secrets/operations/alerts?page=2&size=20&state=RECOVERED'); assert.ok(calls.every((call) => call.init.method === 'GET' && call.init.body === undefined)) } finally { globalThis.fetch = original }
})
