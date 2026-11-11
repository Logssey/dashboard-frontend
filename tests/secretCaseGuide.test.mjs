import assert from 'node:assert/strict'
import { writeFile, unlink, readFile } from 'node:fs/promises'
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
  assert.match(immediate, /가이드 사용 조건을 확인하는 중이에요/)
  assert.match(immediate, /가이드 상태 새로고침/)
  assert.doesNotMatch(immediate, /연결 상태 확인|AI 연결 상태를 확인/)
  assert.match(immediate, /disabled="">AI로 가이드 생성/)
  const missing = renderGuide(defaultGuide)
  assert.match(missing, /AI 제공자 키가 설정되지 않았어요/); assert.match(missing, /기본 가이드 조회/)
  assert.match(missing, /disabled="">AI로 가이드 생성/); assert.match(missing, /발견 위치에서 노출 제거/)
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
  assert.match(html, /Groq 가이드<\/span>/); assert.match(html, /이전에 생성한 Groq 결과 재사용/); assert.match(html, /제공자를 다시 호출하지 않았어요/)
  assert.doesNotMatch(html, /AI 제공자 호출함/)
  const failed = renderGuide({ ...defaultGuide, readiness: { status: 'FALLBACK', reasonCode: 'PROVIDER_TIMEOUT', aiAvailable: true, aiRequested: true, providerCalled: false, cached: true } })
  assert.match(failed, /기본 가이드/); assert.match(failed, /이전 요청 상태 확인 · 기본 가이드 사용/)
  assert.doesNotMatch(failed, /저장된 AI 결과 사용|AI 보조 가이드<\/span>/)
})

test('Claude readiness identifies the configured provider and keeps generation an explicit action', () => {
  const configured = { ...defaultGuide, readiness: { ...readiness, provider: 'CLAUDE', model: 'claude-sonnet-5-5', generatedAt: null } }
  const missing = renderGuide(configured)
  assert.match(missing, /Claude 대응 가이드/)
  assert.match(missing, /Claude API 키가 설정되지 않았어요/)
  assert.match(missing, /disabled="">Claude로 가이드 생성/)
  assert.match(missing, /Claude Sonnet 5\.5/)
  assert.match(missing, /기본 가이드<\/span>/)
  assert.doesNotMatch(missing, /Claude 가이드<\/span>/)
  const ready = { ...configured, readiness: { ...configured.readiness, status: 'READY', reasonCode: 'READY', aiAvailable: true } }
  assert.equal(api.canRequestGuideAi(ready), true)
  assert.match(renderGuide(ready), />Claude로 가이드 생성/)
})

test('Claude responses and cached guidance show the actual provider model and original generation time', () => {
  const generated = { ...defaultGuide, source: 'CLAUDE', readiness: { status: 'GENERATED', reasonCode: 'CLAUDE_GENERATED', aiAvailable: true, aiRequested: true, providerCalled: true, cached: false, provider: 'CLAUDE', model: 'claude-sonnet-5-5', generatedAt: '2026-11-11T18:20:00Z' } }
  const fresh = renderGuide(generated)
  assert.match(fresh, /Claude 가이드<\/span>/)
  assert.match(fresh, /Claude가 제안한 대응 순서를 받았어요/)
  assert.match(fresh, /Claude 요청 실행 · 가이드 생성/)
  assert.match(fresh, /2026\. 11\. 12\. 03:20 KST/)
  const cached = renderGuide({ ...generated, readiness: { ...generated.readiness, reasonCode: 'CACHE_HIT', providerCalled: false, cached: true } })
  assert.match(cached, /이전에 생성한 Claude 결과 재사용/)
  assert.match(cached, /2026\. 11\. 12\. 03:20 KST/)
  assert.doesNotMatch(cached, /Claude 요청 실행/)
})

test('Claude authentication billing and connectivity failures retain the provider-specific fallback', () => {
  for (const [reasonCode, expected] of [
    ['KEY_FILE_UNREADABLE', /Claude API 키 파일을 읽지 못했어요/],
    ['WORKSPACE_INVALID', /워크스페이스 설정을 확인/],
    ['PROVIDER_AUTHENTICATION_FAILED', /Claude의 API 인증이 거부/],
    ['PROVIDER_ACCESS_DENIED', /Claude가 접근을 거부/],
    ['PROVIDER_BILLING_REQUIRED', /Claude의 API 결제·크레딧 상태/],
    ['PROVIDER_RATE_LIMITED', /Claude의 호출 제한/],
    ['PROVIDER_TIMEOUT', /Claude의 응답 시간이 초과/],
  ]) {
    const guide = { ...defaultGuide, readiness: { ...readiness, status: 'FALLBACK', reasonCode, provider: 'CLAUDE', model: 'claude-sonnet-5-5' } }
    const html = renderGuide(guide)
    assert.match(html, expected)
    assert.match(html, /기본 가이드<\/span>/)
    assert.match(html, /AWS IAM/)
    assert.doesNotMatch(html, /Claude 가이드<\/span>/)
  }
  const unknownModel = renderGuide({ ...defaultGuide, readiness: { ...readiness, provider: 'CLAUDE', model: 'private-config-sentinel' } })
  assert.match(unknownModel, /모델 정보 확인 필요/)
  assert.doesNotMatch(unknownModel, /private-config-sentinel/)
  assert.match(JSON.stringify(api.immediateSecretCaseGuide({ issuer: 'NOTION' })), /Notion 연결|공유된 페이지|워크스페이스 감사 기록/)
})

test('changed guide context requires a state refresh and unavailable budgets show their own fallback', () => {
  const changed = { ...defaultGuide, readiness: { ...readiness, status: 'FALLBACK', reasonCode: 'CONTEXT_CHANGED', aiAvailable: true, aiRequested: true, providerCalled: true, provider: 'CLAUDE', model: 'claude-sonnet-5-5' } }
  assert.equal(api.canRequestGuideAi(changed), false)
  const html = renderGuide(changed)
  assert.match(html, /키 상태나 대응 단계가 바뀌었어요\. 가이드 상태를 다시 조회해 주세요/)
  assert.match(html, /disabled="">Claude로 가이드 생성/)
  assert.match(html, /가이드 상태 새로고침/)
  assert.match(html, /기본 가이드<\/span>/)
  assert.match(html, /Claude 요청 실행 · 기본 가이드 사용/)
  assert.doesNotMatch(html, /Claude 가이드<\/span>/)
  const current = { ...changed, readiness: { ...changed.readiness, status: 'READY', reasonCode: 'READY', providerCalled: false } }
  assert.equal(api.canRequestGuideAi(current), true)
  const budget = { ...changed, readiness: { ...changed.readiness, reasonCode: 'CALL_BUDGET_UNAVAILABLE', providerCalled: false } }
  assert.match(renderGuide(budget), /AI 호출 한도를 확인하지 못해 기본 가이드를 표시해요/)
  assert.match(renderGuide(budget), /잠시 후 다시 요청하세요/)
  assert.doesNotMatch(renderGuide(budget), /AI 사용 조건을 확인하지 못했어요/)
})

test('long discovery locations keep the case selector within the mobile guide workspace', async () => {
  const css = await readFile(resolve('src/pages/secret-response.css'), 'utf8')
  assert.match(css, /\.secret-response-location-picker\s*\{[^}]*grid-template-columns:minmax\(0,1fr\)[^}]*min-width:0/)
  assert.match(css, /\.secret-response-location-picker > \.select\s*\{[^}]*min-width:0[^}]*width:100%/)
})
