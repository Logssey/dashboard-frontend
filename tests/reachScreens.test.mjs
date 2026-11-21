// Reach 워크로드(SCR-04)·스캔(SCR-05)·검토 이력(SCR-03-14) 화면 테스트
import assert from 'node:assert/strict'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { build } from 'esbuild'

const bundled = await build({
  stdin: {
    contents: [
      "export * from '@/lib/reach'",
      "export { sampleReachWorkloads, sampleReachScans, sampleReachScan } from '@/api/reachSample'",
      "export { VulnerabilityWorkloadsPage, scanRequestLink } from '@/pages/ReachWorkloadsPage'",
      "export { VulnerabilityScansPage, readNewScan, rerunParams } from '@/pages/ReachScansPage'",
      "export { ReviewHistory } from '@/components/ReachFindingDrawer'",
      "export { AppLayout } from '@/layout/AppLayout'",
      "export { ME_QUERY_KEY } from '@/layout/useMe'",
      "export { reachFindingQuery } from '@/api/reach'",
      "export { sampleReachSummary } from '@/api/reachSample'",
      "export { VulnerabilitySummaryPage } from '@/pages/VulnerabilitiesPage'",
    ].join('\n'),
    resolveDir: resolve('.'),
    loader: 'ts',
  },
  loader: { '.css': 'empty' },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  packages: 'external',
  alias: { '@': resolve('src') },
})
const bundlePath = resolve('node_modules/.reach-screens-test.mjs')
await writeFile(bundlePath, bundled.outputFiles[0].contents)
const reach = await import(pathToFileURL(bundlePath).href)
after(() => unlink(bundlePath))

const A = `sha256:${'a'.repeat(64)}`
const B = `sha256:${'b'.repeat(64)}`
const C = `sha256:${'c'.repeat(64)}`

function workload(overrides) {
  return {
    id: 1,
    cluster: 'reused-prod',
    namespace: 'reused',
    kind: 'Deployment',
    name: 'reused-api',
    container: 'api',
    app: 'API',
    image: { repository: 'logssey/reused-api', digest: A },
    replicas: { ready: 1 },
    deployment: 'RUNNING',
    scanMatch: { status: 'MATCH', scanId: 1, matchedBy: 'DIGEST' },
    observedAt: '2026-11-07T03:17:05Z',
    source: 'MANUAL',
    ...overrides,
  }
}

const observation = { cluster: 'reused-prod', namespace: 'reused', observedAt: '2026-11-07T03:17:05Z', source: 'MANUAL', fresh: true }

function client() {
  const value = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  value.setQueryData(reach.ME_QUERY_KEY, { userId: 1, displayName: 'Security Admin', role: 'ADMIN' })
  return value
}

function renderAt(queryClient, component, url) {
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: queryClient },
    createElement(MemoryRouter, { initialEntries: [url] }, createElement(component))))
}

const rows = [
  workload({ id: 1 }),
  workload({ id: 2, image: { repository: 'logssey/reused-api', digest: B, revision: 'b'.repeat(40) }, scanMatch: { status: 'MISMATCH', scanId: 1 } }),
  workload({ id: 3, name: 'reused-chat', container: 'chat', app: null, replicas: { ready: 0 }, image: { repository: 'logssey/reused-chat', digest: C }, scanMatch: { status: 'NO_SCAN' } }),
]

test('digest and revision are shortened only for display', () => {
  assert.equal(reach.shortDigest(A), 'aaaaaaaaaaaa…')
  assert.equal(reach.shortRevision('bb4639b7e45c21d5ced03a5f541b1982093e0865'), 'bb4639b')
  assert.equal(reach.shortRevision('v1.2'), 'v1.2')
  assert.equal(reach.shortRevision(undefined), null)
})

test('workloads sort mismatch → no scan → match and a rollout counts as one workload', () => {
  const sorted = [...rows].sort(reach.compareWorkloads)
  assert.deepEqual(sorted.map((row) => row.scanMatch.status), ['MISMATCH', 'NO_SCAN', 'MATCH'])
  assert.deepEqual(reach.summarizeWorkloads(rows), { workloads: 2, readyPods: 2, match: 1, noScan: 1, mismatch: 1 })
})

