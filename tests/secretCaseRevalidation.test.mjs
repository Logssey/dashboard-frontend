import assert from 'node:assert/strict'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test, after } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { build } from 'esbuild'

const bundled = await build({
  entryPoints: [resolve('src/components/SecretCaseRevalidation.tsx')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  packages: 'external',
  alias: { '@': resolve('src') },
})
const bundlePath = resolve('node_modules/.secret-case-revalidation-test.mjs')
await writeFile(bundlePath, bundled.outputFiles[0].contents)
const { SecretCaseRevalidation } = await import(pathToFileURL(bundlePath).href)
after(() => unlink(bundlePath))

const baseCase = {
  caseId: 7,
  version: 3,
  stage: 'REVALIDATION_PENDING',
  occurrences: [{ occurrenceId: 11, responseStatus: 'REVALIDATION_PENDING', canRequestRevalidation: true, canResume: false }],
  capabilities: {
    canRequestRevalidation: false, canResolve: false, canResume: false,
  },
}

function renderFor(record, capabilities, occurrenceCapabilities = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['secret-case-revalidations', 7], [record])
  return renderToStaticMarkup(createElement(QueryClientProvider, { client },
    createElement(SecretCaseRevalidation, {
      detail: {
        ...baseCase,
        occurrences: [{ ...baseCase.occurrences[0], canResume: record.result === 'PRESENT', ...occurrenceCapabilities }],
        capabilities: { ...baseCase.capabilities, ...capabilities },
      },
      onUpdated: () => {}, onRefresh: () => {},
    })))
}

function record(result, jobStatus = 'SUCCEEDED') {
  return {
    revalidationId: 21, occurrenceId: 11, runId: 8, jobStatus, result,
    failureCode: null, requestedAt: '2026-10-19T00:00:00Z', finishedAt: '2026-10-19T00:01:00Z',
  }
}

test('a missing key shows evidence and a separate security-only resolve action', () => {
  const html = renderFor(record('MISSING'), { canResolve: true })
  assert.match(html, /재검사에서 미발견/)
  assert.match(html, /<button[^>]*>대응 건 해결<\/button>/)
  assert.doesNotMatch(html, /추가 조치 시작/)
})

test('a present key offers assigned remediator resume without claiming resolution', () => {
  const html = renderFor(record('PRESENT'), { canResume: true })
  assert.match(html, /다시 발견됨/)
  assert.match(html, /추가 조치 시작/)
  assert.doesNotMatch(html, /<button[^>]*>대응 건 해결<\/button>/)
})

test('unknown or unfinished scans never appear as missing or resolved', () => {
  const unknown = renderFor(record('UNKNOWN'), {})
  const pending = renderFor(record('PENDING', 'PENDING'), { canRequestRevalidation: true })
  assert.match(unknown, /판정 불가/)
  assert.doesNotMatch(unknown, /<button[^>]*>대응 건 해결<\/button>/)
  assert.match(pending, /대기 중/)
  assert.match(pending, /진행 중인 검사를 기다려 주세요/)
  assert.doesNotMatch(pending, /재검사에서 미발견/)
})

test('a case-level permission does not expose an ineligible occurrence as a scan target', () => {
  const html = renderFor(record('UNKNOWN'), { canRequestRevalidation: true }, { canRequestRevalidation: false })
  assert.match(html, /현재 재검증 가능한 위치가 없어요/)
  assert.doesNotMatch(html, /<option value="11"/)
})
