// Reach 스캔 화면 CI 검사 탭(SCR-05-10) 테스트
import assert from 'node:assert/strict'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { build } from 'esbuild'

const bundled = await build({
  stdin: {
    contents: [
      "export { CiChecksTab, CiCheckResult, parseCheckId, CI_PLAN } from '@/pages/ReachCiChecksTab'",
      "export { VulnerabilityScansPage } from '@/pages/ReachScansPage'",
    ].join('\n'),
    resolveDir: resolve('.'),
    loader: 'ts',
  },
  loader: { '.css': 'empty' },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  packages: 'external',
  alias: { '@': resolve('src') },
})
const bundlePath = resolve('node_modules/.reach-ci-tab-test.mjs')
await writeFile(bundlePath, bundled.outputFiles[0].contents)
const reach = await import(pathToFileURL(bundlePath).href)
after(() => unlink(bundlePath))

const COMMIT = 'bb4639b7e45c21d5ced03a5f541b1982093e0865'

function check(overrides) {
  return {
    id: 1,
    mode: 'PR',
    repository: 'Logssey/service-backend',
    headCommit: COMMIT,
    pullRequest: { number: 123, baseRef: 'main', headRef: 'develop' },
    scanId: 2,
    scanStatus: 'SUCCEEDED',
    policy: 'REPORT_ONLY',
    baselineScanId: null,
    gate: {
      result: 'PASS',
      exitCode: 0,
      reasons: [{ condition: 'NOT_ANALYZED_CRITICAL_HIGH', count: 7, summary: '새 Finding 중 NOT_ANALYZED인 CRITICAL·HIGH 7건' }],
      newFindings: { total: 23, byStatus: { REACHABLE: 0, UNKNOWN: 0, UNREACHABLE: 14, NOT_ANALYZED: 9 } },
    },
    findingsUrl: '/api/v1/reach/findings?scanId=2',
    finishedAt: '2026-11-09T05:14:10Z',
    ...overrides,
  }
}

function render(component, props) {
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(component, props)))
}

function renderPage(queryClient, url) {
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: queryClient },
    createElement(MemoryRouter, { initialEntries: [url] }, createElement(reach.VulnerabilityScansPage))))
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
}

test('check id input takes positive integers only', () => {
  assert.equal(reach.parseCheckId('12'), 12)
  assert.equal(reach.parseCheckId(' #7 '), 7)
  for (const bad of ['0', '-1', 'abc', '1.5', '1e3', '0x10', '', null, '9007199254740993']) {
    assert.equal(reach.parseCheckId(bad), null, String(bad))
  }
})

test('a finished check shows the gate, new findings and links', () => {
  const html = render(reach.CiCheckResult, { check: check() })
  assert.match(html, /검사 #1/)
  assert.match(html, /class="badge reach-pill reach-gate pass">통과/)
  assert.match(html, /리포트 전용/)
  assert.match(html, /title="bb4639b7e45c21d5ced03a5f541b1982093e0865">bb4639b</)
  assert.match(html, /#123<span class="caption"> develop → main/)
  assert.match(html, /href="\/vulnerabilities\/scans\?scan=2"[^>]*>스캔 #2/)
  assert.match(html, /없음 · 모든 Finding을 새 것으로 봐요/)
  assert.match(html, /새 Finding 23건/)
  assert.match(html, /도달 불가<\/span><strong>14<\/strong>/)
  assert.match(html, /도달 가능<\/span><strong>0<\/strong>/)
  assert.match(html, /분석 대상 아님 · CRITICAL·HIGH<\/strong> 7건/)
  assert.match(html, /CI 종료 코드 0 · 리포트 전용이라 이유가 있어도 PR을 막지 않아요/)
  assert.match(html, /href="\/vulnerabilities\/findings\?scan=2"[^>]*>이 검사의 Finding 보기/)
})

test('a failing gate check links the baseline and has no report-only note', () => {
  const html = render(reach.CiCheckResult, {
    check: check({
      policy: 'GATE',
      baselineScanId: 1,
      gate: { result: 'FAIL', exitCode: 1, reasons: [], newFindings: { total: 1, byStatus: { REACHABLE: 1 } } },
    }),
  })
  assert.match(html, /reach-gate fail">실패/)
  assert.match(html, /게이트/)
  assert.match(html, /href="\/vulnerabilities\/scans\?scan=1"[^>]*>스캔 #1/)
  assert.match(html, /걸린 조건이 없어요/)
  assert.match(html, /CI 종료 코드 1<\/p>/)
  assert.match(html, /미확인<\/span><strong>0<\/strong>/)   // 응답에 없는 상태는 0
})

test('without a gate the check says why', () => {
  const running = render(reach.CiCheckResult, { check: check({ scanStatus: 'RUNNING', gate: null, finishedAt: null }) })
  assert.match(running, /분석 결과가 아직 올라오지 않았어요/)
  assert.doesNotMatch(running, /새 Finding/)
  assert.doesNotMatch(running, /끝난 시각/)
  const failed = render(reach.CiCheckResult, { check: check({ scanStatus: 'FAILED', gate: null }) })
  assert.match(failed, /스캔이 실패해 게이트 결과가 없어요/)
  const manual = render(reach.CiCheckResult, { check: check({ mode: 'MANUAL', headCommit: null, pullRequest: null }) })
  assert.doesNotMatch(manual, /<dt>PR<\/dt>/)
  assert.doesNotMatch(manual, /<dt>커밋<\/dt>/)
})

test('the CI tab shows the not-connected notice, lookup and plan', () => {
  const html = render(reach.CiChecksTab, { checkId: null, onCheck: () => {}, onShowPrScans: () => {} })
  assert.match(html, /CI 연동은 아직 연결되지 않았어요/)
  assert.match(html, /스캔 이력의 PR 트리거/)
  assert.match(html, /<label[^>]*for="reach-ci-check-id"[^>]*>검사 ID/)
  assert.doesNotMatch(html, /지우기/)
  assert.equal(reach.CI_PLAN.length, 4)
  for (const label of ['PR', '이미지 빌드', '일정', '수동']) assert.match(html, new RegExp(`<strong>${label}</strong>`))
  assert.equal((html.match(/reach-flag">계획/g) ?? []).length, 4)
})

test('scans page keeps the tab and check id in the address', () => {
  const queryClient = client()
  queryClient.setQueryData(['reach-ci-check', 1], check())
  const ci = renderPage(queryClient, '/vulnerabilities/scans?tab=ci&check=1')
  assert.match(ci, /aria-selected="true" class="tab reach-tab active">CI 검사/)
  assert.match(ci, /검사 #1/)
  assert.match(ci, /value="1"/)
  assert.match(ci, /지우기/)
  assert.doesNotMatch(ci, /필터 초기화/)

  const history = renderPage(client(), '/vulnerabilities/scans')
  assert.match(history, /aria-selected="true" class="tab reach-tab active">스캔 이력/)
  assert.match(history, /필터 초기화/)
  assert.doesNotMatch(history, /실행 계획/)

  const badId = renderPage(client(), '/vulnerabilities/scans?tab=ci&check=abc')
  assert.match(badId, /실행 계획/)
  assert.doesNotMatch(badId, /검사 #/)
})