test('workload page shows the observation, cards and attention rows first', () => {
  const queryClient = client()
  queryClient.setQueryData(['reach-workloads'], { data: { observations: [observation], items: rows }, sample: false })
  const html = renderAt(queryClient, reach.VulnerabilityWorkloadsPage, '/vulnerabilities/workloads')

  assert.match(html, /reused-prod \/ reused/)
  assert.match(html, /kubectl로 조회해 손으로 올린 결과가 섞여 있어요/)
  assert.doesNotMatch(html, /자동 수집은 아직 연결되지 않았어요/)
  assert.doesNotMatch(html, /오래됨/)
  assert.doesNotMatch(html, /예시 값/)
  assert.match(html, /준비된 파드 2개/)
  assert.ok(html.indexOf('>불일치</span>') < html.indexOf('>스캔 없음</span>'))
  assert.ok(html.indexOf('>스캔 없음</span>') < html.indexOf('>일치</span>'))
  assert.match(html, /앱 최신 스캔 #1/)
  assert.match(html, /준비 0/)
  assert.match(html, /logssey\/reused-api<span class="caption"> : bbbbbbb<\/span>/)
  // 스캔 없음·불일치 행만 [스캔 요청]
  assert.equal(html.match(/>스캔 요청</g).length, 2)
})

test('scan request link opens the new scan dialog filled with that image', () => {
  const link = reach.scanRequestLink(rows[2])
  const params = new URLSearchParams(link.split('?')[1])
  assert.equal(link.split('?')[0], '/vulnerabilities/scans')
  assert.equal(params.get('new'), 'image')
  assert.equal(params.get('repository'), 'logssey/reused-chat')
  assert.equal(params.get('digest'), C)
  assert.equal(params.get('app'), null)
  const form = reach.readNewScan(params)
  assert.equal(form.type, 'IMAGE')
  assert.equal(form.digest, C)
})

test('card filter in the URL keeps only that group', () => {
  const queryClient = client()
  queryClient.setQueryData(['reach-workloads'], { data: { observations: [observation], items: rows }, sample: false })
  const html = renderAt(queryClient, reach.VulnerabilityWorkloadsPage, '/vulnerabilities/workloads?match=MATCH')
  assert.match(html, /3개 중 1개/)
  assert.match(html, /전체 보기/)
  assert.doesNotMatch(html, /reused-chat<\/strong>/)
})

test('no observation is an empty state and a stale one is marked', () => {
  const empty = client()
  empty.setQueryData(['reach-workloads'], { data: { observations: [], items: [] }, sample: false })
  assert.match(renderAt(empty, reach.VulnerabilityWorkloadsPage, '/vulnerabilities/workloads'), /클러스터 조회 기록이 없어요/)

  const stale = client()
  stale.setQueryData(['reach-workloads'], {
    data: { observations: [{ ...observation, fresh: false }], items: [workload({ deployment: 'UNKNOWN' })] },
    sample: false,
  })
  const html = renderAt(stale, reach.VulnerabilityWorkloadsPage, '/vulnerabilities/workloads')
  assert.match(html, /오래됨/)
  assert.match(html, /확인 못 함/)

  const observedNoPods = client()
  observedNoPods.setQueryData(['reach-workloads'], { data: { observations: [observation], items: [] }, sample: false })
  assert.match(renderAt(observedNoPods, reach.VulnerabilityWorkloadsPage, '/vulnerabilities/workloads'), /실행 중인 워크로드가 없어요/)
})

test('sample workloads say so', () => {
  const queryClient = client()
  queryClient.setQueryData(['reach-workloads'], { data: reach.sampleReachWorkloads(), sample: true })
  assert.match(renderAt(queryClient, reach.VulnerabilityWorkloadsPage, '/vulnerabilities/workloads'), /예시 값/)
})

const scan = reach.sampleReachScan(1)
const failed = {
  ...scan,
  id: 2,
  scanStatus: 'FAILED',
  counts: null,
  stages: [{ name: 'SBOM', status: 'FAILED', message: 'bootJar build failed' }],
  failure: { code: 'BUILD_FAILED', stage: 'SBOM', message: 'gradle exited 1' },
}
const noScanFilter = { scanStatus: [], trigger: [] }

test('scan rows show target, counts and running state', () => {
  assert.equal(reach.scanCountsText(scan), '23행 · CRITICAL 5 · HIGH 11 · MEDIUM 7 · 도달 가능 0')
  assert.equal(reach.scanCountsText(failed), '결과 없음')
  assert.equal(reach.scanTargetRef(scan), 'logssey/reused-api @ a6ffffef')
  assert.equal(
    reach.scanTargetRef({ ...scan, target: { ...scan.target, type: 'REPO', image: null, repo: { name: 'service-backend', path: 'chat-server', commit: '6583020'.padEnd(40, '0') } } }),
    'service-backend/chat-server @ 6583020',
  )
  assert.equal(reach.hasActiveScan([scan]), false)
  assert.equal(reach.hasActiveScan([scan, { ...scan, scanStatus: 'QUEUED' }]), true)
})

test('scan page shows the history and the selected scan detail', () => {
  const queryClient = client()
  queryClient.setQueryData(['reach-scans', noScanFilter], {
    pages: [{ data: { items: [failed, scan], nextCursor: null, hasNext: false, totalCount: 2 }, sample: false }],
    pageParams: [null],
  })
  queryClient.setQueryData(['reach-scan', 1], { data: scan, sample: false })
  queryClient.setQueryData(['reach-scan', 2], { data: failed, sample: false })

  const html = renderAt(queryClient, reach.VulnerabilityScansPage, '/vulnerabilities/scans?scan=1')
  assert.match(html, /2건 중 2건 표시/)
  assert.match(html, /class="reach-row selected"/)
  assert.match(html, /스캔 #1/)
  assert.match(html, /SBOM 생성/)
  assert.match(html, /L2 판정<\/span><span class="caption">완료 · 40초/)
  assert.match(html, /Trivy DB 갱신/)
  assert.match(html, /href="\/vulnerabilities\/findings\?scan=1"[^>]*>결과 보기/)
  assert.doesNotMatch(html, /다시 실행/)
  assert.doesNotMatch(html, /예시 값/)

  const failedHtml = renderAt(queryClient, reach.VulnerabilityScansPage, '/vulnerabilities/scans?scan=2')
  assert.match(failedHtml, /실패: BUILD_FAILED \(SBOM 생성\) — gradle exited 1/)
  assert.match(failedHtml, /bootJar build failed/)
  assert.match(failedHtml, /다시 실행/)
  assert.doesNotMatch(failedHtml, />결과 보기</)
})

test('queued scans explain why they wait and unknown tools keep a readable name', () => {
  const queryClient = client()
  const queued = { ...scan, id: 3, scanStatus: 'QUEUED', stages: [], counts: null, startedAt: null, finishedAt: null, tools: { scanner: 'trivy' } }
  queryClient.setQueryData(['reach-scans', noScanFilter], {
    pages: [{ data: { items: [queued], nextCursor: null, hasNext: false, totalCount: 1 }, sample: false }],
    pageParams: [null],
  })
  queryClient.setQueryData(['reach-scan', 3], { data: queued, sample: false })
  const html = renderAt(queryClient, reach.VulnerabilityScansPage, '/vulnerabilities/scans?scan=3')
  assert.match(html, /아직 시작하지 않았어요/)
  assert.match(html, /실행기가 연결되지 않은 환경에서는 대기에 머물러요/)
  assert.match(html, /<dt>스캐너<\/dt><dd>trivy<\/dd>/)
  assert.match(html, /진행 중인 스캔은 10초마다/)
})

test('rerun refills the dialog with the failed target', () => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(reach.rerunParams(failed))) if (value) params.set(key, value)
  const form = reach.readNewScan(params)
  assert.equal(form.type, 'IMAGE')
  assert.equal(form.app, 'API')
  assert.equal(form.repository, 'logssey/reused-api')
  assert.equal(form.digest, scan.target.image.digest)
  assert.equal(reach.readNewScan(new URLSearchParams('scan=1')), null)
})

