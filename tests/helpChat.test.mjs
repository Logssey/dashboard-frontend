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

test('known incident names map to fixed CVE ids and explicit CVEs win', () => {
  assert.deepEqual(help.incidentCves('Log4Shell 터졌어 뭐부터 봐?'), { cves: ['CVE-2021-44228', 'CVE-2021-45046'], name: 'Log4Shell' })
  assert.deepEqual(help.incidentCves('log4j 취약점 우리 괜찮아?').cves, ['CVE-2021-44228', 'CVE-2021-45046'])
  assert.deepEqual(help.incidentCves('PHP-CGI 원격 코드 실행 터졌대').cves, ['CVE-2024-4577'])
  assert.deepEqual(help.incidentCves('Log4Shell인데 CVE-2021-44832도 봐줘'), { cves: ['CVE-2021-44832'] })
  assert.deepEqual(help.incidentCves('cve-2021-44228, CVE-2021-44228, CVE-2024-4577'), { cves: ['CVE-2021-44228', 'CVE-2024-4577'] })
  assert.deepEqual(help.incidentCves('대응 건은 어떻게 만들어요?'), { cves: [] })
  for (const alias of help.INCIDENT_ALIASES) {
    assert.ok(alias.cves.length > 0 && alias.cves.every((cve) => help.usableCve(cve) === cve), alias.name)
  }
})

test('incident talk is recognised by fixed words only', () => {
  for (const q of ['우리 서버 뚫린 것 같아', '해킹당했어 어떡해', '랜섬웨어 걸렸어', '키가 유출된 것 같아', '이상한 접속이 보여']) {
    assert.equal(help.looksLikeIncident(q), true, q)
  }
  for (const q of ['대응 건은 어떻게 만들어요?', 'CSV로 내보내려면?', '스캔은 어떻게 시작해요?']) {
    assert.equal(help.looksLikeIncident(q), false, q)
  }
})

