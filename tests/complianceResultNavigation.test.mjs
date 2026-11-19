import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

test('compliance result links reveal and move focus to the selected run', async () => {
  const page = await readFile(resolve('src/pages/CompliancePage.tsx'), 'utf8')

  assert.match(page, /const openRun = \(runId: number \| null\)/)
  assert.match(page, /if \(runId === null\) return/)
  assert.match(page, /setRunNavigationRequest\(\(request\) => request \+ 1\)/)
  assert.match(page, /section\.focus\(\{ preventScroll: true \}\)/)
  assert.match(page, /section\.scrollIntoView\(/)
  assert.match(page, /onClick=\{\(\) => openRun\(job\.runId\)\}>결과 보기/)
  assert.match(page, /aria-controls="compliance-run-detail"/)
  assert.match(page, /id="compliance-run-detail" ref=\{resultSection\} tabIndex=\{-1\}/)
  assert.match(page, /selectedRun\.isError/)
  assert.match(page, /<\/>\s*\)\}\s*\{selectedRunId !== null/)
})