test('new scan keeps any app code from the URL; the installation config decides which exist', () => {
  // 앱 코드는 열거값이 아니다(API-14). 형식만 보고, 없는 코드는 서버가 400으로 알린다
  assert.equal(reach.readNewScan(new URLSearchParams('new=repo&app=ORDER')).app, 'ORDER')
  assert.equal(reach.readNewScan(new URLSearchParams('new=repo&app=BATCH_2')).app, 'BATCH_2')
  assert.equal(reach.readNewScan(new URLSearchParams('new=repo&app=order')).app, '')
  assert.equal(reach.readNewScan(new URLSearchParams('new=image&app=TOO_LONG_CODE')).app, '')
})

test('new scan dialog opens from the URL with the values filled in', () => {
  const queryClient = client()
  queryClient.setQueryData(['reach-scans', noScanFilter], {
    pages: [{ data: { items: [], nextCursor: null, hasNext: false, totalCount: 0 }, sample: false }],
    pageParams: [null],
  })
  const html = renderAt(queryClient, reach.VulnerabilityScansPage, `/vulnerabilities/scans?new=image&repository=logssey%2Freused-chat&digest=${C}`)
  assert.match(html, /아직 스캔이 없어요/)
  assert.match(html, /id="reach-new-scan-title">새 스캔/)
  assert.match(html, /value="logssey\/reused-chat"/)
  assert.match(html, new RegExp(`value="${C}"`))
})