test('incident status reads runtime, secret, IaC and vulnerability APIs and survives failures', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options })
    const url = new URL(path, 'http://local.test')
    if (url.pathname === '/api/v1/runtime/overview') {
      return Response.json({
        summary: { unreviewedFindingCount: 4, affectedWorkloadCount: 2 },
        findingsByRule: [
          { title: 'Terminal shell in container', count: 3 },
          { title: 'Unexpected outbound connection', count: 1 },
          { title: 'Zero', count: 0 },
          { title: 7, count: 9 },
        ],
        sensorSummary: { healthy: 1, degraded: 0, offline: 1, unknown: 0 },
      })
    }
    if (url.pathname === '/api/v1/secrets/summary') return new Response(JSON.stringify({ code: 'FORBIDDEN' }), { status: 403, headers: { 'content-type': 'application/json' } })
    if (url.pathname === '/api/v1/iac/summary') return Response.json({ metrics: { openPaths: 72, tier1OpenPaths: 54, drifts: 5, stateSecrets: 2 } })
    if (url.pathname === '/api/v1/reach/summary') return Response.json({ basis: { unscannedRunning: [{}] } })
    return Response.json({ items: [], hasNext: false, totalCount: url.searchParams.get('severity') === 'CRITICAL,HIGH' ? 2 : 5 })
  }
  try {
    const status = await help.fetchIncidentStatus()
    assert.deepEqual(status.runtime.topRules, [
      { title: 'Terminal shell in container', count: 3 },
      { title: 'Unexpected outbound connection', count: 1 },
    ])
    assert.equal(status.keys, null)
    assert.deepEqual(status.unavailable, [{ source: 'keys', denied: true }])
    assert.deepEqual(status.exposure, { openPaths: 72, tier1OpenPaths: 54, drifts: 5, stateSecrets: 2 })
    assert.deepEqual(status.vuln, { runningReachableSevere: 2, runningReachable: 5, unscannedRunning: 1 })
    for (const call of calls) {
      assert.ok(/^\/api\/v1\/(reach|runtime|secrets|iac)\//.test(call.path), call.path)
      assert.ok(!call.options?.method || call.options.method === 'GET', call.path)
    }
    const groups = help.incidentRows(status)
    assert.deepEqual(groups.map((g) => g.title.split(' ')[0]), ['의심스러운', '활발한', '바깥에서', '열린'])
    assert.equal(groups[1].note, '볼 권한이 없어요')
    const list = help.incidentPriorities(status, ['key'])
    assert.ok(!list.some((p) => p.text.startsWith('뚫린 서버가 쓰던')), 'denied key status replaces the fixed key check')
    const denied = list.find((p) => p.text.startsWith('시크릿 키 현황을 볼 권한이 없어요'))
    assert.equal(denied.topic, 'key')
    assert.deepEqual(list.slice(0, 4).map((p) => p.topic), ['evidence', 'blind', 'key', 'key'], 'key type moves key items right after evidence and blind spots')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('incident status fails only when every source fails', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('', { status: 500 })
  try {
    await assert.rejects(help.fetchIncidentStatus())
  } finally {
    globalThis.fetch = originalFetch
  }
})

const fullStatus = () => ({
  runtime: { unreviewedFindings: 4, affectedWorkloads: 2, topRules: [{ title: 'Shell', count: 3 }], sensors: { healthy: 2, degraded: 0, offline: 1, unknown: 0 } },
  keys: { validKeyCases: 2, crossEnvironmentAlerts: 1, reviewRequiredLocations: 3 },
  exposure: { openPaths: 10, tier1OpenPaths: 4, drifts: 2, stateSecrets: 0 },
  vuln: { runningReachableSevere: 1, runningReachable: 2, unscannedRunning: 1 },
  unavailable: [],
})

test('priorities put suspicious attempts and blind spots first, then live keys', () => {
  const list = help.incidentPriorities(fullStatus())
  assert.deepEqual(list.map((p) => p.topic), ['evidence', 'blind', 'key', 'key', 'exposure', 'vuln', 'config', 'coverage', 'config'])
  assert.ok(list[0].text.startsWith('의심스러운 시도') && list[0].text.includes('Shell 3건'))
  assert.ok(list[2].text.startsWith('활발한 키') && list[2].text.includes('2건') && list[2].text.includes('실키 경고 1건'))
  for (const p of list) assert.ok(p.screen in help.HELP_SCREEN_ROUTES, p.screen)
})

test('incident types move their data up without dropping anything', () => {
  assert.deepEqual(help.incidentTypes('AWS 키가 유출된 것 같아'), ['key'])
  assert.deepEqual(help.incidentTypes('랜섬웨어 걸려서 서비스가 멈췄어'), ['ransomware'])
  assert.deepEqual(help.incidentTypes('S3 버킷이 공개됐어'), ['cloud'])
  assert.deepEqual(help.incidentTypes('관리자 계정이 탈취됐어'), ['account'])
  assert.deepEqual(help.incidentTypes('Log4Shell 터졌어'), ['web'])
  assert.deepEqual(help.incidentTypes('서버에서 이상한 프로세스가 돌아'), ['intrusion'])

  const base = help.incidentPriorities(fullStatus())
  const web = help.incidentPriorities(fullStatus(), ['web'])
  assert.deepEqual(web.slice(0, 4).map((p) => p.topic), ['evidence', 'blind', 'vuln', 'exposure'])
  const cloud = help.incidentPriorities(fullStatus(), ['cloud'])
  assert.deepEqual(cloud.slice(2, 4).map((p) => p.topic), ['exposure', 'config'])
  const ransom = help.incidentPriorities(fullStatus(), ['ransomware'])
  assert.equal(ransom[0].topic, 'isolate')
  assert.equal(ransom[0].screen, 'OUTSIDE')
  for (const variant of [web, cloud]) {
    assert.deepEqual([...variant.map((p) => p.text)].sort(), [...base.map((p) => p.text)].sort())
  }
})

test('quiet environments still get the fixed key and account checks', () => {
  const quiet = {
    runtime: { unreviewedFindings: 0, affectedWorkloads: 0, topRules: [], sensors: { healthy: 1, degraded: 0, offline: 0, unknown: 0 } },
    keys: { validKeyCases: 0, crossEnvironmentAlerts: 0, reviewRequiredLocations: 0 },
    exposure: { openPaths: 0, tier1OpenPaths: 0, drifts: 0, stateSecrets: 0 },
    vuln: { runningReachableSevere: 0, runningReachable: 0, unscannedRunning: 0 },
    unavailable: [],
  }
  assert.deepEqual(help.incidentPriorities(quiet).map((p) => p.screen), ['COMPLIANCE', 'SECRET_FINDINGS'])
  const blind = help.incidentPriorities({ ...quiet, runtime: { ...quiet.runtime, sensors: { healthy: 0, degraded: 0, offline: 0, unknown: 6 } } })
  assert.equal(blind[0].screen, 'OUTSIDE')
  assert.ok(blind[0].text.includes('정상인 런타임 센서가 없어'))
})

test('stored incident fields are checked when the conversation is loaded', () => {
  const store = new Map()
  const originalStorage = globalThis.sessionStorage
  globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }
  try {
    store.set('logssey.help.chat', JSON.stringify([
      { role: 'user', text: 'old', impactCve: 'CVE-2021-44228' },
      { role: 'user', text: 'new', impactCves: ['CVE-2024-4577', 'x&size=100'], incidentName: 'Log4Shell', incidentStatus: true, incidentTypes: ['key', 'evil', 'key'] },
      { role: 'user', text: 'bad', incidentName: '<script>', incidentStatus: 'yes' },
    ]))
    const [old, fresh, bad] = help.loadHelpMessages()
    assert.deepEqual(old.impactCves, ['CVE-2021-44228'])
    assert.ok(!('impactCve' in old))
    assert.deepEqual(fresh.impactCves, ['CVE-2024-4577'])
    assert.equal(fresh.incidentName, 'Log4Shell')
    assert.equal(fresh.incidentStatus, true)
    assert.deepEqual(fresh.incidentTypes, ['key'])
    assert.ok(!('incidentName' in bad) && !('incidentStatus' in bad))
  } finally {
    globalThis.sessionStorage = originalStorage
  }
})

