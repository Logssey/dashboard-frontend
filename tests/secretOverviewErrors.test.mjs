import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { build } from 'esbuild'

const bundle = await build({
  stdin: {
    contents: `
      export { SecretOverviewPage } from './src/pages/SecretOverviewPage';
      export { ApiError } from './src/api/client';
      export { parseWorkbenchFilters } from './src/lib/secretWorkbench';
    `,
    resolveDir: resolve('.'),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  packages: 'external',
  loader: { '.css': 'empty' },
  alias: { '@': resolve('src') },
})
const modulePath = resolve('node_modules/.secret-overview-errors-test.mjs')
await writeFile(modulePath, bundle.outputFiles[0].contents)
const { SecretOverviewPage, ApiError, parseWorkbenchFilters } = await import(pathToFileURL(modulePath).href)
after(() => unlink(modulePath))

function renderError(error) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, gcTime: Infinity } } })
  const { filters } = parseWorkbenchFilters(new URLSearchParams())
  const query = client.getQueryCache().build(client, { queryKey: ['secret-summary', filters] })
  query.setState({ status: 'error', error, fetchStatus: 'idle' })
  try {
    return renderToStaticMarkup(createElement(QueryClientProvider, { client },
      createElement(MemoryRouter, { initialEntries: ['/secrets'] }, createElement(SecretOverviewPage))))
  } finally {
    client.clear()
  }
}

test('overview identifies denied access without displaying a server failure or empty results', () => {
  const html = renderError(new ApiError(403, 'FORBIDDEN', 'internal-error-detail'))
  assert.match(html, /시크릿을 조회할 권한이 없어요/)
  assert.doesNotMatch(html, /현황을 불러오지 못했어요|조회 기준을 다시 확인해 주세요|internal-error-detail|팀의 할 일/)
})

for (const status of [404, 409]) {
  test(`overview keeps the snapshot guidance for HTTP ${status}`, () => {
    const html = renderError(new ApiError(status, null, 'internal-error-detail'))
    assert.match(html, /조회 기준을 다시 확인해 주세요/)
    assert.doesNotMatch(html, /시크릿을 조회할 권한이 없어요|현황을 불러오지 못했어요|internal-error-detail/)
  })
}

for (const error of [new ApiError(500, null, 'internal-error-detail'), new TypeError('Failed to fetch')]) {
  test(`overview shows the load failure for ${error instanceof ApiError ? 'HTTP 500' : 'a network error'}`, () => {
    const html = renderError(error)
    assert.match(html, /현황을 불러오지 못했어요/)
    assert.doesNotMatch(html, /시크릿을 조회할 권한이 없어요|조회 기준을 다시 확인해 주세요|internal-error-detail|Failed to fetch/)
  })
}