test('new scan input follows API-01 rules before sending', () => {
  const base = { ...reach.emptyNewScanForm }
  assert.deepEqual(Object.keys(reach.newScanRequest(base).errors).sort(), ['digest', 'repository'])
  assert.ok(reach.newScanRequest({ ...base, repository: 'logssey/reused-api:latest', digest: A }).errors.repository)
  assert.ok(reach.newScanRequest({ ...base, repository: 'logssey/reused-api', digest: A.toUpperCase() }).errors.digest)
  assert.deepEqual(reach.newScanRequest({ ...base, repository: ' logssey/reused-api ', digest: A, l1: false }).input, {
    target: { type: 'IMAGE', app: undefined, image: { repository: 'logssey/reused-api', digest: A } },
    options: { l1: false, l2: true },
  })

  const repo = { ...base, type: 'REPO', app: 'CHAT', repoName: 'service-backend', commit: '1'.repeat(40) }
  assert.ok(reach.newScanRequest({ ...repo, commit: 'abc' }).errors.commit)
  assert.deepEqual(reach.newScanRequest({ ...repo, path: 'chat-server' }).input.target, {
    type: 'REPO', app: 'CHAT', repo: { name: 'service-backend', commit: '1'.repeat(40), path: 'chat-server' },
  })
  assert.deepEqual(reach.newScanRequest(repo).input.target.repo, { name: 'service-backend', commit: '1'.repeat(40) })
})

test('rescan is offered for finished scans that are not PR scans', () => {
  assert.equal(reach.canRescan(scan), true)
  assert.equal(reach.canRescan({ ...scan, trigger: 'SCHEDULE' }), true)
  assert.equal(reach.canRescan({ ...scan, trigger: 'IMAGE_BUILD' }), true)
  // PR 스캔을 다시 대조하면 수동 스캔이 되어 머지 전 코드가 기준 집계에 들어간다
  assert.equal(reach.canRescan({ ...scan, trigger: 'PR' }), false)
  assert.equal(reach.canRescan(failed), false)
  assert.equal(reach.canRescan({ ...scan, scanStatus: 'RUNNING' }), false)

  const queryClient = client()
  queryClient.setQueryData(['reach-scans', noScanFilter], {
    pages: [{ data: { items: [failed, scan], nextCursor: null, hasNext: false, totalCount: 2 }, sample: false }],
    pageParams: [null],
  })
  queryClient.setQueryData(['reach-scan', 1], { data: scan, sample: false })
  queryClient.setQueryData(['reach-scan', 2], { data: failed, sample: false })
  queryClient.setQueryData(['reach-scan', 3], { data: { ...scan, id: 3, trigger: 'PR' }, sample: false })
  assert.match(renderAt(queryClient, reach.VulnerabilityScansPage, '/vulnerabilities/scans?scan=1'), />다시 대조</)
  assert.doesNotMatch(renderAt(queryClient, reach.VulnerabilityScansPage, '/vulnerabilities/scans?scan=2'), />다시 대조</)
  assert.doesNotMatch(renderAt(queryClient, reach.VulnerabilityScansPage, '/vulnerabilities/scans?scan=3'), />다시 대조</)
})

