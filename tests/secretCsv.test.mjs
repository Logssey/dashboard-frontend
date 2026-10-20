import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMaskedSecretsCsv, loadAllSecretItems } from '../src/lib/secretCsv.ts'

const item = {
  id: 1, issuer: 'GITHUB', credentialType: 'GITHUB_CLASSIC_PAT',
  componentState: 'CANDIDATE', maskedLabel: '****', severity: 'UNASSESSED',
  validationStatus: 'UNCHECKED', validationReasonCode: null, validatedAt: null,
  occurrenceCount: 2, firstSeenAt: '2026-10-14T01:00:00Z', lastSeenAt: '2026-10-14T02:00:00Z',
}
const snapshotId = '11111111-1111-1111-1111-111111111111'
const snapshot = { snapshotId, scope: 'inventory', unit: 'CredentialSet' }

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
  const fetchPage = async ({ page, size, issuer, componentState, snapshotId: suppliedSnapshot }) => {
    requestedPages.push(page)
    assert.equal(size, 100)
    assert.equal(issuer, 'AWS')
    assert.equal(componentState, 'CANDIDATE')
    assert.equal(suppliedSnapshot, snapshotId)
    return {
      ...snapshot,
      page, size, total: 101,
      items: Array.from({ length: page === 0 ? 100 : 1 }, (_, index) => ({ ...item, id: page * 100 + index + 1 })),
    }
  }
  const result = await loadAllSecretItems(fetchPage, { issuer: 'AWS', componentState: 'CANDIDATE', snapshotId })
  assert.deepEqual(requestedPages, [0, 1])
  assert.equal(result.length, 101)
})

test('export rejects overlapping pages rather than downloading partial data', async () => {
  const fetchPage = async ({ page, size }) => ({
    ...snapshot,
    page, size, total: 101,
    items: Array.from({ length: page === 0 ? 100 : 1 }, (_, index) => ({ ...item, id: page === 0 ? index + 1 : 1 })),
  })
  await assert.rejects(
    loadAllSecretItems(fetchPage, { issuer: 'ALL', componentState: 'ALL', snapshotId }),
    /SECRET_EXPORT_CHANGED/,
  )
})

test('export rejects expired/replaced snapshot IDs and refuses totals above 10,000 before collecting rows', async () => {
  await assert.rejects(loadAllSecretItems(async () => ({ ...snapshot, snapshotId: 'changed', total: 0, items: [], page: 0, size: 100 }), { issuer: 'ALL', componentState: 'ALL', snapshotId }), /SECRET_EXPORT_CHANGED/)
  await assert.rejects(loadAllSecretItems(async () => ({ ...snapshot, total: 10_001, items: [], page: 0, size: 100 }), { issuer: 'ALL', componentState: 'ALL', snapshotId }), /SECRET_EXPORT_TOO_LARGE/)
  await assert.rejects(loadAllSecretItems(async () => { throw new Error('must not fetch') }, { issuer: 'ALL', componentState: 'ALL', snapshotId: '' }), /SNAPSHOT_REQUIRED/)
})

test('export reuses every filter and the same snapshot through the full 10,000-row boundary', async () => {
  let calls = 0
  const rows = await loadAllSecretItems(async (filter) => {
    calls++
    assert.equal(filter.origin, 'TEST')
    assert.equal(filter.contentKind, 'VALUE_FINDINGS')
    assert.equal(filter.workBucket, 'NEEDS_CASE_LINK')
    assert.equal(filter.snapshotId, snapshotId)
    return { ...snapshot, items: Array.from({ length: 100 }, (_, n) => ({ ...item, id: filter.page * 100 + n + 1 })), total: 10_000, page: filter.page, size: filter.size }
  }, { issuer: 'ALL', componentState: 'ALL', origin: 'TEST', contentKind: 'VALUE_FINDINGS', workBucket: 'NEEDS_CASE_LINK', snapshotId })
  assert.equal(calls, 100)
  assert.equal(rows.length, 10_000)
})

test('CSV identifies its snapshot, origin and unit, and blocks unicode-prefixed formulas', () => {
  const csv = buildMaskedSecretsCsv([{ ...item, maskedLabel: '\u200b=SUM(1,2)', safeLocationLabel: 'protected-name', restrictedLocationCount: 19 }], { asOf: '2026-10-21T00:00:00Z', origin: 'TEST' })
  assert.match(csv, /2026-10-21T00:00:00Z/)
  assert.match(csv, /TEST/)
  assert.match(csv, /CredentialSet/)
  assert.match(csv, /'\u200b=SUM/)
  assert.doesNotMatch(csv, /protected-name|restrictedLocationCount/)
})
