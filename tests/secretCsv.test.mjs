import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMaskedSecretsCsv, loadAllSecretItems } from '../src/lib/secretCsv.ts'

const item = {
  id: 1, issuer: 'GITHUB', credentialType: 'GITHUB_CLASSIC_PAT',
  componentState: 'CANDIDATE', maskedLabel: '****', severity: 'UNASSESSED',
  validationStatus: 'UNCHECKED', validationReasonCode: null, validatedAt: null,
  occurrenceCount: 2, firstSeenAt: '2026-10-14T01:00:00Z', lastSeenAt: '2026-10-14T02:00:00Z',
}

test('masked CSV includes only allowlisted fields and escapes spreadsheet formulas', () => {
  const row = {
    ...item,
    maskedLabel: ' \t=HYPERLINK("https://example.invalid")',
    sourceObjectRef: 'do-not-export-location',
    rawSecret: 'do-not-export-value',
  }
  const csv = buildMaskedSecretsCsv([row])
  assert.ok(csv.startsWith('\uFEFF'))
  assert.match(csv, /"'  =HYPERLINK\(""https:\/\/example\.invalid""\)"/)
  assert.ok(csv.includes('\r\n'))
  assert.ok(!csv.includes('do-not-export-location'))
  assert.ok(!csv.includes('do-not-export-value'))
})

test('export fetches every page of the selected filter', async () => {
  const requestedPages = []
  const fetchPage = async ({ page, size, issuer, componentState }) => {
    requestedPages.push(page)
    assert.equal(size, 100)
    assert.equal(issuer, 'AWS')
    assert.equal(componentState, 'CANDIDATE')
    return {
      page, size, total: 101,
      items: Array.from({ length: page === 0 ? 100 : 1 }, (_, index) => ({ ...item, id: page * 100 + index + 1 })),
    }
  }
  const result = await loadAllSecretItems(fetchPage, { issuer: 'AWS', componentState: 'CANDIDATE' })
  assert.deepEqual(requestedPages, [0, 1])
  assert.equal(result.length, 101)
})

test('export rejects overlapping pages rather than downloading partial data', async () => {
  const fetchPage = async ({ page, size }) => ({
    page, size, total: 101,
    items: Array.from({ length: page === 0 ? 100 : 1 }, (_, index) => ({ ...item, id: page === 0 ? index + 1 : 1 })),
  })
  await assert.rejects(
    loadAllSecretItems(fetchPage, { issuer: 'ALL', componentState: 'ALL' }),
    /SECRET_EXPORT_CHANGED/,
  )
})