test('incident boxes do not talk to the help API or the stored conversation', async () => {
  const source = await readFile('src/components/HelpChat.tsx', 'utf8')
  const box = source.slice(source.indexOf('function IncidentStatusBox'), source.indexOf('function CveImpactBox'))
  assert.ok(box.includes('fetchIncidentStatus'))
  assert.ok(!/askHelp|setMessages/.test(box))
  const messages = [{ role: 'user', text: '서버 뚫렸어', incidentStatus: true }, { role: 'assistant', text: '답' }]
  assert.deepEqual(help.buildHistory(messages), [{ role: 'user', text: '서버 뚫렸어' }, { role: 'assistant', text: '답' }])
})

const snap = (over = {}) => ({
  runtimeUnreviewed: 0, sensorsHealthy: 3, sensorsTotal: 3, validKeys: 0, crossAlerts: 0, severeReachable: 2, tier1Paths: 5, drifts: 1, ...over,
})

test('new signals fire only for the four chosen kinds when things get worse', () => {
  assert.deepEqual(help.incidentSignals(snap(), snap()), [])
  const worse = help.incidentSignals(snap(), snap({ runtimeUnreviewed: 2, validKeys: 1, crossAlerts: 1, sensorsHealthy: 1, tier1Paths: 7 }))
  assert.deepEqual(worse.map((s) => s.kind), ['runtime', 'keys', 'sensors', 'exposure'])
  assert.ok(worse[0].text.includes('2건'))
  assert.ok(worse[1].text.includes('살아 있는 키 대응 건 +1') && worse[1].text.includes('실키 경고 +1'))
  assert.ok(worse[2].text.includes('3개에서 1개로'))
  assert.equal(worse[3].screen, 'IAC')
  assert.equal(help.incidentSignals(snap(), snap({ severeReachable: 3 }))[0].screen, 'VULN_FINDINGS')
  // getting better never alerts, and unknown sources are skipped
  assert.deepEqual(help.incidentSignals(snap({ runtimeUnreviewed: 5 }), snap({ runtimeUnreviewed: 1, drifts: 0 })), [])
  assert.deepEqual(help.incidentSignals(snap(), snap({ validKeys: null, crossAlerts: null, runtimeUnreviewed: null })), [])
  for (const s of worse) assert.ok(s.screen in help.HELP_SCREEN_ROUTES, s.screen)
})

