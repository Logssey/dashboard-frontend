import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

test('compliance targets use role-based onboarding without AWS access keys', async () => {
  const api = await readFile(resolve('src/api/compliance.ts'), 'utf8')
  const panel = await readFile(resolve('src/components/ComplianceTargetPanel.tsx'), 'utf8')
  const page = await readFile(resolve('src/pages/CompliancePage.tsx'), 'utf8')

  assert.match(api, /awsAccountId: string/)
  assert.match(api, /roleArn: string/)
  assert.match(api, /externalId: string/)
  assert.match(api, /assessmentProfile: ComplianceAssessmentProfile/)
  assert.match(api, /assessmentContext:[\s\S]*policyVersion: string[\s\S]*inferredServices: string\[\]/)
  assert.match(api, /assessmentProfile: changes\.assessmentProfile \?\? target\.assessmentProfile/)
  assert.doesNotMatch(panel, /access.?key|secret.?key/i)
  assert.match(panel, /External ID는 등록할 때 서버가 자동 생성/)
  assert.match(panel, /selected\.connectionStatus !== 'VERIFIED'/)
  assert.match(panel, /컴플라이언스 판정 프로필/)
  assert.match(panel, /자동 추론·미확정/)
  assert.match(panel, /판정 프로필 변경은 AWS 연결 상태를 바꾸지 않으며 새 Run부터 적용/)
  assert.match(page, /Run 판정 정책/)
  assert.match(page, /자산으로 확인한 서비스/)
  assert.match(page, /저장된 적용성 프로필/)
})
