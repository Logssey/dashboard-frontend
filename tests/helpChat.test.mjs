import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, test } from 'node:test'
import { build } from 'esbuild'

const bundled = await build({
  stdin: {
    contents: "export * from './src/api/help'; export * from './src/lib/helpChat'; export { sectionPages } from './src/lib/routes';",
    resolveDir: resolve('.'),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic', packages: 'external', alias: { '@': resolve('src') },
})
const bundlePath = resolve('node_modules/.help-chat-test.mjs')
await writeFile(bundlePath, bundled.outputFiles[0].contents)
const help = await import(pathToFileURL(bundlePath).href)
after(() => unlink(bundlePath))

// 실제 키가 아닌, 테스트마다 새로 만드는 무작위 가짜 값
const alnum = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const randomText = (length, alphabet = alnum) =>
  Array.from(randomBytes(length), (byte) => alphabet[byte % alphabet.length]).join('')

test('help chat calls only our backend with CSRF and sends page and history', async () => {
  const originalFetch = globalThis.fetch
  const originalDocument = globalThis.document
  const calls = []
  globalThis.document = { cookie: 'XSRF-TOKEN=test-csrf' }
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options })
    return new Response(JSON.stringify({ answer: '답', grounded: true, sources: [], remainingToday: 39, cached: false }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }
  try {
    const history = [{ role: 'user', text: '앞 질문' }, { role: 'assistant', text: '앞 답' }]
    const response = await help.askHelp('대응 건은 어떻게 만들어요?', '대응 관리', history)
    assert.equal(response.answer, '답')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].path, '/api/v1/help/chat')
    assert.equal(calls[0].options.method, 'POST')
    assert.equal(calls[0].options.headers.get('X-XSRF-TOKEN'), 'test-csrf')
    assert.deepEqual(JSON.parse(calls[0].options.body), { question: '대응 건은 어떻게 만들어요?', page: '대응 관리', history })
  } finally {
    globalThis.fetch = originalFetch
    globalThis.document = originalDocument
  }
})

test('credential-shaped questions are blocked in the browser', () => {
  assert.equal(help.looksLikeSecret(`이 키 맞아요? sk-ant-${randomText(40)}`), true)
  assert.equal(help.looksLikeSecret(`ghp_${randomText(36)}`), true)
  assert.equal(help.looksLikeSecret(`AKIA${randomText(16, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')}`), true)
  assert.equal(help.looksLikeSecret(`값 ${randomText(48)}`), true)
  assert.equal(help.looksLikeSecret('대응 건은 어떻게 만들어요?'), false)
  assert.equal(help.looksLikeSecret('AKIA로 시작하는 키 형식은 어떻게 등록해요?'), false)
})

test('history keeps only answered pairs, newest six messages', () => {
  const messages = []
  for (let i = 0; i < 5; i++) messages.push({ role: 'user', text: `q${i}` }, { role: 'assistant', text: `a${i}` })
  messages.push({ role: 'user', text: 'failed' }, { role: 'assistant', text: '오류', error: true })
  messages.push({ role: 'user', text: 'pending' })
  const history = help.buildHistory(messages)
  assert.equal(history.length, 6)
  assert.deepEqual(history.map((turn) => turn.text), ['q2', 'a2', 'q3', 'a3', 'q4', 'a4'])
  assert.equal(history[0].role, 'user')
  assert.equal(history.at(-1).role, 'assistant')
})

test('every page gets at least one suggested question', () => {
  for (const page of ['통합 현황', '키·노출 위치', '대응 관리', '연결 관리', '컴플라이언스', 'Finding 목록', '알 수 없는 화면']) {
    assert.ok(help.suggestedQuestions(page).length > 0, page)
  }
  for (const page of ['요약', 'Finding 목록', '워크로드', '스캔']) {
    assert.ok(help.suggestedQuestions(page).some((q) => q.includes('Log4Shell')), page)
  }
})