test('a fresh tab alerts on open runtime detections and live keys, not on old backlog', () => {
  const now = snap({ runtimeUnreviewed: 4, validKeys: 2, crossAlerts: 0 })
  const signals = help.incidentSignals(help.firstSeenBaseline(now), now)
  assert.deepEqual(signals.map((s) => s.kind), ['runtime', 'keys'])
  const quiet = snap()
  assert.deepEqual(help.incidentSignals(help.firstSeenBaseline(quiet), quiet), [])
})

test('signal snapshot follows the incident status and the question carries no numbers', () => {
  const status = {
    runtime: { unreviewedFindings: 4, affectedWorkloads: 2, topRules: [], sensors: { healthy: 1, degraded: 1, offline: 0, unknown: 1 } },
    keys: null,
    exposure: { openPaths: 9, tier1OpenPaths: 3, drifts: 2, stateSecrets: 0 },
    vuln: { runningReachableSevere: 1, runningReachable: 2, unscannedRunning: 0 },
    unavailable: [{ source: 'keys', denied: true }],
  }
  assert.deepEqual(help.signalSnapshot(status), {
    runtimeUnreviewed: 4, sensorsHealthy: 1, sensorsTotal: 3, validKeys: null, crossAlerts: null, severeReachable: 1, tier1Paths: 3, drifts: 2,
  })
  const question = help.signalQuestion(help.incidentSignals(snap(), snap({ runtimeUnreviewed: 12, validKeys: 3, tier1Paths: 9 })))
  assert.ok(!/\d/.test(question), question)
  assert.ok(help.looksLikeIncident(question))
  assert.ok(question.length <= help.HELP_QUESTION_MAX)
})

test('seen signals are stored per tab, checked on load and cleared on logout', () => {
  const store = new Map()
  const originalStorage = globalThis.sessionStorage
  globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }
  try {
    assert.equal(help.loadSeenSignals(), null)
    help.saveSeenSignals(snap({ drifts: 4 }))
    assert.equal(help.loadSeenSignals().drifts, 4)
    store.set('logssey.help.signals.seen', JSON.stringify({ runtimeUnreviewed: -1, drifts: 'x', tier1Paths: 2 }))
    const loaded = help.loadSeenSignals()
    assert.equal(loaded.runtimeUnreviewed, null)
    assert.equal(loaded.drifts, null)
    assert.equal(loaded.tier1Paths, 2)
    help.clearHelpMessages()
    assert.equal(help.loadSeenSignals(), null)
  } finally {
    globalThis.sessionStorage = originalStorage
  }
})

test('signal polling uses the shared incident status query and never the help API', async () => {
  const source = await readFile('src/components/HelpChat.tsx', 'utf8')
  const block = source.slice(source.indexOf('// 새 보안 신호'), source.indexOf('const acknowledgeSignals'))
  assert.ok(block.includes('queryFn: fetchIncidentStatus'))
  assert.ok(block.includes('refetchIntervalInBackground: false'))
  assert.ok(!/askHelp/.test(block))
  assert.ok(source.includes('send(signalQuestion(signals))'))
  assert.ok(source.includes('const SIGNAL_POLL_MS = 15 * 60_000'), 'automatic check every 15 minutes')
  const now = source.slice(source.indexOf('const checkSignalsNow'), source.indexOf('const signalCheckedAt'))
  assert.ok(now.includes('signalStatus.refetch()') && now.includes('isFetching'), 'check-now refetches at once and not twice')
  assert.ok(source.includes('onClick={checkSignalsNow}'))
  assert.equal(help.signalCheckTime(new Date(2026, 10, 24, 9, 5).getTime()), '09:05')
})

