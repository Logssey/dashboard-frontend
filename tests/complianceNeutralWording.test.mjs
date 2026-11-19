import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

test('compliance screens describe the audit without exposing the internal scanner brand', async () => {
  const files = await Promise.all([
    readFile(resolve('src/pages/CompliancePage.tsx'), 'utf8'),
    readFile(resolve('src/components/ComplianceScanDialog.tsx'), 'utf8'),
    readFile(resolve('src/components/ComplianceTargetPanel.tsx'), 'utf8'),
  ])
  const renderedSources = files.join('\n').replaceAll('importProwlerResults', '')

  assert.doesNotMatch(renderedSources, /prowler/i)
  assert.match(files[0], /AWS 기술 점검/)
  assert.match(files[1], /AWS READ-ONLY/)
  assert.match(files[2], /LogsseyComplianceAudit/)
})
