import assert from 'node:assert/strict'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, test } from 'node:test'
import { build } from 'esbuild'

const bundled = await build({
  entryPoints: [resolve('src/code/labels.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
})
const bundlePath = resolve('node_modules/.code-labels-test.mjs')
await writeFile(bundlePath, bundled.outputFiles[0].contents)
const labels = await import(pathToFileURL(bundlePath).href)
after(() => unlink(bundlePath))

const sha = 'a'.repeat(40)

test('semgrep rule ids are shortened to their last segment', () => {
  assert.equal(labels.ruleName('yaml.github-actions.security.run-shell-injection.run-shell-injection'), 'run-shell-injection')
  assert.equal(labels.ruleName('SQL_INJECTION_SPRING_JDBC'), 'SQL_INJECTION_SPRING_JDBC')
})

test('source links point at the scanned commit and line', () => {
  const finding = { repository: 'Logssey/service-backend', commit: sha, path: 'src/main/java/A B.java', line: 20 }
  assert.equal(labels.sourceUrl(finding), `https://github.com/Logssey/service-backend/blob/${sha}/src/main/java/A%20B.java#L20`)
  assert.equal(labels.sourceUrl({ ...finding, line: null }), `https://github.com/Logssey/service-backend/blob/${sha}/src/main/java/A%20B.java`)
  assert.equal(labels.location(finding), 'src/main/java/A B.java:20')
})

test('repository and tool names are shown short', () => {
  assert.equal(labels.repoName('Logssey/service-frontend'), 'service-frontend')
  assert.equal(labels.toolLabel('spotbugs'), 'SpotBugs·FindSecBugs')
  assert.equal(labels.toolLabel('other'), 'other')
})
