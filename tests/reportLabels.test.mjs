import assert from 'node:assert/strict'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, test } from 'node:test'
import { build } from 'esbuild'

const bundled = await build({
  entryPoints: [resolve('src/report/labels.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
})
const bundlePath = resolve('node_modules/.report-labels-test.mjs')
await writeFile(bundlePath, bundled.outputFiles[0].contents)
const labels = await import(pathToFileURL(bundlePath).href)
after(() => unlink(bundlePath))

test('times are shown in KST whatever the browser zone', () => {
  assert.equal(labels.formatTime('2026-11-22T18:30:00Z'), '2026-11-23 03:30 KST')
  assert.equal(labels.formatDay('2026-11-22T18:30:00Z'), '2026-11-23')
  assert.equal(labels.formatTime(null), '— (기록 없음)')
})

test('default period is the last 30 days ending today in KST', () => {
  assert.deepEqual(labels.defaultPeriod(new Date('2026-11-22T18:30:00Z')), { from: '2026-10-24', to: '2026-11-23' })
})

test('default name carries the part, or a [파트명] slot when several parts are picked', () => {
  assert.equal(labels.defaultName(['IAC'], '2026-10-24', '2026-11-23'), '[IaC 보안] 보안 리포트 2026-10-24 ~ 2026-11-23')
  assert.equal(labels.defaultName(['IAC', 'RUNTIME'], '2026-10-24', '2026-11-23'), '[파트명] 보안 리포트 2026-10-24 ~ 2026-11-23')
})

test('the four sections keep their order', () => {
  assert.deepEqual(labels.SECTIONS.map((s) => s.title), ['처리 우선순위', '발견된 취약점', '공통 조치 방안', '부록'])
})

test('due text marks default deadlines', () => {
  const f = (extra) => ({ id: 'a', title: 'a', severity: 'HIGH', response: null, asset: null, location: null, evidence: null,
    foundAt: null, dueAt: null, dueDefault: false, assignee: null, action: null, link: null, ...extra })
  assert.equal(labels.dueText(f({ dueAt: '2026-12-01T00:00:00Z', dueDefault: true })), '2026-12-01 (기본값)')
  assert.equal(labels.dueText(f({})), '—')
})

test('parts from the query keep known parts, even ones without data yet', () => {
  assert.deepEqual(labels.partsFromQuery('IAC,SECRET,NETWORK', ['IAC']), ['IAC', 'SECRET'])
  assert.deepEqual(labels.partsFromQuery(null, ['IAC', 'RUNTIME']), ['IAC'])
  assert.deepEqual(labels.partsFromQuery('RUNTIME', ['IAC', 'RUNTIME']), ['RUNTIME'])
})

test('advice reasons read as plain sentences', () => {
  assert.equal(labels.adviceReason({ reason: 'KEY_STORE_UNAVAILABLE' }), 'Claude 키를 비밀 저장소에서 읽지 못했어요')
  assert.equal(labels.adviceReason({ reason: 'SOMETHING' }), 'AI 추천을 받지 못했어요 (SOMETHING)')
})