test('answer sources start folded behind a "근거 N개 보기" toggle', async () => {
  assert.equal(help.sourcesToggleLabel(3), '근거 3개 보기')
  const source = await readFile('src/components/HelpChat.tsx', 'utf8')
  const block = source.slice(source.indexOf('<details className="help-sources"'), source.indexOf('</details>'))
  assert.ok(block.length > 0, 'sources are wrapped in <details>')
  assert.ok(!/<details[^>]*\bopen\b/.test(block), 'sources are folded by default')
  assert.ok(block.includes('sourcesToggleLabel(message.sources.length)'))
  assert.ok(!source.includes('dangerouslySetInnerHTML'))
})

test('checklist mode is sent only when asked for', async () => {
  const originalFetch = globalThis.fetch
  const originalDocument = globalThis.document
  const bodies = []
  globalThis.document = { cookie: 'XSRF-TOKEN=test-csrf' }
  globalThis.fetch = async (_path, options) => {
    bodies.push(JSON.parse(options.body))
    return new Response(JSON.stringify({ answer: '답', grounded: true, sources: [], remainingToday: 1, cached: false, cards: null }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }
  try {
    await help.askHelp('Log4Shell 터졌어', 'Finding 목록', [], 'checklist')
    await help.askHelp('대응 건은?', 'Finding 목록', [])
    assert.equal(bodies[0].mode, 'checklist')
    assert.ok(!('mode' in bodies[1]))
  } finally {
    globalThis.fetch = originalFetch
    globalThis.document = originalDocument
  }
})

test('card screen keys map only to fixed internal routes', () => {
  // 백엔드 HelpChecklist.SCREENS와 같은 목록 (HelpChecklistTest가 반대쪽을 확인)
  const expected = ['COMPLIANCE', 'IAC', 'OUTSIDE', 'RUNTIME', 'SECRET_CASES', 'SECRET_FINDINGS',
    'VULN_FINDINGS', 'VULN_SCANS', 'VULN_SUMMARY', 'VULN_WORKLOADS']
  assert.deepEqual(Object.keys(help.HELP_SCREEN_ROUTES).sort(), expected)
  for (const [key, route] of Object.entries(help.HELP_SCREEN_ROUTES)) {
    if (route === null) continue
    const page = help.sectionPages.find((p) => p.path === route.path)
    assert.ok(page, `${key} → ${route.path} is a real page`)
    assert.equal(page.title, route.title, key)
    assert.ok(route.path.startsWith('/') && !route.path.startsWith('//') && !route.path.includes('?'), key)
  }
  assert.equal(help.helpScreenRoute('OUTSIDE'), undefined)
  for (const bad of ['ADMIN', '/vulnerabilities', 'https://example.invalid', '__proto__', 'constructor', 'toString', null, 7]) {
    assert.equal(help.helpScreenRoute(bad), undefined, String(bad))
  }
  assert.equal(help.helpScreenRoute('RUNTIME').path, '/runtime')
})

test('only well-formed cards are drawn, otherwise the text answer is shown', () => {
  const card = { checks: [1], titles: ['1. 무엇이 터졌나'], screen: 'VULN_FINDINGS', focus: 'CVE 검색' }
  assert.deepEqual(help.usableCards([card]), [card])
  assert.equal(help.usableCards(null), undefined)
  assert.equal(help.usableCards([]), undefined)
  assert.equal(help.usableCards([{ ...card, titles: [] }]), undefined)
  assert.equal(help.usableCards([{ ...card, focus: 3 }]), undefined)
  assert.equal(help.usableCards(Array(11).fill(card)), undefined)
})

test('the open-screen button navigates only through the route table', async () => {
  const source = await readFile('src/components/HelpChat.tsx', 'utf8')
  assert.ok(source.includes('const route = helpScreenRoute(card.screen)'))
  assert.ok(source.includes('if (route) navigate(route.path)'))
  assert.ok(!/navigate\(\s*card\./.test(source))
  assert.ok(!/href=\{/.test(source))
  assert.ok(source.includes("'checklist')"))
})

test('CVE impact counts come from the existing vulnerability API as numbers only', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  const totals = { '': 7, RUNNING: 3, REACHABLE: 2, 'RUNNING|REACHABLE': 1 }
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options })
    const url = new URL(path, 'http://local.test')
    if (url.pathname === '/api/v1/reach/summary') {
      return Response.json({ basis: { applied: 'RUNNING', unscannedRunning: [{ name: 'a' }, { name: 'b' }] } })
    }
    const key = [url.searchParams.get('deployment'), url.searchParams.get('status')].filter(Boolean).join('|')
    return Response.json({ items: [{ id: 1 }], hasNext: true, nextCursor: 'x', totalCount: totals[key] })
  }
  try {
    const impact = await help.fetchCveImpact('CVE-2021-44228')
    assert.deepEqual(impact, {
      cve: 'CVE-2021-44228', total: 7, running: 3, reachable: 2, runningReachable: 1, unscannedRunning: 2, basis: 'RUNNING',
    })
    assert.equal(calls.length, 5)
    for (const call of calls) {
      assert.ok(call.path.startsWith('/api/v1/reach/'), call.path)
      assert.ok(!call.options?.method || call.options.method === 'GET', call.path)
    }
    for (const call of calls.filter((c) => c.path.startsWith('/api/v1/reach/findings'))) {
      const params = new URL(call.path, 'http://local.test').searchParams
      assert.equal(params.get('cveContains'), 'CVE-2021-44228')
      assert.equal(params.get('size'), '1')
      assert.equal(params.get('include'), 'total')
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('CVE numbers are picked from questions and only exact ids are reused from storage', () => {
  assert.equal(help.findCve('cve-2021-44228 터졌어'), 'CVE-2021-44228')
  assert.equal(help.findCve('Log4Shell 터졌어'), undefined)
  assert.equal(help.usableCve('CVE-2024-4577'), 'CVE-2024-4577')
  for (const bad of ['CVE-2024-4577&size=100', 'cve-2024-4577', ' CVE-2024-4577', 7, null]) {
    assert.equal(help.usableCve(bad), undefined, String(bad))
  }
})

test('impact lines warn that zero is not safe and point at unscanned workloads', () => {
  const base = { cve: 'CVE-2021-44228', total: 0, running: 0, reachable: 0, runningReachable: 0, unscannedRunning: 2, basis: 'LATEST' }
  const zero = help.impactLines(base)
  assert.deepEqual(zero.rows[0], ['Finding 전체', '0건'])
  assert.ok(zero.notes.some((n) => n.includes('안전하다는 뜻은 아니에요')))
  assert.ok(zero.notes.some((n) => n.includes('스캔 없는 워크로드')))
  assert.ok(zero.notes.some((n) => n.includes('최신 스캔 기준')))
  const hit = help.impactLines({ ...base, total: 4, running: 2, reachable: 1, runningReachable: 1, unscannedRunning: null, basis: 'RUNNING' })
  assert.equal(hit.rows.length, 4)
  assert.ok(hit.notes[0].includes('Finding부터 처리'))
})

test('impact numbers never enter the history sent to the help API', async () => {
  const messages = [
    { role: 'user', text: 'CVE-2021-44228 우리 영향 있어?', impactCve: 'CVE-2021-44228' },
    { role: 'assistant', text: '체크리스트' },
  ]
  assert.deepEqual(help.buildHistory(messages), [
    { role: 'user', text: 'CVE-2021-44228 우리 영향 있어?' },
    { role: 'assistant', text: '체크리스트' },
  ])
  const source = await readFile('src/components/HelpChat.tsx', 'utf8')
  const box = source.slice(source.indexOf('function CveImpactBox'), source.indexOf('export function HelpChat'))
  assert.ok(box.includes('fetchCveImpact(cve)'))
  assert.ok(!/askHelp|setMessages/.test(box), 'impact box does not talk to the help API or the stored conversation')
})

async function filesUnder(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })
  return entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath ?? entry.path, entry.name))
}

test('frontend source and build output never reference the Claude API or its keys', async () => {
  const roots = ['src', ...(existsSync('dist') ? ['dist'] : [])]
  for (const root of roots) {
    for (const file of await filesUnder(root)) {
      if (!/\.(ts|tsx|js|mjs|css|html)$/.test(file)) continue
      const text = await readFile(file, 'utf8')
      assert.ok(!text.includes('api.anthropic.com'), file)
      assert.ok(!/x-api-key|ANTHROPIC_API_KEY|VITE_[A-Z_]*(ANTHROPIC|CLAUDE)/i.test(text), file)
    }
  }
})
