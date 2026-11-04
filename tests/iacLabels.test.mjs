import assert from 'node:assert/strict'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, test } from 'node:test'
import { build } from 'esbuild'

const bundled = await build({
  entryPoints: [resolve('src/iac/labels.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
})
const bundlePath = resolve('node_modules/.iac-labels-test.mjs')
await writeFile(bundlePath, bundled.outputFiles[0].contents)
const labels = await import(pathToFileURL(bundlePath).href)
after(() => unlink(bundlePath))

const summary = (overrides) => ({
  number: 58, runId: 1, headSha: 'a3f9c21', status: 'DONE', verdict: 'PASS', highestSeverity: null, checkedAt: null,
  pathsAdded: 0, pathsRemoved: 0, removedRoutes: 0, stateReaderIncrease: false, reason: null, ...overrides,
})

test('gate failure always shows as blocked, even without a verdict', () => {
  assert.equal(labels.pullRequestBadge({ status: 'GATE_FAILED', verdict: null }).label, '차단')
  assert.equal(labels.pullRequestBadge({ status: 'DONE', verdict: 'WARN' }).label, '경고')
  assert.equal(labels.pullRequestBadge({ status: 'ANALYZING', verdict: null }).label, '분석 중')
  assert.equal(labels.pullRequestBadge({ status: 'ERROR', verdict: null }).tone, 'critical')
})

test('PR change line lists path and State changes', () => {
  assert.deepEqual(labels.pullRequestChanges(summary({})), [])
  assert.deepEqual(labels.pullRequestChanges(summary({ pathsAdded: 6, stateReaderIncrease: true })),
    ['경로 +6', 'State 읽기 주체 증가'])
  assert.deepEqual(labels.pullRequestChanges(summary({ removedRoutes: 1, pathsRemoved: 60 })), ['경로 −60 (1갈래)'])
  assert.deepEqual(labels.pullRequestChanges(summary({ removedRoutes: 2, pathsRemoved: 2 })), ['경로 −2'])
  assert.deepEqual(labels.pullRequestChanges(summary({ status: 'GATE_FAILED' })), ['② 차단, 경로 계산 안 함'])
})

test('PR link is built only from a positive integer and the fixed repo', () => {
  assert.equal(labels.pullRequestUrl(58), 'https://github.com/Logssey/infrastructure/pull/58')
  for (const bad of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(labels.pullRequestUrl(bad), null)
  }
})

test('every gate rule in policy order has a title and a next step', () => {
  const gateRules = Object.keys(labels.ruleTitle).filter((id) => id.startsWith('gate.'))
  assert.equal(gateRules.length, 13)
  for (const id of gateRules) assert.ok(labels.ruleNextStep(id), id)
  assert.equal(labels.ruleNextStep('path.removed'), null)
})

test('unknown remediation template falls back without throwing', () => {
  assert.equal(labels.remediationText('imdsv2_required').title, 'EC2 메타데이터를 IMDSv2 로만 받기')
  assert.equal(labels.remediationText('cloudtrail_enable').title, 'cloudtrail_enable')
})

test('job badge prefers pending over the last result', () => {
  assert.equal(labels.jobStatusBadge({ lastStatus: 'FAILED', pending: 1 }).label, '실행 대기·중')
  assert.equal(labels.jobStatusBadge({ lastStatus: 'FAILED', pending: 0 }).label, '실패')
  assert.equal(labels.jobStatusBadge({ lastStatus: null, pending: 0 }).label, '기록 없음')
})
