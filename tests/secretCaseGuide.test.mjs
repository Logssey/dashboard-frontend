import assert from 'node:assert/strict'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, test } from 'node:test'
import { build } from 'esbuild'

const bundled = await build({
  entryPoints: [resolve('src/api/secretCaseGuide.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
})
const bundlePath = resolve('node_modules/.secret-case-guide-test.mjs')
await writeFile(bundlePath, bundled.outputFiles[0].contents)
const { requestSecretCaseGuide } = await import(pathToFileURL(bundlePath).href)
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