test('customer data is masked in the browser with the same rules as the server', () => {
  assert.equal(help.maskPrivate('담당자 kim.dev+ops@example.co.kr 에게 알렸어요'), '담당자 [이메일] 에게 알렸어요')
  assert.equal(help.maskPrivate('203.0.113.7 에서 접속, 내부망 10.0.0.0/8'), '[IP] 에서 접속, 내부망 [IP]')
  assert.equal(help.maskPrivate('2001:db8::1 과 fe80::1ff:fe23:4567:890a'), '[IP] 과 [IP]')
  assert.equal(help.maskPrivate('연락처 010-1234-5678, 02 345 6789, +82 10-9876-5432'), '연락처 [전화번호], [전화번호], [전화번호]')
  assert.equal(help.maskPrivate('주민번호 900101-1234567'), '주민번호 [주민번호]')
  assert.equal(help.maskPrivate('카드 4111 1111 1111 1111'), '카드 [카드번호]')
  for (const text of ['CVE-2021-44228 우리 영향 있어?', 'log4j 2.17.1로 올렸어요', '10:30:00에 탐지가 떴어요', '2026-11-25 사고 기록',
    'Finding 3건, 공격 경로 72개', 'Class::method 같은 코드', '포트 8080 열려 있어요']) {
    assert.equal(help.maskPrivate(text), text, text)
  }
})

test('earlier turns are masked again when they are resent', () => {
  const history = help.buildHistory([
    { role: 'user', text: '고객 lee@example.com 건이에요' },
    { role: 'assistant', text: '010-2222-3333 으로 연락하세요' },
  ])
  assert.deepEqual(history.map((turn) => turn.text), ['고객 [이메일] 건이에요', '[전화번호] 으로 연락하세요'])
})

test('only yes/no signals go to the AI, and unknown sources are left out', () => {
  const status = {
    runtime: { unreviewedFindings: 4, affectedWorkloads: 2, topRules: [{ title: 'Shell', count: 4 }], sensors: { healthy: 0, degraded: 0, offline: 0, unknown: 6 } },
    keys: null,
    exposure: { openPaths: 72, tier1OpenPaths: 54, drifts: 5, stateSecrets: 0 },
    vuln: { runningReachableSevere: 1, runningReachable: 2, unscannedRunning: 2 },
    unavailable: [{ source: 'keys', denied: true }],
  }
  const signals = help.signalsForAI(status)
  assert.deepEqual(signals, {
    runtimeUnreviewed: true, sensorsDown: true, openPaths: true, drifts: true, severeReachable: true, unscanned: true,
  })
  assert.ok(Object.values(signals).every((value) => typeof value === 'boolean'))
  assert.ok(!JSON.stringify(signals).match(/\d|Shell/), 'no counts or names')
  assert.deepEqual(help.signalsForAI(null), {})
})

test('signals are sent only for incident questions', async () => {
  const originalFetch = globalThis.fetch
  const originalDocument = globalThis.document
  const bodies = []
  globalThis.document = { cookie: 'XSRF-TOKEN=test-csrf' }
  globalThis.fetch = async (_path, options) => {
    bodies.push(JSON.parse(options.body))
    return Response.json({ answer: '답', grounded: true, sources: [], remainingToday: 1, cached: false })
  }
  try {
    await help.askHelp('서버 뚫렸어', '요약', [], undefined, { sensorsDown: true })
    await help.askHelp('로그아웃은?', '요약', [], undefined, {})
    await help.askHelp('로그아웃은?', '요약', [])
    assert.deepEqual(bodies[0].signals, { sensorsDown: true })
    assert.ok(!('signals' in bodies[1]) && !('signals' in bodies[2]))
    const source = await readFile('src/components/HelpChat.tsx', 'utf8')
    assert.ok(source.includes('signals: incident ? signalsForAI(signalStatus.data) : undefined'))
    assert.ok(source.includes('const question = maskPrivate(typed)'))
  } finally {
    globalThis.fetch = originalFetch
    globalThis.document = originalDocument
  }
})

