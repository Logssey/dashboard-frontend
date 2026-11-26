import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createElement as h } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { build } from 'esbuild'

const bundle = await build({ stdin: { contents: "export { actionRecordError } from './src/lib/actionRecords'; export { ActionRecordPanel } from './src/components/ActionRecordPanel'; export { ActionManagementPage } from './src/pages/ActionManagementPage';", resolveDir: resolve('.') }, bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, alias: { '@': resolve('src') } })
const file = resolve('node_modules/.action-records-test.mjs')
await writeFile(file, bundle.outputFiles[0].contents)
const { actionRecordError, ActionRecordPanel, ActionManagementPage } = await import(pathToFileURL(file).href)
after(() => unlink(file))

test('section action pages keep their area despite an unrelated area query and open the action tab', () => {
  for (const [area,path,kind,href] of [['IAC','/iac/actions','IAC_PATH','/iac/paths/1?tab=actions'],['IMAGE','/vulnerabilities/actions','IMAGE','/vulnerabilities/findings/1?tab=actions']]) {
    const client = new QueryClient({defaultOptions:{queries:{staleTime:Infinity,retry:false}}})
    client.setQueryData(['action-records',area,'ALL',0],{items:[{kind,id:1,title:'로컬 조치 대상',status:'AWAITING_CHECK',verification:{status:'NOT_FOUND',checkId:4},updatedAt:null}],total:1})
    const html=renderToStaticMarkup(h(QueryClientProvider,{client},h(MemoryRouter,{initialEntries:[path+'?area=SECRET']},h(ActionManagementPage,{fixedArea:area}))))
    assert.match(html,/로컬 조치 대상/)
    assert.ok(html.includes(`href="${href}"`))
    assert.doesNotMatch(html,/aria-label="조치 보안 영역"/)
    assert.match(html,/검사에서 미발견/)
    client.clear()
  }
})

test('record completion requires an assignee, actual action note and explicit confirmation', () => {
  assert.equal(actionRecordError('NOT_STARTED', null, '', false), null)
  assert.ok(actionRecordError('IN_PROGRESS', null, '', false))
  assert.ok(actionRecordError('AWAITING_CHECK', 1, '  ', false))
  assert.ok(actionRecordError('RECORDED', 1, '업데이트', false))
  assert.ok(actionRecordError('RECORDED', 1, 'x'.repeat(2001), true))
  assert.equal(actionRecordError('RECORDED', 1, '업데이트 후 재검사', true), null)
})

test('IaC and image share assignment, status, action and verification order without implying resolution', () => {
  for (const kind of ['IMAGE', 'IAC_PATH', 'IAC_FINDING']) {
    const client = new QueryClient()
    client.setQueryData(['action-record', kind, 1], {
      record: { assigneeUserId: 1, status: 'RECORDED', note: '<script>not executable</script>', version: 1 },
      source: { title: '검사 대상', status: kind === 'IMAGE' ? 'IMAGE_REVIEW' : 'OPEN', version: 0, lastSeenAt: '2026-11-26T01:00:00Z' },
      assignees: [{ userId: 1, displayName: '담당자 A' }],
      history: [{ version: 1, assigneeUserId: 1, status: 'RECORDED', note: '<script>not executable</script>', actorName: '담당자 A', recordedAt: '2026-11-26T01:00:00Z' }],
    })
    const html = renderToStaticMarkup(h(QueryClientProvider, { client }, h(MemoryRouter, null, h(ActionRecordPanel, { kind, id: 1, verification: kind === 'IMAGE' ? h('p', null, '기존 취약점 판정 유지') : undefined }))))
    const positions = ['담당자', '처리 상태', '조치 내용', '확인 결과'].map((title) => html.indexOf(`aria-label="${title}"`))
    assert.ok(positions.every((position, i) => position >= 0 && (i === 0 || position > positions[i - 1])))
    assert.match(html, /위험 해소 여부는 아래 확인 결과/)
    assert.doesNotMatch(html, /<script>|role="dialog"/)
    if (kind !== 'IMAGE') assert.match(html, /연결된 재검사 결과가 없어요/)
    client.clear()
  }
})

test('completed human record still shows scan failure separately and keeps the exact scan link', () => {
  const client = new QueryClient()
  client.setQueryData(['action-record', 'IMAGE', 9], {
    record: { assigneeUserId: 1, status: 'RECORDED', note: '패키지 수정', version: 2 },
    source: { title: 'demo', status: 'IMAGE_REVIEW', version: 0 },
    assignees: [{ userId: 1, displayName: '담당자' }], history: [],
    verification: { status: 'UNCONFIRMED', message: '더 최근 검사가 실패했어요.', checkId: 17, checkedAt: null, href: '/vulnerabilities/scans?scan=17', target: 'demo@sha256:fixture', scope: '선택한 이미지 기준' },
    checks: [{ scanId: 18, status: 'FAILED', finishedAt: null, target: 'sha256:fixture' }],
  })
  const html = renderToStaticMarkup(h(QueryClientProvider, { client }, h(MemoryRouter, null, h(ActionRecordPanel, { kind: 'IMAGE', id: 9 }))))
  assert.match(html, /조치 기록 완료/)
  assert.match(html, /확인 불가/)
  assert.match(html, /더 최근 검사가 실패/)
  assert.match(html, /href="\/vulnerabilities\/scans\?scan=17"/)
  assert.doesNotMatch(html, /<strong>검사에서 미발견/)
  client.clear()
})
