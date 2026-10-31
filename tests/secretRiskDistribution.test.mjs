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

const output = await build({ stdin: { contents: "export * from './src/components/SecretRiskDistribution'; export * from './src/lib/secretRiskDistribution'; export * from './src/lib/secretWorkbench'; export * from './src/lib/secretResponse'; export * from './src/api/secretWorkbenchQueue'; export * from './src/components/FindingTable'; export * from './src/lib/overviewPresentation'; export * from './src/pages/OverviewPage'; export * from './src/pages/SecretTriageCandidatesPage';", resolveDir: resolve('.') }, bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, alias: { '@': resolve('src') } })
const modulePath = resolve('node_modules/.secret-risk-distribution-test.mjs')
await writeFile(modulePath, output.outputFiles[0].contents)
const api = await import(pathToFileURL(modulePath).href)
after(() => unlink(modulePath))
const snapshotId = 'c61d954e-9a37-4715-bcfb-2284d9cfac27'
const filters = { origin: 'TEST', source: 'GITHUB', provider: 'AWS', environment: 'DEV', assignee: 'ME', connectionId: 9, snapshotId }
const cells = api.riskSeverities.flatMap((severity) => api.riskValidities.map((validity) => ({ severity, validity, value: severity === 'HIGH' && validity === 'VALID' ? 2 : severity === 'UNASSESSED' && validity === 'UNKNOWN' ? 1 : severity === 'NOT_APPLICABLE' && validity === 'UNCHECKED' ? 1 : 0, queueFilter: {} })))
const summary = { snapshotId, caseSummary: { severityStatus: 'AVAILABLE', severityCounts: { CRITICAL: 0, HIGH: 2, MEDIUM: 0, LOW: 0, UNASSESSED: 1 }, notApplicableCaseCount: 1, severityValidityMatrix: { status: 'AVAILABLE', scope: 'currentCases', unit: 'ResponseCase', total: 4, rows: api.riskSeverities, columns: api.riskValidities, cells, staleValidationCaseCount: 1 } } }
const render = (component, props = {}, path = '/', entries = []) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  entries.forEach(([key, value]) => client.setQueryData(key, value))
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: [path] }, createElement(component, props))))
  client.clear(); return html
}
const links = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => new URL(match[1].replaceAll('&amp;', '&'), 'http://local'))
test('risk chart and matrix drill down to exact snapshot and case unit while retaining every ACL filter', () => {
  const html = render(api.SecretRiskDistribution, { summary, filters })
  assert.match(html, /한 대응 건은 한 칸에만 집계/)
  assert.match(html, /미평가는 낮은 위험을 뜻하지 않아요/)
  assert.match(html, /검증 기한이 지난 1건은 확인 불가/)
  const hrefs = links(html)
  assert.equal(hrefs.length, 6)
  for (const url of hrefs) {
    assert.equal(url.pathname, '/secrets/triage'); assert.equal(url.searchParams.get('bucket'), 'CURRENT_CASES')
    for (const [key, value] of Object.entries(filters)) assert.equal(url.searchParams.get(key), String(value))
  }
  assert.ok(hrefs.some((url) => url.searchParams.get('severity') === 'UNASSESSED' && url.searchParams.get('validity') === 'UNKNOWN'))
  assert.ok(hrefs.some((url) => url.searchParams.get('severity') === 'NOT_APPLICABLE'))
})
test('unauthorized and legacy risk data never becomes a zero-valued graph', () => {
  for (const severityStatus of ['NOT_AUTHORIZED', 'LEGACY_UNAVAILABLE']) {
    const html = render(api.SecretRiskDistribution, { summary: { ...summary, caseSummary: { ...summary.caseSummary, severityStatus } }, filters })
    assert.equal(links(html).length, 0); assert.doesNotMatch(html, /secret-risk-grade-list|<table/)
    assert.match(html, severityStatus === 'NOT_AUTHORIZED' ? /권한이 없어요/ : /확인 가능한 집계가 없어요/)
  }
})
test('risk queue filters survive detail return and reject unknown values without losing the base snapshot', () => {
  const path = api.caseRiskQueuePath(filters, snapshotId, 'HIGH', 'VALID'), query = path.split('?')[1]
  const back = api.caseReturnPath(new URLSearchParams({ return: 'workbench', returnQuery: query }), 12)
  const url = new URL(back, 'http://local')
  assert.equal(url.searchParams.get('severity'), 'HIGH'); assert.equal(url.searchParams.get('validity'), 'VALID'); assert.equal(url.searchParams.get('snapshotId'), snapshotId)
  assert.equal(api.parseCaseRiskSelection(new URLSearchParams('severity=__proto__')).valid, false)
  assert.equal(api.parseCaseRiskSelection(new URLSearchParams('validity=STALE')).valid, false)
})
test('risk-filtered queue fetch keeps frozen filter basis rather than silently loading all cases', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async (path) => {
    const url = new URL(path, 'http://local')
    assert.equal(url.searchParams.get('snapshotId'), snapshotId); assert.equal(url.searchParams.get('severity'), 'HIGH'); assert.equal(url.searchParams.get('validity'), 'VALID')
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try { await api.fetchWorkbenchQueue(filters, 'CURRENT_CASES', '', 0, { severity: 'HIGH', validity: 'VALID' }) } finally { globalThis.fetch = original }
})
test('case matrix queue shows selected risk and returns to the same frozen list', () => {
  const path = api.caseRiskQueuePath(filters, snapshotId, 'HIGH', 'VALID')
  const data = { items: [{ caseId: 12, severity: 'HIGH', validationStatus: 'VALID', maskedLabel: 'AWS ••••1A2B', stage: 'OPEN' }], total: 2, size: 20, unit: 'ResponseCase', asOf: '2026-10-31T00:00:00Z', snapshotId }
  const html = render(api.SecretTriageCandidatesPage, {}, path, [[['secret-review-queue', filters, 'CURRENT_CASES', '', 0, 0, 'HIGH', 'VALID'], data]])
  assert.match(html, /높음 · 유효/); assert.match(html, /2건/)
  const detail = links(html).find((url) => url.pathname === '/secrets/cases/12')
  assert.equal(new URLSearchParams(detail.searchParams.get('returnQuery')).get('validity'), 'VALID')
})
const secret = { eventId: null, sourceType: 'SECRET_CASE', sourceId: 12, detailPath: '/secrets/cases/12?origin=PRODUCTION', title: '키 노출 대응', severity: 'UNASSESSED', environment: 'UNKNOWN', ownerTeam: '', reviewStatus: null, actionStatus: 'REVALIDATION_PENDING', asset: null }
test('common priority rows do not collide IDs or coerce unassessed and unknown into low and production', () => {
  const event = { ...secret, sourceType: 'DETECTION_EVENT', sourceId: 12, eventId: 12, detailPath: null, severity: 'HIGH', reviewStatus: 'UNREVIEWED' }
  assert.notEqual(api.priorityFindingKey(event), api.priorityFindingKey(secret))
  const html = render(api.FindingTable, { items: [event, secret], onSelect: () => {} })
  assert.match(html, /미평가/); assert.match(html, /미확인/); assert.match(html, /재검사 대기/); assert.match(html, /href="\/secrets\/cases\/12\?origin=PRODUCTION"/)
  assert.doesNotMatch(html, />Low<|>운영<|undefined/)
  assert.equal(api.secretPriorityPath({ ...secret, detailPath: 'https://external.example/' }), null)
  assert.equal(api.secretPriorityPath({ ...secret, detailPath: '/secrets/cases/13?origin=PRODUCTION' }), null)
})
test('common overview uses actual collection time and makes unavailable Secret coverage explicit', () => {
  const summary = { unreviewedCriticalCount: 0, totalCount: 2, unreviewedCount: 2, connectedAssetCount: 0, securityScore: 100, lastCollectedAt: '2026-10-31T00:00:00Z', secretIntegration: { status: 'NOT_AUTHORIZED' } }
  const seeds = [[['overview', 'summary', 'ALL'], summary], [['overview', 'risk-trend', 'ALL'], { days: [] }], [['overview', 'assets', 'ALL'], { totalCount: 0, providers: [] }], [['overview', 'priority-findings', 'ALL'], { items: [secret], unreviewedCount: 2 }]]
  const html = render(api.OverviewPage, {}, '/', seeds)
  assert.match(html, /시크릿 대응 건은 조회 권한이 없어 집계에 포함하지 않았어요/)
  assert.match(html, /최근 관측/); assert.doesNotMatch(html, /샘플|예시 데이터|화면 검토용/)
})
