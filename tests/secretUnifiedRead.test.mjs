import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { build } from 'esbuild'

const bundle = await build({
  stdin: { contents: "export * from './src/lib/secretReadSelection'; export * from './src/lib/secretReview'; export * from './src/lib/secretInventory'; export * from './src/lib/secretResponse'; export * from './src/lib/secretWorkbench'; export * from './src/lib/secretCsv'; export * from './src/api/secrets'; export * from './src/api/secretCases'; export * from './src/api/secretWorkbenchQueue'; export * from './src/api/secretSummary'; export * from './src/components/SecretFilterDisclosure';", resolveDir: resolve('.') },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', packages: 'external',
  alias: { '@': resolve('src') }, loader: { '.css': 'empty' },
})
const modulePath = resolve('node_modules/.secret-unified-read-test.mjs')
await writeFile(modulePath, bundle.outputFiles[0].contents)
const api = await import(pathToFileURL(modulePath).href)
after(() => unlink(modulePath))
const snapshotId = 'c61d954e-9a37-4715-bcfb-2284d9cfac27'

test('legacy list modes become ALL and discard their old snapshot while keeping local conditions', () => {
  for (const origin of ['PRODUCTION', 'TEST', 'UNCLASSIFIED']) {
    const params = api.canonicalSecretListParams(new URLSearchParams({ origin, snapshotId, source: 'GITHUB', environment: 'DEV', q: 'payment', page: '3' }))
    assert.equal(params.get('origin'), 'ALL')
    assert.equal(params.has('snapshotId'), false)
    assert.equal(params.get('source'), 'GITHUB')
    assert.equal(params.get('environment'), 'DEV')
    assert.equal(params.get('q'), 'payment')
    assert.equal(params.get('page'), '1')
  }
})
test('an ALL drilldown keeps the frozen snapshot and a query change starts a fresh first page', () => {
  const params = new URLSearchParams({ origin: 'ALL', snapshotId, q: 'payment', page: '3', bucket: 'CURRENT_CASES', severity: 'HIGH' })
  assert.equal(api.canonicalSecretListParams(params).toString(), params.toString())
  const next = api.changedSecretListParams(params, { q: '  rotated  ', source: 'AWS' })
  assert.equal(next.get('q'), 'rotated')
  assert.equal(next.get('bucket'), 'CURRENT_CASES')
  assert.equal(next.get('severity'), 'HIGH')
  assert.equal(next.get('page'), '1')
  assert.equal(next.has('snapshotId'), false)
})
test('list and key comparison parsers use ALL and sanitize rejected search queries', () => {
  for (const parsed of [api.parseInventoryFilters(new URLSearchParams()), api.parseCaseFilters(new URLSearchParams()), api.parseWorkbenchFilters(new URLSearchParams())]) assert.equal(parsed.filters.origin, 'ALL')
  assert.equal(api.parseLocationFilters(new URLSearchParams('origin=TEST')).filters.origin, 'ALL')
  assert.equal(api.parseLocationFilters(new URLSearchParams('origin=UNCLASSIFIED')).filters.origin, 'ALL')
  assert.equal(api.parseInventoryFilters(new URLSearchParams({ q: 'x'.repeat(101) })).filters.q, undefined)
  assert.equal(api.parseCaseFilters(new URLSearchParams({ q: 'bad\u0001query' })).filters.q, undefined)
  assert.equal(api.parseWorkbenchFilters(new URLSearchParams({ origin: '__proto__' })).valid, false)
})
test('search, page and snapshot survive inventory, case and risk queue detail returns', () => {
  const selection = new URLSearchParams({ origin: 'ALL', q: 'payment', source: 'GITHUB', environment: 'DEV', snapshotId, page: '3' })
  const inventory = api.parseInventoryFilters(selection).filters
  const detail = new URL(api.keyDetailPath(12, inventory), 'http://local')
  const back = new URL(api.inventoryReturnPath(detail.searchParams, 12), 'http://local')
  for (const key of ['q', 'source', 'environment', 'snapshotId', 'page']) assert.equal(back.searchParams.get(key), selection.get(key))
  const cases = api.parseCaseFilters(new URLSearchParams('origin=ALL&q=payment&page=3&stages=IN_PROGRESS')).filters
  const caseBack = new URL(api.caseReturnPath(new URL(api.caseDetailPath(7, cases), 'http://local').searchParams, 7), 'http://local')
  assert.equal(caseBack.searchParams.get('q'), 'payment')
  assert.equal(caseBack.searchParams.get('page'), '3')
  const queueBack = new URL(api.safeWorkbenchReturn(selection.toString() + '&bucket=CURRENT_CASES&severity=HIGH&validity=VALID', '7'), 'http://local')
  for (const key of ['q', 'source', 'environment', 'snapshotId', 'page']) assert.equal(queueBack.searchParams.get(key), selection.get(key))
  assert.equal(queueBack.searchParams.get('severity'), 'HIGH')
  assert.equal(queueBack.searchParams.get('validity'), 'VALID')
})
test('server requests use ALL and search before pagination while the overview omits search', async () => {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (path) => { calls.push(new URL(path, 'http://local')); return new Response('{}', { headers: { 'content-type': 'application/json' } }) }
  try {
    const inventory = api.parseInventoryFilters(new URLSearchParams('q=payment')).filters
    const cases = api.parseCaseFilters(new URLSearchParams('q=payment')).filters
    const work = api.parseWorkbenchFilters(new URLSearchParams('q=payment')).filters
    await api.fetchSecrets(inventory)
    await api.fetchSecretCases(cases)
    await api.fetchWorkbenchQueue(work, 'REVIEW_REQUIRED', '', 0)
    await api.fetchSecretSummary(work)
    await api.fetchSecretDetail(12)
    assert.deepEqual(calls.map((url) => url.pathname), ['/api/v1/secrets', '/api/v1/secrets/cases', '/api/v1/secrets/review-queue', '/api/v1/secrets/summary', '/api/v1/secrets/12'])
    for (const url of calls) assert.equal(url.searchParams.get('origin'), 'ALL')
    for (const url of calls.slice(0, 3)) assert.equal(url.searchParams.get('q'), 'payment')
    assert.equal(calls[3].searchParams.has('q'), false)
  } finally { globalThis.fetch = original }
})
test('every CSV page retains the server search and unified frozen selection', async () => {
  const calls = []
  await api.loadAllSecretItems(async (filter) => {
    calls.push(filter)
    return { items: Array.from({ length: filter.page === 0 ? 100 : 1 }, (_, index) => ({ id: filter.page * 100 + index + 1 })), total: 101, page: filter.page, size: filter.size, snapshotId, scope: 'inventory', unit: 'CredentialSet' }
  }, { issuer: 'ALL', componentState: 'ALL', origin: 'ALL', q: 'payment', snapshotId })
  assert.equal(calls.length, 2)
  for (const call of calls) { assert.equal(call.origin, 'ALL'); assert.equal(call.q, 'payment'); assert.equal(call.snapshotId, snapshotId) }
})
test('current-case risk filters retain a snapshot and history never sends unsupported dimensions', async () => {
  const selection = new URLSearchParams({ origin: 'ALL', q: 'payment', source: 'GITHUB', environment: 'DEV', severity: 'HIGH', validity: 'VALID', snapshotId, page: '2' })
  const current = api.parseCaseFilters(selection)
  assert.equal(current.valid, true)
  assert.equal(api.caseSearch(current.filters).get('snapshotId'), snapshotId)
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (path) => { calls.push(new URL(path, 'http://local')); return new Response('{}', { headers: { 'content-type': 'application/json' } }) }
  try {
    await api.fetchSecretCases(current.filters)
    await api.fetchSecretCases({ ...current.filters, scope: 'history' })
    await api.fetchSecretCases({ ...current.filters, assignmentStatus: 'PERSONAL' })
    assert.equal(calls[0].searchParams.get('severity'), 'HIGH')
    assert.equal(calls[0].searchParams.get('validity'), 'VALID')
    assert.equal(calls[0].searchParams.get('snapshotId'), snapshotId)
    for (const url of calls.slice(1)) {
      assert.equal(url.searchParams.get('q'), 'payment')
      for (const key of ['source', 'environment', 'severity', 'validity', 'snapshotId']) assert.equal(url.searchParams.has(key), false)
    }
  } finally { globalThis.fetch = original }
})
test('filter fields start collapsed and applied search and field chips remain visible', () => {
  const html = renderToStaticMarkup(createElement(api.SecretFilterDisclosure, {
    label: '키 목록', search: true, fields: [{ key: 'source', label: '발견 플랫폼', options: { ALL: '전체', GITHUB: 'GitHub' }, defaultValue: 'ALL' }],
    values: { q: 'payment', source: 'GITHUB' }, onApply() {}, onReset() {},
  }))
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /검색 payment/)
  assert.match(html, /발견 플랫폼 GitHub/)
  assert.match(html, /초기화/)
  const searchButton = html.match(/<button[^>]*value="search"[^>]*>/)?.[0] ?? ''
  assert.match(searchButton, /name="filterAction"/)
  assert.doesNotMatch(searchButton, /disabled/)
  assert.doesNotMatch(html, /<select|운영·시험|시험 출처/)
})
test('search submits committed conditions and an explicit filter submit commits its draft', () => {
  const committed = { source: 'GITHUB', environment: 'ALL', q: 'payment' }
  const draft = { source: 'AWS', environment: 'DEV', q: 'payment' }
  assert.deepEqual(api.secretFilterSubmission(committed, draft, 'search', '  rotated  '), { source: 'GITHUB', environment: 'ALL', q: 'rotated' })
  assert.deepEqual(api.secretFilterSubmission(committed, draft, 'filters', '  rotated  '), { source: 'AWS', environment: 'DEV', q: 'rotated' })
  assert.deepEqual(api.secretFilterSubmission({ status: 'ACTIVE' }, { status: 'PAUSED' }, 'filters'), { status: 'PAUSED' })
  assert.deepEqual(committed, { source: 'GITHUB', environment: 'ALL', q: 'payment' })
})
test('search rejects credential-shaped input with the same fixed boundary as the server', () => {
  const rejected = ['AKIA' + 'A'.repeat(16), 'ASIA' + 'B'.repeat(16), 'ghp_' + 'c'.repeat(20), 'github_pat_', 'secret_' + 'd'.repeat(20), 'ntn_' + 'e'.repeat(20), 'f'.repeat(24), '1234567890', 'bad\u0085value']
  for (const q of rejected) {
    assert.equal(api.validSecretSearch(q), false)
    assert.throws(() => api.safeSecretSearch(q), { message: 'SECRET_SEARCH_REJECTED' })
    assert.throws(() => api.secretFilterSubmission({ source: 'ALL' }, {}, 'search', q), { message: 'SECRET_SEARCH_REJECTED' })
  }
  for (const q of ['AWS AKIA••••1234', 'GITHUB ghp_••••4Q5R', 'payments/config/app.env', 'src/main/application.yml', '보안 담당자', '  rotated  ']) assert.equal(api.validSecretSearch(q), true)
})
test('legacy and duplicate raw search parameters are scrubbed before navigation and request selection', () => {
  const raw = 'ghp_' + 'a'.repeat(36)
  const params = new URLSearchParams({ origin: 'ALL', q: 'payment', snapshotId, source: 'GITHUB' })
  params.append('q', raw)
  const safe = api.canonicalSecretListParams(params)
  assert.equal(safe.has('q'), false)
  assert.equal(safe.has('snapshotId'), false)
  assert.equal(safe.get('searchRejected'), '1')
  assert.equal(safe.get('source'), 'GITHUB')
  assert.equal(api.parseInventoryFilters(params).filters.q, undefined)
  assert.equal(api.parseCaseFilters(params).filters.q, undefined)
  assert.equal(api.parseWorkbenchFilters(params).filters.q, undefined)
  const nested = new URLSearchParams({ origin: 'TEST', occurrence: '8', returnQuery: params.toString() })
  assert.equal(decodeURIComponent(api.sanitizedSecretSearchParams(nested).toString()).includes(raw), false)
  assert.equal(decodeURIComponent(api.reviewDetailPath(12, 8, params)).includes(raw), false)
  assert.equal(decodeURIComponent(api.safeWorkbenchReturn(params.toString() + '&bucket=REVIEW_REQUIRED')).includes(raw), false)
})
test('URL builders and direct APIs never send a rejected credential query', () => {
  const raw = 'ghp_' + 'a'.repeat(36)
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; return new Response('{}') }
  try {
    const inventory = { ...api.parseInventoryFilters(new URLSearchParams()).filters, q: raw }
    const cases = { ...api.parseCaseFilters(new URLSearchParams()).filters, q: raw }
    const work = { ...api.parseWorkbenchFilters(new URLSearchParams()).filters, q: raw }
    for (const action of [() => api.inventorySearch(inventory), () => api.caseSearch(cases), () => api.workbenchSearch(work), () => api.changedSecretListParams(new URLSearchParams(), { q: raw }), () => api.fetchSecrets(inventory), () => api.fetchSecretCases(cases), () => api.fetchWorkbenchQueue(work, 'REVIEW_REQUIRED', '', 0)]) {
      assert.throws(action, { message: 'SECRET_SEARCH_REJECTED' })
    }
    assert.equal(calls, 0)
  } finally { globalThis.fetch = original }
})
test('unsafe applied values cannot appear in an input, chip, label or error text', () => {
  const raw = 'ghp_' + 'a'.repeat(36)
  const html = renderToStaticMarkup(createElement(api.SecretFilterDisclosure, {
    label: '키 목록', search: true, fields: [], values: { q: raw }, onApply() {}, onReset() {},
  }))
  assert.doesNotMatch(html, new RegExp(raw))
  assert.match(html, /role="alert"/)
  assert.match(html, /키·토큰 원문 대신/)
  assert.match(html, /type="search"[^>]*value=""/)
})
test('key comparison reads all original locations and discards the old detail snapshot', () => {
  for (const origin of ['PRODUCTION', 'TEST', 'UNCLASSIFIED']) {
    const params = new URLSearchParams({ origin, occurrence: '8', detailVersion: 'old-detail', locationPage: '3', tab: 'cases' })
    const safe = api.canonicalSecretLocationParams(params)
    assert.equal(safe.get('origin'), 'ALL')
    assert.equal(safe.get('occurrence'), '8')
    assert.equal(safe.get('locationPage'), '1')
    assert.equal(safe.get('tab'), 'cases')
    assert.equal(safe.has('detailVersion'), false)
    assert.equal(api.parseLocationFilters(params).filters.origin, 'ALL')
  }
})
