import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { build } from 'esbuild'

const bundle = await build({ stdin: { contents: "export { SecurityDetailLayout } from './src/components/SecurityDetailLayout'; export { SecurityDetailPage } from './src/pages/SecurityDetailPages';", resolveDir: resolve('.') }, bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, alias: { '@': resolve('src') } })
const file = resolve('node_modules/.security-detail-navigation-test.mjs')
await writeFile(file, bundle.outputFiles[0].contents)
const { SecurityDetailLayout, SecurityDetailPage } = await import(pathToFileURL(file).href)
after(() => unlink(file))

function layout(from) {
  return renderToStaticMarkup(h(MemoryRouter, { initialEntries: [{ pathname: '/vulnerabilities/findings/2176', state: { from } }] }, h(SecurityDetailLayout, { title: '상세', fallback: '/vulnerabilities/findings' }, h('p', null, '검사 근거'))))
}

test('full-page details retain the exact list filters and page on return', () => {
  const html = layout('/vulnerabilities/findings?status=REACHABLE&page=2')
  assert.match(html, /href="\/vulnerabilities\/findings\?status=REACHABLE&amp;page=2"/)
  assert.match(html, /<h1[^>]*>상세/)
  assert.doesNotMatch(html, /<dialog|role="dialog"/)
})

test('details cannot use an external or another security domain as their back link', () => {
  for (const from of ['https://outside.invalid', '//outside.invalid', '/secrets', '/vulnerabilities-other', { href: '/iac' }]) {
    assert.match(layout(from), /href="\/vulnerabilities\/findings"/)
  }
})

test('malformed result IDs stop before loading a detail resource', () => {
  for (const id of ['0', '-1', 'not-an-id', '9007199254740992']) {
    const html = renderToStaticMarkup(h(MemoryRouter, { initialEntries: [`/iac/prs/${id}`] }, h(Routes, null, h(Route, { path: '/iac/prs/:id', element: h(SecurityDetailPage, { kind: 'pr' }) }))))
    assert.match(html, /올바른 결과 주소가 아닙니다/)
    assert.match(html, /href="\/iac\/prs"/)
  }
})
