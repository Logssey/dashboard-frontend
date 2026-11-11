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
for (const [key, entry] of Object.entries({ inventory: 'src/lib/secretInventory.ts', csv: 'src/lib/secretCsv.ts', scan: 'src/lib/secretScan.ts', api: 'src/api/secrets.ts', findings: 'src/pages/SecretRunFindingsPage.tsx', list: 'src/pages/SecretsPage.tsx' })) {
  const built = await build({ entryPoints: [resolve(entry)], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', alias: { '@': resolve('src') }, loader: { '.css': 'empty' } })
  const path = resolve(`node_modules/.secret-run-results-${key}-test.mjs`); paths.push(path)
  await writeFile(path, built.outputFiles[0].contents); modules[key] = await import(pathToFileURL(path).href)
}
after(() => Promise.all(paths.map((path) => unlink(path))))
const snapshotId = 'a51d954e-9a37-4715-bcfb-2284d9cfac27'
const sample = { id: 4, issuer: 'AWS', credentialType: 'AWS_ACCESS_KEY_PAIR', maskedLabel: 'AWS ••••1234', componentState: 'CONFIRMED', validationStatus: 'UNCHECKED', validationReasonCode: null, occurrenceCount: 1, firstSeenAt: '2026-10-20T00:00:00Z', lastSeenAt: '2026-10-21T00:00:00Z' }
test('run-limited inventory restores the same run on page change and key detail return', () => {
  const { filters, errors } = modules.inventory.parseInventoryFilters(new URLSearchParams(`origin=ALL&runId=17&page=3&snapshotId=${snapshotId}`))
  assert.deepEqual(errors, []); assert.equal(filters.runId, 17)
  assert.equal(modules.inventory.inventorySearch({ ...filters, page: 3 }).get('runId'), '17')
  const detail = modules.inventory.keyDetailPath(4, filters)
  const returned = modules.inventory.inventoryReturnPath(new URL(detail, 'http://local').searchParams, 4)
  const params = new URL(returned, 'http://local').searchParams
  assert.equal(params.get('runId'), '17'); assert.equal(params.get('page'), '3'); assert.equal(params.get('origin'), 'ALL'); assert.equal(params.get('snapshotId'), snapshotId)
  for (const value of ['0', '-1', 'abc', '9007199254740992', '']) assert.ok(modules.inventory.parseInventoryFilters(new URLSearchParams({ runId: value })).errors.length > 0)
})
test('every CSV page retains runId and the export states that execution restriction', async () => {
  let calls = 0
  const rows = await modules.csv.loadAllSecretItems(async (filter) => {
    calls++; assert.equal(filter.runId, 17); assert.equal(filter.snapshotId, snapshotId)
    return { items: Array.from({ length: filter.page === 0 ? 100 : 1 }, (_, n) => ({ ...sample, id: filter.page * 100 + n + 1 })), total: 101, page: filter.page, size: filter.size, snapshotId, scope: 'inventory', unit: 'CredentialSet' }
  }, { issuer: 'ALL', componentState: 'ALL', origin: 'TEST', runId: 17, snapshotId })
  assert.equal(calls, 2)
  const csv = modules.csv.buildMaskedSecretsCsv(rows, { origin: 'TEST', asOf: '2026-10-21T00:00:00Z', runId: 17 })
  assert.match(csv, /실행 필터/); assert.match(csv, /SCAN-17/)
})
test('the inventory request sends the actual runId filter', async () => {
  const originalFetch = globalThis.fetch
  let called
  globalThis.fetch = async (path) => { called = new URL(path, 'http://local'); return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }) }
  try { await modules.api.fetchSecrets({ page: 0, size: 20, issuer: 'ALL', componentState: 'ALL', runId: 17 }); assert.equal(called.searchParams.get('runId'), '17') } finally { globalThis.fetch = originalFetch }
})
test('history detail round trip keeps the frozen snapshot and requires a complete period', () => {
  const { filters, errors } = modules.scan.parseRunFilters(new URLSearchParams(`provider=GITHUB&page=2&snapshotId=${snapshotId}&from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z`))
  assert.deepEqual(errors, [])
  const detail = modules.scan.scanDetailPath(17, filters)
  const returned = modules.scan.historyReturnPath(new URL(detail, 'http://local').searchParams, 17)
  const params = new URL(returned, 'http://local').searchParams
  assert.equal(params.get('snapshotId'), snapshotId); assert.equal(params.get('page'), '2'); assert.equal(params.get('provider'), 'GITHUB'); assert.equal(params.get('focus'), '17')
  assert.ok(modules.scan.parseRunFilters(new URLSearchParams('from=2026-10-01T00:00:00Z')).errors.length > 0)
})
function render(Component, route, entry, seeds) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  for (const [key, value] of seeds) client.setQueryData(key, value)
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: [entry] }, createElement(Routes, {}, createElement(Route, { path: route, element: createElement(Component) })))))
}
test('run findings show Finding units across origins without claiming they are unique keys', () => {
  const html = render(modules.findings.SecretRunFindingsPage, '/secrets/history/:runId/findings', '/secrets/history/17/findings', [[['secret-run-findings', 17, 0], { runId: 17, unit: 'Finding', total: 2, page: 0, size: 20, asOf: '2026-10-21T00:00:00Z', items: [{ findingId: 31, occurrenceId: 51, credentialSetId: 4, maskedLabel: sample.maskedLabel, componentState: 'CONFIRMED', ruleId: 'aws-access-token', ruleVersion: null, origin: 'TEST' }, { findingId: 32, occurrenceId: 52, credentialSetId: 4, maskedLabel: sample.maskedLabel, componentState: 'CONFIRMED', ruleId: 'aws-access-token', ruleVersion: '1', origin: 'PRODUCTION' }] }]])
  assert.match(html, /탐지 근거 2건/); assert.match(html, /고유 키 수와 합산하지 않아요/); assert.doesNotMatch(html, /<th>출처<\/th>|<td>시험<\/td>|<td>운영<\/td>/); assert.match(html, /return=run-findings/)
  assert.doesNotMatch(html, /고유 키 2개|신규 키 2개/)
})
test('run-filtered inventory visibly marks the restriction and offers a deliberate reset', () => {
  const params = new URLSearchParams(`runId=17&origin=ALL&snapshotId=${snapshotId}`)
  const { filters } = modules.inventory.parseInventoryFilters(params)
  const html = render(modules.list.SecretsPage, '/secrets/findings', `/secrets/findings?${params}`, [[['secret-inventory', filters, 0], { items: [sample], total: 1, page: 0, size: 20, scope: 'inventory', unit: 'CredentialSet', asOf: '2026-10-21T00:00:00Z', snapshotId }]])
  assert.match(html, /SCAN-17에서 발견한 키/); assert.match(html, /실행 조건 해제/); assert.match(html, /실행 상세/)
})
