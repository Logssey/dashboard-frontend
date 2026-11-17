import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

test('compliance targets use role-based onboarding without AWS access keys', async () => {
  const api = await readFile(resolve('src/api/compliance.ts'), 'utf8')
  const panel = await readFile(resolve('src/components/ComplianceTargetPanel.tsx'), 'utf8')

  assert.match(api, /awsAccountId: string/)
  assert.match(api, /roleArn: string/)
  assert.match(api, /externalId: string/)
  assert.doesNotMatch(panel, /access.?key|secret.?key/i)
  assert.match(panel, /External ID는 등록할 때 서버가 자동 생성/)
  assert.match(panel, /selected\.connectionStatus !== 'VERIFIED'/)
})
