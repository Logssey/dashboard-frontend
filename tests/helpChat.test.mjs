import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, test } from 'node:test'
import { build } from 'esbuild'

const bundled = await build({
  stdin: { contents: "export * from './src/api/help'; export * from './src/lib/helpChat';", resolveDir: resolve('.') },
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
