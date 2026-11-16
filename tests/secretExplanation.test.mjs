import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { build } from 'esbuild'

const output = await build({
  stdin: { contents: "export * from './src/api/secretExplanation'; export * from './src/components/SecretExplanation'; export { ApiError } from './src/api/client'", resolveDir: resolve('.') },
  bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external',
  alias: { '@': resolve('src') }, loader: { '.css': 'empty' },
})
const path = resolve('node_modules/.secret-explanation-test.mjs')
await writeFile(path, output.outputFiles[0].contents)
const api = await import(pathToFileURL(path).href)
after(() => unlink(path))

const data = {
  version: 'explanation-v1', topic: 'SCAN', source: 'DEFAULT', summary: '수집은 완료됐고 인증 확인은 재시도 대기 중이에요.',
  facts: [{ code: 'COLLECTION_COMPLETE', label: '파일 수집 완료' }],
  actions: [{ code: 'VIEW_RETRY', label: '재시도 상태 확인', href: '/secrets/history/91' }],
  documents: [],
  readiness: { status: 'READY', reasonCode: 'READY', aiAvailable: true, aiRequested: false, providerCalled: false, cached: false },
}

function render(value, error) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } })
  const key = ['secret-explanation', 'SCAN', 91, null]
  client.setQueryData(key, value)
  if (error) client.getQueryCache().find({ queryKey: key }).setState({ error, status: 'error', errorUpdateCount: 1 })
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null,
    createElement(api.SecretExplanation, { topic: 'SCAN', id: 91 }))))
  client.clear()
  return html
}

test('scan explanation joins current facts and allowed actions without replacing their status', () => {
  const html = render(data)
  assert.match(html, /수집은 완료됐고 인증 확인은 재시도 대기 중/)
  assert.match(html, /파일 수집 완료/)
  assert.match(html, /href="\/secrets\/history\/91"/)
  assert.match(html, /Claude로 설명 정리/)
  assert.match(html, /<details><summary>설명 근거와 사용 정보/)
})

test('untrusted action destinations and unrelated document hosts never become links', () => {
  const html = render({ ...data,
    actions: [...data.actions, { code: 'BAD_ACTION', label: 'unsafe action', href: 'https://example.com/collect' }],
    documents: [
      { id: 'bad', title: 'untrusted document', url: 'javascript:alert(1)', reviewedAt: '' },
      { id: 'approved', title: '공식 GitHub 안내', url: 'https://docs.github.com/en/authentication', reviewedAt: '' },
    ],
  })
  assert.doesNotMatch(html, /example\.com|javascript:|unsafe action|untrusted document/)
  assert.match(html, /https:\/\/docs.github.com\/en\/authentication/)
})

test('revoked access hides previously cached explanation and its destinations', () => {
  const html = render(data, new api.ApiError(403, 'FORBIDDEN', '접근 거부'))
  assert.equal(html, '')
})

test('explanation uses authenticated bodyless commands and no caller-provided incident data', async () => {
  const originalFetch = globalThis.fetch
  const originalDocument = globalThis.document
  const calls = []
  globalThis.document = { cookie: 'XSRF-TOKEN=csrf-explanation' }
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
  }
  try {
    await api.fetchSecretExplanation('SCAN', 91)
    await api.requestSecretExplanation('SCAN', 91)
    assert.match(calls[0].url, /\/runs\/91\/explanation$/)
    assert.equal(calls[1].init.method, 'POST')
    assert.equal(calls[1].init.body, undefined)
    assert.equal(calls[1].init.headers.get('X-XSRF-TOKEN'), 'csrf-explanation')
    assert.throws(() => api.fetchSecretExplanation('SCAN', 0), /INVALID_EXPLANATION_TARGET/)
  } finally { globalThis.fetch = originalFetch; globalThis.document = originalDocument }
})
