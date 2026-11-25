import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

test('compliance scan actions follow the server rollout capability', async () => {
  const api = await readFile(resolve('src/api/compliance.ts'), 'utf8')
  const page = await readFile(resolve('src/pages/CompliancePage.tsx'), 'utf8')

  assert.match(api, /executionEnabled: boolean/)
  assert.match(page, /scopeCatalog\.data\?\.executionEnabled === true/)
  assert.match(page, /selectedTarget\?\.enabled === true/)
  assert.match(page, /selectedTarget\.connectionStatus === 'VERIFIED'/)
  assert.match(page, /disabled=\{!canScan\}/)
  assert.match(page, /connectionStatus === 'VERIFYING'.*5000/)
  assert.match(page, /기존 결과 조회, JSON 가져오기와 보고서 생성은 사용할 수 있어요/)
})
