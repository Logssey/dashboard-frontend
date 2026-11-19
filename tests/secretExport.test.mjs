import assert from 'node:assert/strict'
import test from 'node:test'
import { secretExportErrorMessage, secretExportFilename, secretExportOptions, secretExportPath } from '../src/lib/secretExport.ts'

const filters = {
  page: 3, size: 20, issuer: 'ALL', componentState: 'ALL', origin: 'PRODUCTION', source: 'NOTION', provider: 'ALL',
  environment: 'ALL', contentKind: 'VALUE_FINDINGS', workBucket: 'ALL', validity: 'ALL', severity: 'HIGH',
  snapshotId: '11111111-1111-1111-1111-111111111111', runId: null, q: '',
}

test('export path reuses the inventory filters and snapshot but never paging', () => {
  const url = new URL(secretExportPath('sarif', filters), 'http://localhost')
  assert.equal(url.pathname, '/api/v1/secrets/exports')
  assert.equal(url.searchParams.get('format'), 'sarif')
  assert.equal(url.searchParams.get('snapshotId'), filters.snapshotId)
  assert.equal(url.searchParams.get('source'), 'NOTION')
  assert.equal(url.searchParams.get('severity'), 'HIGH')
  assert.equal(url.searchParams.has('page'), false)
  assert.equal(url.searchParams.has('size'), false)
  assert.equal(url.searchParams.has('runId'), false)
  assert.equal(url.searchParams.has('q'), false)
  assert.equal(new URL(secretExportPath('gitleaks', { ...filters, runId: 7 }), 'http://localhost').searchParams.get('runId'), '7')
})

test('filenames carry only format and date', () => {
  const now = new Date('2026-11-19T03:00:00Z')
  assert.equal(secretExportFilename('csv', null, now), 'logssey-secrets-masked-2026-11-19.csv')
  assert.equal(secretExportFilename('sarif', 'attachment; filename="logssey-secrets-sarif-2026-11-18.sarif"', now), 'logssey-secrets-sarif-2026-11-18.sarif')
  assert.equal(secretExportFilename('gitleaks', 'attachment; filename="alice-secrets.json"', now), 'logssey-secrets-gitleaks-2026-11-19.json')
  assert.equal(secretExportFilename('logssey-json', 'attachment; filename="logssey-secrets-sarif-2026-11-18.sarif"', now), 'logssey-secrets-logssey-json-2026-11-19.json')
  assert.equal(secretExportFilename('sarif', null, now), 'logssey-secrets-sarif-2026-11-19.sarif')
})

test('menu offers the existing CSV and three tool formats with the GitHub notice', () => {
  assert.deepEqual(secretExportOptions.map((option) => option.format), ['csv', 'sarif', 'logssey-json', 'gitleaks'])
  assert.match(secretExportOptions.find((option) => option.format === 'sarif').description, /저장소 하나 단위/)
})

test('errors map to safe guidance without echoing server text', () => {
  assert.match(secretExportErrorMessage({ status: 413, message: 'x' }), /10,000개/)
  assert.match(secretExportErrorMessage(new Error('SECRET_EXPORT_TOO_LARGE')), /10,000개/)
  assert.match(secretExportErrorMessage({ status: 409 }), /새로고침/)
  assert.match(secretExportErrorMessage({ status: 403 }), /권한/)
  assert.match(secretExportErrorMessage(new Error('boom')), /파일을 완성하지 못했어요/)
})
