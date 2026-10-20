import assert from 'node:assert/strict'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { build } from 'esbuild'
const modules = {}, paths = []
for (const [key, entry] of Object.entries({ lib: 'src/lib/secretScopeAlias.ts', form: 'src/components/SecretScopeAliasForm.tsx', scopes: 'src/pages/SecretConnectionScopesPage.tsx', api: 'src/api/secretConnections.ts' })) {
  const built = await build({ entryPoints: [resolve(entry)], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', alias: { '@': resolve('src') }, loader: { '.css': 'empty' } })
  const path = resolve(`node_modules/.secret-scope-alias-${key}-test.mjs`); paths.push(path)
  await writeFile(path, built.outputFiles[0].contents); modules[key] = await import(pathToFileURL(path).href)
}
after(() => Promise.all(paths.map((path) => unlink(path))))
const scope = { scopeId: 5, scopeRevision: 2, aliasVersion: 3, customSafeDisplayAlias: '결제 서비스 설정', safeDisplayAlias: '결제 서비스 설정', contentType: 'AWS_S3_OBJECT_CONTENT', origin: 'PRODUCTION', capabilities: { canEditAlias: true }, coverage: { freshness: 'OVERDUE', isPaused: false, isRunning: false, gapReasonCodes: ['AWS_ACCESS_DENIED'], lastAttempt: { runId: 8, status: 'FAILED', requestedAt: '2026-10-21T00:00:00Z' }, lastSuccessfulScan: null, nextDueAt: null }, approvedRef: 's3://private-path-do-not-display' }
function renderForm(value) {
  const client = new QueryClient()
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(modules.form.SecretScopeAliasForm, { scope: value, disabled: false, onReload() {} })))
}
test('display alias accepts human service labels and clearing, but rejects paths, URLs and token-like input', () => {
  for (const value of [null, '결제 서비스 운영 설정', 'Payments prod', '운영-문서_읽기']) assert.equal(modules.lib.validScopeDisplayAlias(value), true)
  for (const value of ['fixtures/config.env', 's3://private/bucket', 'https://example.com', 'AKIA' + 'A'.repeat(16), 'ghp_' + 'a'.repeat(24), 'github_pat_abc', 'a'.repeat(24), '123456789012']) assert.equal(modules.lib.validScopeDisplayAlias(value), false)
})
test('only an explicit scope capability exposes the alias form and no source reference is copied', () => {
  const hidden = renderForm({ ...scope, capabilities: { canEditAlias: false } })
  assert.doesNotMatch(hidden, /서비스·용도 이름|표시 이름 저장|private-path/)
  const html = renderForm(scope)
  assert.match(html, /표시 이름 수정/); assert.match(html, /결제 서비스 설정/)
  assert.doesNotMatch(html, /s3:\/\/|private-path-do-not-display/)
})
test('an unknown alias version disables editing rather than guessing version zero', () => {
  const html = renderForm({ ...scope, aliasVersion: null })
  assert.match(html, /버전을 확인해야 수정할 수 있어요/)
  assert.match(html, /<button class="btn primary" disabled="">표시 이름 저장/)
})
test('scope failure codes appear inside a closed error disclosure with a human primary reason', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(['secret-connection-scopes', 9, 0, '', false], { items: [scope], total: 1, page: 0, size: 20 })
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: ['/secrets/connections/9/scopes'] }, createElement(Routes, {}, createElement(Route, { path: '/secrets/connections/:connectionId/scopes', element: createElement(modules.scopes.SecretConnectionScopesPage) })))))
  assert.match(html, /접근 권한 확인 필요/)
  assert.match(html, /<details class="secret-scope-error-info"><summary>오류 정보<\/summary><ul><li><code>AWS_ACCESS_DENIED/)
  assert.doesNotMatch(html, /접근 권한 확인 필요 <code>|<details class="secret-scope-error-info" open|private-path/)
  client.clear()
})
test('alias mutation uses the scope and alias versions and sends no collected path or content', async () => {
  const originalFetch = globalThis.fetch, originalDocument = globalThis.document
  let call
  globalThis.document = { cookie: 'XSRF-TOKEN=csrf' }
  globalThis.fetch = async (path, init) => { call = { path, body: JSON.parse(init.body) }; return new Response(JSON.stringify({ scopeId: 5, scopeRevision: 2, aliasVersion: 4, requiresSnapshotRefresh: true }), { status: 200, headers: { 'content-type': 'application/json' } }) }
  try {
    await modules.api.updateScopeDisplayAlias(5, { safeDisplayAlias: '결제 운영 설정', expectedScopeRevision: 2, expectedAliasVersion: 3 })
    assert.equal(call.path, '/api/v1/secrets/scopes/5/display-alias')
    assert.deepEqual(call.body, { safeDisplayAlias: '결제 운영 설정', expectedScopeRevision: 2, expectedAliasVersion: 3 })
    await modules.api.updateScopeDisplayAlias(5, { safeDisplayAlias: null, expectedScopeRevision: 2, expectedAliasVersion: 4 })
    assert.equal(call.body.safeDisplayAlias, null)
  } finally { globalThis.fetch = originalFetch; globalThis.document = originalDocument }
})