test('a rescan error names the scan, not the app', () => {
  assert.match(reach.rescanErrorText(422, 'UNPROCESSABLE', 'Unprocessable'), /성공으로 끝난 스캔만/)
  assert.match(reach.rescanErrorText(422, 'UNPROCESSABLE', 'RUNNER_NOT_INSTALLED: service-backend'), /실행기가 아직 없어요/)
  assert.match(reach.rescanErrorText(503, 'UNAVAILABLE', 'x'), /지금 부를 수 없어요/)
})

test('summary basis rows offer a rescan each', () => {
  const queryClient = client()
  queryClient.setQueryData(['reach-summary', 'RUNNING'], { data: { ...reach.sampleReachSummary(), scope: { targetId: null, scanId: null },
    basis: { requested: 'RUNNING', applied: 'RUNNING', unscannedRunning: [], scans: [
      { app: 'API', targetType: 'IMAGE', targetId: 1, scanId: 27, imageDigest: A, running: true },
      { app: 'CHAT', targetType: 'IMAGE', targetId: 2, scanId: 28, imageDigest: C, running: true },
    ] } }, sample: false })
  const html = renderAt(queryClient, reach.VulnerabilitySummaryPage, '/vulnerabilities')
  assert.match(html, /스캔 #27/)
  assert.equal(html.match(/>다시 대조</g).length, 2)
})

test('pick list: running images first, then recent targets without PR scans or repeats', () => {
  const repoScan = { ...scan, id: 9, trigger: 'MANUAL', createdAt: '2026-11-19T01:00:00Z', startedAt: '2026-11-19T01:00:05Z',
    target: { id: 5, type: 'REPO', app: 'API', image: null, repo: { name: 'service-backend', path: null, commit: 'c'.repeat(40) }, displayName: 'service-backend' } }
  const oldImage = { ...scan, id: 7, target: { ...scan.target, id: 6, image: { repository: 'logssey/reused-api', digest: 'sha256:' + 'e'.repeat(64) } } }
  const scans = [
    { ...scan, id: 12, trigger: 'PR', target: { ...repoScan.target, id: 8 } },   // PR 스캔: 뺀다
    { ...scan, id: 11, target: { ...scan.target, id: 4, image: { repository: 'logssey/reused-api', digest: A } } },   // 실행 중 목록에 있는 이미지: 뺀다
    repoScan,
    oldImage,
    { ...oldImage, id: 6 },   // 같은 대상의 더 옛 스캔: 뺀다
  ]
  const picks = reach.scanPicks(rows, scans)

  // 실행 중: 불일치 → 스캔 없음 → 일치 순, 이미지마다 한 줄
  assert.deepEqual(picks.running.map((pick) => [pick.title, pick.ref, pick.note]), [
    ['reused-api', 'logssey/reused-api @ bbbbbbbb', '이 이미지는 아직 스캔 없음'],
    ['reused-chat', 'logssey/reused-chat @ cccccccc', '이 이미지는 아직 스캔 없음'],
    ['reused-api', 'logssey/reused-api @ aaaaaaaa', '스캔 #1 있음'],
  ])
  assert.deepEqual(picks.running[1].fill, { type: 'IMAGE', app: '', repository: 'logssey/reused-chat', digest: C, repoName: '', commit: '', path: '' })
  assert.equal(reach.scanPicks([rows[0], { ...rows[0], id: 9, container: 'sidecar' }], []).running.length, 1)

  assert.deepEqual(picks.recent.map((pick) => pick.key), ['recent:5', 'recent:6'])
  assert.equal(picks.recent[0].ref, 'service-backend @ ccccccc')
  assert.match(picks.recent[0].note, /^스캔 #9 · /)
  assert.deepEqual(picks.recent[0].fill, { type: 'REPO', app: 'API', repository: '', digest: '', repoName: 'service-backend', commit: 'c'.repeat(40), path: '' })
  assert.match(picks.recent[1].note, /^스캔 #7 · /)

  // 고른 줄은 양식만 보고 안다. 고르면 요청 본문이 그대로 나온다
  const form = { ...reach.emptyNewScanForm, ...picks.running[1].fill, l1: false }
  assert.equal(reach.isScanPicked(form, picks.running[1]), true)
  assert.equal(reach.isScanPicked(form, picks.running[0]), false)
  assert.equal(reach.isScanPicked(reach.emptyNewScanForm, picks.recent[0]), false)
  assert.deepEqual(reach.newScanRequest(form).input, {
    target: { type: 'IMAGE', app: undefined, image: { repository: 'logssey/reused-chat', digest: C } },
    options: { l1: false, l2: true },
  })
  assert.deepEqual(reach.newScanRequest({ ...reach.emptyNewScanForm, ...picks.recent[0].fill }).input.target,
    { type: 'REPO', app: 'API', repo: { name: 'service-backend', commit: 'c'.repeat(40) } })
})

test('new scan dialog lists the targets to pick and keeps manual entry folded', () => {
  const queryClient = client()
  queryClient.setQueryData(['reach-scans', noScanFilter], {
    pages: [{ data: { items: [scan], nextCursor: null, hasNext: false, totalCount: 1 }, sample: false }],
    pageParams: [null],
  })
  queryClient.setQueryData(['reach-workloads'], { data: { observations: [observation], items: rows }, sample: false })
  queryClient.setQueryData(['reach-scans', 'picks'], { data: { items: [scan], nextCursor: null, hasNext: false }, sample: false })

  const html = renderAt(queryClient, reach.VulnerabilityScansPage, '/vulnerabilities/scans?new=image')
  assert.match(html, /<h3>실행 중인 이미지<\/h3>/)
  assert.match(html, /logssey\/reused-chat @ cccccccc/)
  assert.equal(html.match(/class="reach-pick"/g).length, 4)   // 실행 중 3 + 최근 1
  assert.match(html, /<h3>최근 스캔한 대상<\/h3>/)
  assert.doesNotMatch(html, /aria-pressed="true"/)
  assert.match(html, /<details class="reach-manual">/)   // 접힌 채로 열린다

  // 값을 채워서 열면(워크로드의 [스캔 요청]) 그 줄이 골라져 있고 직접 입력이 펼쳐져 있다
  const filled = renderAt(queryClient, reach.VulnerabilityScansPage, `/vulnerabilities/scans?new=image&repository=logssey%2Freused-chat&digest=${C}`)
  assert.equal(filled.match(/aria-pressed="true"/g).length, 1)
  assert.match(filled, /<details class="reach-manual" open="">/)

  // 예시 값은 고를 대상으로 보이지 않고, 고를 것이 없으면 직접 입력이 펼쳐진다
  const sample = client()
  sample.setQueryData(['reach-scans', noScanFilter], { pages: [{ data: { items: [], nextCursor: null, hasNext: false, totalCount: 0 }, sample: false }], pageParams: [null] })
  sample.setQueryData(['reach-workloads'], { data: reach.sampleReachWorkloads(), sample: true })
  sample.setQueryData(['reach-scans', 'picks'], { data: { items: [], nextCursor: null, hasNext: false }, sample: false })
  const empty = renderAt(sample, reach.VulnerabilityScansPage, '/vulnerabilities/scans?new=image')
  assert.doesNotMatch(empty, /class="reach-pick"/)
  assert.match(empty, /<details class="reach-manual" open="">/)
})

test('scan request errors read as next steps', () => {
  assert.match(reach.scanRequestErrorText(503, 'UNAVAILABLE', 'x'), /잠시 뒤 다시/)
  assert.match(reach.scanRequestErrorText(422, 'UNPROCESSABLE', 'x'), /앱을 직접 골라/)
  assert.match(reach.scanRequestErrorText(422, 'UNPROCESSABLE', 'RUNNER_NOT_INSTALLED: 이 레포에는 Reach 실행기가 없습니다.'), /Reach 실행기가 아직 없어요/)
  assert.match(reach.scanRequestErrorText(400, 'INVALID_INPUT', '잘못된 값'), /잘못된 값/)
})

test('finding list can be limited to one scan', () => {
  const query = new URLSearchParams(reach.reachFindingQuery({ status: [], severity: [], reviewState: [], deployment: [], cveContains: '', scanId: 7 }, null))
  assert.equal(query.get('scanId'), '7')
  const none = new URLSearchParams(reach.reachFindingQuery({ status: [], severity: [], reviewState: [], deployment: [], cveContains: '' }, null))
  assert.equal(none.get('scanId'), null)
  const latest = new URLSearchParams(reach.reachFindingQuery({ status: [], severity: [], reviewState: [], deployment: [], cveContains: '', basis: 'LATEST' }, null))
  assert.equal(latest.get('basis'), 'LATEST')
  assert.equal(new URLSearchParams(reach.reachFindingQuery({ status: [], severity: [], reviewState: [], deployment: [], cveContains: '', scanId: 7, basis: 'LATEST' }, null)).get('basis'), null)
  assert.equal(none.get('basis'), null)
})

test('review history lists newest first and names server resets', () => {
  const html = renderToStaticMarkup(createElement(reach.ReviewHistory, {
    history: [
      { reviewState: 'PROVISIONAL', status: 'UNREACHABLE', note: '첫 판단', reviewer: { id: 1, name: '보안 담당자' }, reviewedAt: '2026-10-11T02:00:00Z', version: 2, changeKind: 'HUMAN' },
      { reviewState: 'CONFIRMED', status: 'UNREACHABLE', note: '확정', reviewer: { id: 1, name: '보안 담당자' }, reviewedAt: '2026-10-11T03:00:00Z', version: 3, changeKind: 'HUMAN' },
      { reviewState: 'UNREVIEWED', status: null, reviewer: null, reviewedAt: '2026-10-12T03:00:00Z', version: 4, changeKind: 'RESET' },
    ],
  }))
  assert.ok(html.indexOf('되돌림') < html.indexOf('확정</p>'))
  assert.ok(html.indexOf('확정</p>') < html.indexOf('첫 판단'))
  assert.match(html, /서버 · /)
  assert.match(renderToStaticMarkup(createElement(reach.ReviewHistory, { history: [] })), /아직 검토 기록이 없어요/)
})

test('sidebar lists 워크로드 and 스캔 under 취약점 관리', () => {
  const html = renderAt(client(), reach.AppLayout, '/vulnerabilities/workloads')
  assert.match(html, /href="\/vulnerabilities\/workloads"[^>]*>워크로드</)
  assert.match(html, /href="\/vulnerabilities\/scans"[^>]*>스캔</)
  assert.match(html, /<span>워크로드<\/span>/) // 상단 바 제목
})

test('running basis names unscanned running images and the fallback', () => {
  const base = { ...reach.sampleReachSummary(), scope: { targetId: null, scanId: null } }
  const running = client()
  running.setQueryData(['reach-summary', 'RUNNING'], { data: { ...base, basis: { requested: 'RUNNING', applied: 'RUNNING', scans: [],
    unscannedRunning: [{ app: 'CHAT', namespace: 'reused', name: 'reused-chat', container: 'reused-chat',
      imageRepository: 'logssey/reused-chat', imageDigest: 'sha256:' + 'd'.repeat(64) }] } }, sample: false })
  const html = renderAt(running, reach.VulnerabilitySummaryPage, '/vulnerabilities')
  assert.match(html, /실행 중인데 스캔되지 않은 이미지가 1개/)
  assert.match(html, /CHAT<\/strong> reused\/reused-chat/)
  assert.match(html, /운영에서 실행 중인 이미지의 스캔/)

  const fallback = client()
  fallback.setQueryData(['reach-summary', 'RUNNING'], { data: { ...base, basis: { requested: 'RUNNING', applied: 'LATEST', scans: [], unscannedRunning: [] } }, sample: false })
  assert.match(renderAt(fallback, reach.VulnerabilitySummaryPage, '/vulnerabilities'), /실행 중인 이미지를 아직 몰라서/)
})

test('summary without a single baseline scan says how the scope is chosen instead of #—', () => {
  const queryClient = client()
  queryClient.setQueryData(['reach-summary', 'RUNNING'], { data: { ...reach.sampleReachSummary(), scope: { targetId: null, scanId: null } }, sample: false })
  const html = renderAt(queryClient, reach.VulnerabilitySummaryPage, '/vulnerabilities')
  assert.match(html, /기준: 앱마다 최신 완료 스캔\(PR 검사 제외\)/)
  assert.doesNotMatch(html, /#—/)

  const one = client()
  one.setQueryData(['reach-summary', 'RUNNING'], { data: { ...reach.sampleReachSummary(), scope: { targetId: 1, scanId: 7 } }, sample: false })
  assert.match(renderAt(one, reach.VulnerabilitySummaryPage, '/vulnerabilities'), /기준 스캔 #7/)
})
