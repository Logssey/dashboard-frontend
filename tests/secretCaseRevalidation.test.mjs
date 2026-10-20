import assert from 'node:assert/strict'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test, after } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { build } from 'esbuild'

const bundled = await build({ entryPoints: [resolve('src/components/SecretCaseRevalidation.tsx')], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', alias: { '@': resolve('src') } })
const bundlePath = resolve('node_modules/.secret-case-revalidation-test.mjs')
await writeFile(bundlePath, bundled.outputFiles[0].contents)
const { SecretCaseRevalidation } = await import(pathToFileURL(bundlePath).href)
after(() => unlink(bundlePath))
const base = { caseId: 7, version: 3, stage: 'REVALIDATION_PENDING', occurrences: [{ occurrenceId: 11, safeLocationLabel: '위치 #11', version: 5, responseStatus: 'REVALIDATION_PENDING', canRequestRevalidation: true, canResume: false }], capabilities: { canResolve: true, canRequestRevalidation: true } }
function renderFor(result, jobStatus = 'SUCCEEDED', occurrence = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['secret-case-revalidations', 7], [{ revalidationId: 21, occurrenceId: 11, runId: 8, jobStatus, result, failureCode: null, requestedAt: '2026-10-19T00:00:00Z', finishedAt: '2026-10-19T00:01:00Z' }])
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, {}, createElement(SecretCaseRevalidation, { detail: { ...base, occurrences: [{ ...base.occurrences[0], ...occurrence }] }, onReload() {}, onStale() {}, disabled: false }))))
}
test('missing is a location observation and never a direct case resolution action', () => {
  const html = renderFor('MISSING')
  assert.match(html, /재검사에서 미발견/)
  assert.match(html, /키 폐기·교체 확인과 대응 건 해결은 별도로/)
  assert.doesNotMatch(html, /<button[^>]*>대응 건 해결<\/button>/)
  assert.match(html, /href="\/secrets\/history\/8"/)
})
test('present evidence does not silently select or act on the first location', () => {
  const html = renderFor('PRESENT', 'SUCCEEDED', { canResume: true })
  assert.match(html, /다시 발견됨/)
  assert.match(html, /<option value="" selected="">위치 선택<\/option>/)
  assert.doesNotMatch(html, /<button[^>]*>이 위치 추가 조치<\/button>/)
})
test('failed, unknown, or unfinished scans never display a missing conclusion', () => {
  for (const [result, job] of [['UNKNOWN', 'SUCCEEDED'], ['MISSING', 'FAILED'], ['MISSING', 'LEASED']]) {
    const html = renderFor(result, job)
    assert.doesNotMatch(html, /재검사에서 미발견/)
    assert.match(html, /판정 불가|검사 진행 중/)
  }
})
test('a case capability never overrides an ineligible location capability', () => {
  const html = renderFor('UNKNOWN', 'SUCCEEDED', { canRequestRevalidation: false })
  assert.match(html, /현재 재검증 가능한 위치가 없어요/)
  assert.doesNotMatch(html, /<option value="11"/)
})
