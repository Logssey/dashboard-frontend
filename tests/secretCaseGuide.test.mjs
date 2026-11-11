import assert from 'node:assert/strict'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, test } from 'node:test'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const bundled = await build({
  stdin: { contents: "export * from './src/api/secretCaseGuide'; export * from './src/lib/secretCaseGuide'; export * from './src/components/SecretCaseGuide';", resolveDir: resolve('.') },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic', packages: 'external', alias: { '@': resolve('src') },
})
const bundlePath = resolve('node_modules/.secret-case-guide-test.mjs')
await writeFile(bundlePath, bundled.outputFiles[0].contents)
const api = await import(pathToFileURL(bundlePath).href)
const { requestSecretCaseGuide, fetchSecretCaseGuide } = api
after(() => unlink(bundlePath))

test('guide request sends no secret or case evidence in its body', async () => {
  const originalFetch = globalThis.fetch
  const originalDocument = globalThis.document
  const calls = []
  globalThis.document = { cookie: 'XSRF-TOKEN=test-csrf' }
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options })
    return new Response(JSON.stringify({
      version: 'secret-response-guide-v1', source: 'DEFAULT', title: '대응 가이드',
      steps: [], notice: '근거를 확인하세요.',
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const guide = await requestSecretCaseGuide(7)
    assert.equal(guide.source, 'DEFAULT')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].path, '/api/v1/secrets/cases/7/guide')
    assert.equal(calls[0].options.method, 'POST')
    assert.equal(calls[0].options.body, undefined)
    assert.equal(calls[0].options.credentials, 'same-origin')
    assert.equal(calls[0].options.headers.get('X-XSRF-TOKEN'), 'test-csrf')
  } finally {
    globalThis.fetch = originalFetch
    globalThis.document = originalDocument
  }
})

test('default guide and readiness read never request external AI or send a body', async () => {
  const originalFetch = globalThis.fetch, calls = []
  globalThis.fetch = async (path, options) => { calls.push({ path, options }); return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }) }
  try {
    await fetchSecretCaseGuide(7)
    assert.equal(calls.length, 1); assert.equal(calls[0].path, '/api/v1/secrets/cases/7/guide')
    assert.equal(calls[0].options.method ?? 'GET', 'GET'); assert.equal(calls[0].options.body, undefined)
  } finally { globalThis.fetch = originalFetch }
})

const detail = { caseId: 7, version: 2, issuer: 'AWS' }
const readiness = { status: 'UNAVAILABLE', reasonCode: 'KEY_MISSING', aiAvailable: false, aiRequested: false, providerCalled: false, cached: false }
const defaultGuide = { ...api.immediateSecretCaseGuide(detail), readiness }
function renderGuide(guide) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } })
  if (guide) client.setQueryData(['secret-case-guide', detail.caseId, detail.version], guide)
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(api.SecretCaseGuide, { detail })))
  client.clear(); return html
}
test('provider procedures are visible before readiness loads and missing AI keys disable only optional AI', () => {
  const immediate = renderGuide()
  assert.match(immediate, /AWS 대응 절차|AWS IAM|CloudTrail/); assert.match(immediate, /기본 가이드/)
  assert.match(immediate, /disabled="">AI 보조 가이드 요청/)
  const missing = renderGuide(defaultGuide)
  assert.match(missing, /AI 제공자 키가 설정되지 않았어요/); assert.match(missing, /AI 제공자 호출 안 함/)
  assert.match(missing, /disabled="">AI 보조 가이드 요청/); assert.match(missing, /발견 위치에서 노출 제거/)
  assert.equal(api.canRequestGuideAi(defaultGuide), false)
  assert.equal(api.canRequestGuideAi({ ...defaultGuide, readiness: { ...readiness, status: 'READY', reasonCode: 'READY', aiAvailable: true } }), true)
  const github = api.immediateSecretCaseGuide({ issuer: 'GITHUB' })
  assert.match(JSON.stringify(github), /GitHub 설정|토큰 종류|감사·보안 기록/)
})
test('configuration failures, test eligibility and provider failures have distinct honest fallback messages', () => {
  for (const [code, expected] of [['DISABLED', /기능이 꺼져/], ['KEY_MISSING', /키가 설정되지/], ['KEY_INVALID', /키 설정을 사용할 수 없어요/], ['SYNTHETIC_FIXTURE_REQUIRED', /합성 키 여부는 정확한 비교 근거로 판단해요/], ['TEST_ONLY', /실제 키의 대응에는 기본 가이드/], ['ALL_LOCATIONS_ACCESS_REQUIRED', /모든 위치를 열람/], ['PROVIDER_TIMEOUT', /응답 시간이 초과/], ['PROVIDER_REJECTED', /요청을 거절/], ['PROVIDER_UNAVAILABLE', /연결하지 못하여/]]) {
    const guide = { ...defaultGuide, readiness: { ...readiness, reasonCode: code, status: code.startsWith('PROVIDER_') ? 'FALLBACK' : 'UNAVAILABLE', aiRequested: code.startsWith('PROVIDER_'), providerCalled: code.startsWith('PROVIDER_') } }
    const html = renderGuide(guide)
    assert.match(html, expected); assert.match(html, /기본 가이드/); assert.match(html, /AWS IAM/)
    assert.doesNotMatch(html, /AI 보조 가이드를 받았어요|AI 보조 가이드<\/span>/)
  }
  const unknown = { ...defaultGuide, readiness: { ...readiness, reasonCode: 'secret-sentinel', aiAvailable: true } }
  assert.equal(api.canRequestGuideAi(unknown), false); assert.doesNotMatch(api.guideReadinessMessage(unknown), /secret-sentinel/)
  for (const reasonCode of ['REQUEST_IN_PROGRESS', 'CALL_BUDGET_EXHAUSTED']) assert.equal(api.canRequestGuideAi({ ...defaultGuide, readiness: { ...readiness, status: 'FALLBACK', reasonCode, aiAvailable: true } }), false)
})
test('AI cache metadata identifies prior generation without claiming a new provider call', () => {
  const guide = { ...defaultGuide, source: 'GROQ', readiness: { status: 'GENERATED', reasonCode: 'CACHE_HIT', aiAvailable: true, aiRequested: true, providerCalled: false, cached: true } }
  const html = renderGuide(guide)
  assert.match(html, /AI 보조 가이드<\/span>/); assert.match(html, /저장된 AI 결과 사용/); assert.match(html, /제공자를 다시 호출하지 않았어요/)
  assert.doesNotMatch(html, /AI 제공자 호출함/)
  const failed = renderGuide({ ...defaultGuide, readiness: { status: 'FALLBACK', reasonCode: 'PROVIDER_TIMEOUT', aiAvailable: true, aiRequested: true, providerCalled: false, cached: true } })
  assert.match(failed, /기본 가이드/); assert.match(failed, /이전 요청 상태 사용 · AI 제공자 호출 안 함/)
  assert.doesNotMatch(failed, /저장된 AI 결과 사용|AI 보조 가이드<\/span>/)
})
