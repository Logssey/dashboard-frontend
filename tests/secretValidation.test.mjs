import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { build } from 'esbuild'

const bundle = await build({ stdin: { contents: "export * from './src/api/secretValidation'; export * from './src/lib/secretValidation'; export * from './src/components/SecretValidation'; export * from './src/components/SecretValidationPolicy';", resolveDir: resolve('.') }, bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, alias: { '@': resolve('src') } })
const path = resolve('node_modules/.secret-validation-test.mjs'); await writeFile(path, bundle.outputFiles[0].contents)
const api = await import(pathToFileURL(path).href); after(() => unlink(path))
const data = { support: { status: 'SUPPORTED' }, latestAttempt: null, lastAuthenticatedAt: null, lastConclusiveValidation: null, latestRequest: null, freshness: { status: 'UNAVAILABLE' }, nextDueAt: null, postActionValidationPending: false, capabilities: { canRequestValidation: false, blockedReasonCodes: [] }, contextVersion: 'safe-context', readAt: '2026-10-22T00:00:00Z' }
const location = { occurrenceId: 8, safeLocationLabel: '운영 구성 파일', sourceDetails: { status: 'AVAILABLE', repository: 'safe/project', path: 'config.ts', branch: 'main', line: '4', label: '승인 위치' }, capabilities: {} }
function render(Component, props, entries, url = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } }); for (const [key, value] of entries) client.setQueryData(key, value)
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: [url] }, createElement(Component, props)))); client.clear(); return html
}
test('unsupported, disabled, synthetic and incomplete are distinct from an authentication failure', () => {
  const cases = [['UNSUPPORTED_TYPE', '검증 미지원'], ['DISABLED', '검증 꺼짐'], ['SYNTHETIC_FIXTURE', '검증 생략'], ['MISSING_SESSION_TOKEN', '구성 부족']]
  for (const [reason, expected] of cases) {
    const value = { ...data, capabilities: { canRequestValidation: false, blockedReasonCodes: [reason] } }
    const html = render(api.SecretValidationCard, { secretId: 12, locations: [location] }, [[['secret-validation', 12, 8], value]])
    assert.match(html, new RegExp(expected)); assert.match(html, /실제 확인 시각<\/dt><dd>—/); assert.doesNotMatch(html, /검증 시도 기록 없음|무효|원문 보기/)
  }
})
test('latest unknown and previous authentication time do not become a current valid result', () => {
  const value = { ...data, latestAttempt: { attemptId: 2, result: 'UNKNOWN', reasonCode: 'PROVIDER_UNAVAILABLE', providerCheckedAt: null, completedAt: '2026-10-22T02:00:00Z' }, lastAuthenticatedAt: '2026-10-21T01:00:00Z', lastConclusiveValidation: { attemptId: 1, result: 'VALID', providerCheckedAt: '2026-10-21T01:00:00Z' } }
  const html = render(api.SecretValidationCard, { secretId: 12, locations: [location] }, [[['secret-validation', 12, 8], value]])
  assert.match(html, /<h3>확인 불가<\/h3>/); assert.match(html, /실제 확인 시각<\/dt><dd>—/); assert.match(html, /최근 시도 시각/); assert.match(html, /마지막 인증 성공/); assert.match(html, /이전 확정 결과/)
})
test('pending requests and stale validation are not fresh authentication successes', () => {
  assert.equal(api.validationPresentation({ ...data, latestRequest: { requestId: 4, status: 'PENDING' } }).title, '확인 대기')
  assert.equal(api.validationPresentation({ ...data, freshness: { status: 'STALE' } }).title, '다시 확인 필요')
  assert.equal(api.validationPresentation({ ...data, postActionValidationPending: true }).title, '조치 후 미검증')
  const html = render(api.SecretValidationPolicy, { scopeId: 5 }, [[['secret-validation-policy', 5], { enabled: true, expectedValidationApprovalRevision: 2, profileStatus: 'DISABLED', canConfigure: false }]])
  assert.match(html, /범위를 허용해도 공급자를 호출하지 않아요/); assert.doesNotMatch(html, /<button[^>]*>이 범위 검증/)
})
test('validation API uses selected location, opaque context, CSRF and independent policy revision', async () => {
  const originalFetch = globalThis.fetch, originalDocument = globalThis.document, calls = []
  globalThis.document = { cookie: 'XSRF-TOKEN=csrf-test' }; globalThis.fetch = async (url, init) => { calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null }); return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }) }
  try {
    await api.requestSecretValidation(12, { occurrenceId: 8, expectedContextVersion: 'opaque', idempotencyKey: 'same-command' })
    await api.fetchValidationRequest(4); await api.fetchValidationHistory(12, 8, 2)
    await api.updateValidationPolicy(5, { expectedValidationApprovalRevision: 2, enabled: false, reasonCode: 'VALIDATION_DISABLED', idempotencyKey: 'policy-command' })
    assert.equal(calls[0].url, '/api/v1/secrets/12/validation-requests'); assert.equal(calls[0].init.headers.get('X-XSRF-TOKEN'), 'csrf-test'); assert.deepEqual(calls[0].body, { occurrenceId: 8, expectedContextVersion: 'opaque', idempotencyKey: 'same-command' })
    assert.equal(calls[1].url, '/api/v1/secrets/validation-requests/4'); assert.match(calls[2].url, /occurrenceId=8/); assert.match(calls[2].url, /page=2/); assert.equal(calls[3].body.expectedValidationApprovalRevision, 2)
    for (const call of calls) assert.doesNotMatch(JSON.stringify(call.body), /rawSecret|endpoint|authRef/)
  } finally { globalThis.fetch = originalFetch; globalThis.document = originalDocument }
})