test('report draft: AI sentences plus code-filled time and Logssey numbers, notes never stored', async () => {
  const draft = { summary: '웹 서버 2대를 격리했습니다.', checked: ['런타임 탐지를 확인했습니다.'], actions: ['14시에 웹 서버 2대를 격리했습니다.'], remaining: [] }
  const status = {
    runtime: { unreviewedFindings: 0, affectedWorkloads: 0, topRules: [], sensors: { healthy: 0, degraded: 0, offline: 0, unknown: 6 } },
    keys: null,
    exposure: { openPaths: 72, tier1OpenPaths: 54, drifts: 5, stateSecrets: 0 },
    vuln: { runningReachableSevere: 1, runningReachable: 2, unscannedRunning: 2 },
    unavailable: [{ source: 'keys', denied: true }],
  }
  const at = new Date(2026, 10, 25, 14, 3).getTime()
  const now = new Date(2026, 10, 25, 14, 5).getTime()
  const text = help.reportText(draft, status, at, now)
  assert.ok(text.startsWith('보안 사고 대응 기록 (초안)\n작성 시각: 2026-11-25 14:05 (자동)'))
  assert.ok(text.includes('Logssey 현황 (2026-11-25 14:03 조회, 자동):'))
  assert.ok(text.includes('- 열린 공격 경로 72개(1순위 54개), 드리프트 5건'))
  assert.ok(text.includes('- 시크릿: 볼 권한 없음'))
  assert.ok(text.includes('요약: 웹 서버 2대를 격리했습니다.'))
  assert.ok(text.includes('남은 일:\n- (메모에 없음)'))
  assert.ok(text.includes('담당 부서와 확인'))

  const originalFetch = globalThis.fetch
  const originalDocument = globalThis.document
  const calls = []
  globalThis.document = { cookie: 'XSRF-TOKEN=test-csrf' }
  globalThis.fetch = async (path, options) => {
    calls.push({ path, body: JSON.parse(options.body) })
    return Response.json({ ...draft, remainingToday: 3 })
  }
  try {
    await help.draftReport('14시 격리')
    assert.equal(calls[0].path, '/api/v1/help/report')
    assert.deepEqual(calls[0].body, { memo: '14시 격리' })
  } finally {
    globalThis.fetch = originalFetch
    globalThis.document = originalDocument
  }
  const source = await readFile('src/components/HelpChat.tsx', 'utf8')
  const block = source.slice(source.indexOf('// 사고 보고서 초안'), source.indexOf('const copyReport'))
  assert.ok(block.includes('const notes = maskPrivate(typed)'))
  assert.ok(!/sessionStorage|saveHelpMessages|setMessages/.test(block), 'notes stay on this screen only')
})

test('digests and commit hashes are not treated as keys, other long tokens still are', () => {
  const digest = 'sha256:' + '4f9e2c1a7b3d5e6f'.repeat(4)
  const commit = '9c1e4b7a2d5f8e3c6b9a1d4e7f2a5c8b3e6d9f1a'
  assert.equal(help.looksLikeSecret(`이미지 ${digest} 스캔 결과는?`), false)
  assert.equal(help.looksLikeSecret(`커밋 ${commit} 기준으로 스캔`), false)
  assert.equal(help.maskPrivate(digest), digest)
  assert.equal(help.maskPrivate(commit), commit)
  assert.equal(help.looksLikeSecret('값 ' + '4f9e2c1a7b3d5e6f'.repeat(4)), true)
  assert.equal(help.looksLikeSecret(`값 ${commit}a`), true)
  assert.equal(help.looksLikeSecret(`sha256:${randomText(48)}`), true)
})

test('digits glued to letters are not masked as phone or card numbers', () => {
  assert.equal(help.maskPrivate('build a01012345678b'), 'build a01012345678b')
  assert.equal(help.maskPrivate('id x4111111111111111y'), 'id x4111111111111111y')
  assert.equal(help.maskPrivate('전화 010-1234-5678로'), '전화 [전화번호]로')
})

test('playbook-only answers are labelled as not written by AI', async () => {
  const store = new Map()
  const originalStorage = globalThis.sessionStorage
  globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }
  try {
    store.set('logssey.help.chat', JSON.stringify([{ role: 'assistant', text: '고정 10단계', withoutAi: true }, { role: 'assistant', text: 'x', withoutAi: 'yes' }]))
    const [fixed, odd] = help.loadHelpMessages()
    assert.equal(fixed.withoutAi, true)
    assert.ok(!('withoutAi' in odd))
  } finally {
    globalThis.sessionStorage = originalStorage
  }
  const source = await readFile('src/components/HelpChat.tsx', 'utf8')
  assert.ok(source.includes("...(response.withoutAi === true ? { withoutAi: true } : {})"))
  assert.ok(source.includes('AI가 만든 답이 아니에요'))
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
