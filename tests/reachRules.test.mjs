// Reach 규칙·취약 함수 화면(SCR-06) 테스트
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
      "export * from '@/lib/reachRules'",
      "export { RulesView, EvaluationTable, rulesLink, VulnerabilityRulesPage } from '@/pages/ReachRulesPage'",
      "export { vulnerabilityPages, VULNERABILITY_RULES_PATH } from '@/lib/reachRoutes'",
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
const bundlePath = resolve('node_modules/.reach-rules-test.mjs')
await writeFile(bundlePath, bundled.outputFiles[0].contents)
const reach = await import(pathToFileURL(bundlePath).href)
after(() => unlink(bundlePath))

const BC = 'pkg:maven/org.bouncycastle/bcprov-jdk18on'
const JACKSON = 'pkg:maven/tools.jackson.core/jackson-core'

// API-09 응답 모양(include=definition). 값은 동봉 데이터(rules.json v0)에서 줄였다
const callgraphRule = {
  id: 'RULE-CVE-2026-13506',
  cve: 'CVE-2026-13506',
  method: 'CALLGRAPH',
  packages: [BC],
  facts: [],
  evaluationOrder: ['REACHABLE', 'UNREACHABLE', 'UNKNOWN', 'DEFAULT'],
  defaultStatus: 'UNREACHABLE',
  reasons: { REACHABLE: '취약 메서드까지 경로가 있다.', UNKNOWN: '분석한 jar에서 취약 메서드를 찾지 못했다.' },
  vulnFunctionIds: [19, 20, 21],
  definition: { verdict: { method: 'callgraph', reachable_if: [['sink']], unknown_if: [['sinks_missing'], ['sink_weak']], otherwise: 'unreachable' }, facts: [] },
  version: 'v0',
}

const ruleRule = {
  id: 'RULE-CVE-2026-89407',
  cve: 'CVE-2026-89407',
  method: 'RULE',
  packages: [JACKSON],
  facts: ['F-dto.floating', 'F-dto.floating.tokens', 'F-jackson.polymorphicSerializer'],
  infoFacts: ['F-dto.floating.any'],
  evaluationOrder: ['REACHABLE', 'UNREACHABLE', 'UNKNOWN', 'DEFAULT'],
  defaultStatus: 'UNREACHABLE',
  reasons: { REACHABLE: '역직렬화 타입에 실수형 필드가 있다.', UNREACHABLE: '실수형 필드가 응답 전용 타입에만 있다.' },
  vulnFunctionIds: [30],
  definition: {
    verdict: {
      method: 'rule',
      reachable_if: [['dto.floating']],
      unreachable_if: [['!dto.floating.tokens', '!jackson.polymorphicSerializer']],
      unknown_if: [['dto.floating.tokens'], ['jackson.polymorphicSerializer'], ['sink']],
      otherwise: 'unreachable',
    },
    facts: [
      { id: 'dto.floating', type: 'dto-field', kinds: ['float', 'double'] },
      { id: 'jackson.polymorphicSerializer', type: 'new', classes: ['org/springframework/data/redis/serializer/GenericJackson2JsonRedisSerializer'] },
    ],
  },
  version: 'v0',
}

const earlyRule = { ...callgraphRule, id: 'RULE-CVE-2026-8763', cve: 'CVE-2026-8763', vulnFunctionIds: [1] }

const fn = (id, cve, cls, method, extra = {}) => ({ id, cve, package: BC, class: cls, method, descriptor: '()V', fixedVersions: ['1.85'], confidence: 'high', ...extra })
const functions = [
  fn(19, 'CVE-2026-13506', 'org.bouncycastle.asn1.LazyEncodedSequence', 'force', { fixCommits: ['bcgit/bc-java@77454da9'] }),
  fn(20, 'CVE-2026-13506', 'org.bouncycastle.asn1.LazyEncodedSequence', 'getObjects'),
  fn(21, 'CVE-2026-13506', 'org.bouncycastle.asn1.LazyConstructionEnumeration', '<init>', { fixedVersions: ['1.85', '1.80.2'] }),
  fn(1, 'CVE-2026-8763', 'org.bouncycastle.asn1.x509.PKIXNameConstraintValidator', 'emailIsConstrained'),
  fn(30, 'CVE-2026-89407', 'tools.jackson.core.io.NumberInput', 'looksLikeValidNumber', { package: JACKSON }),
]

const finding = (id, cve, purl, status = 'UNREACHABLE') => ({
  id,
  scanId: 1,
  targetId: 1,
  component: { purl, name: purl.split('/').pop().split('@')[0], version: purl.split('@')[1] },
  vulnerability: { id: cve, severity: 'HIGH', fixedVersions: [] },
  deployment: 'RUNNING',
  verdict: { status, method: 'CALLGRAPH', summary: '' },
  review: { reviewState: 'CONFIRMED', disagreesWithTool: false },
  firstSeenAt: '2026-10-10T00:00:00Z',
})
const findings = [
  finding(101, 'CVE-2026-13506', `${BC}@1.81`),
  finding(102, 'CVE-2026-13506', 'pkg:maven/org.bouncycastle/bcpkix-jdk18on@1.81'),
  finding(103, 'CVE-2026-89407', `${JACKSON}@3.1.5`),
  finding(104, 'CVE-2026-89407', 'pkg:maven/com.fasterxml.jackson.core/jackson-core@2.21.5'),
]

const data = {
  rules: [ruleRule, callgraphRule, earlyRule],
  rulesVersion: 'v0',
  vulnFunctions: functions,
  vulnFunctionsVersion: 'v0',
  vulnFunctionsGenerated: '2026-10-10',
}

function renderView(props, url = '/vulnerabilities/rules') {
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [url] },
    createElement(reach.RulesView, {
      data,
      findings,
      tab: 'rules',
      query: '',
      selectedRuleId: null,
      selectedFact: null,
      openCve: null,
      onTab: () => {},
      onSelectRule: () => {},
      ...props,
    })))
}

test('탭 값은 rules·facts·functions만 받고 나머지는 규칙 탭이다', () => {
  assert.equal(reach.readRulesTab('facts'), 'facts')
  assert.equal(reach.readRulesTab('functions'), 'functions')
  assert.equal(reach.readRulesTab(null), 'rules')
  assert.equal(reach.readRulesTab('other'), 'rules')
})

test('조건은 또는(바깥)·그리고(안쪽)로 풀고, 부정과 호출 그래프 결과를 구분한다', () => {
  const unreachable = reach.evaluationClauses(ruleRule, 'UNREACHABLE')
  assert.equal(unreachable.length, 1)
  assert.deepEqual(unreachable[0].map((term) => [term.factId, term.negated]), [
    ['F-dto.floating.tokens', true],
    ['F-jackson.polymorphicSerializer', true],
  ])
  const unknown = reach.evaluationClauses(ruleRule, 'UNKNOWN')
  assert.equal(unknown.length, 3)
  assert.equal(unknown[2][0].factId, null)
  assert.match(unknown[2][0].label, /호출 그래프/)
  assert.deepEqual(reach.evaluationClauses(ruleRule, 'DEFAULT'), [])
  assert.deepEqual(reach.evaluationClauses({ ...ruleRule, definition: undefined }, 'REACHABLE'), [])
})

test('규칙은 같은 CVE이고 규칙 패키지(버전 무시)인 Finding에만 적용된다', () => {
  assert.deepEqual(reach.ruleFindings(callgraphRule, findings).map((item) => item.id), [101])
  assert.deepEqual(reach.ruleFindings(ruleRule, findings).map((item) => item.id), [103])
  assert.equal(reach.ruleAppliesTo(callgraphRule, finding(1, 'CVE-2026-13506', BC)), true)
  assert.equal(reach.ruleAppliesTo(callgraphRule, finding(1, 'CVE-2026-13506', `${BC}-extra@1`)), false)
})

test('규칙은 CVE 연도·번호를 숫자로 비교해 정렬한다', () => {
  assert.deepEqual(reach.sortRules(data.rules).map((rule) => rule.cve), ['CVE-2026-8763', 'CVE-2026-13506', 'CVE-2026-89407'])
})

test('사실 표는 규칙의 사실·참고 사실을 모으고 정의를 붙인다', () => {
  const rows = reach.factRows(data.rules)
  assert.deepEqual(rows.map((row) => row.id), [
    'F-dto.floating',
    'F-dto.floating.any',
    'F-dto.floating.tokens',
    'F-jackson.polymorphicSerializer',
  ])
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]))
  assert.equal(byId['F-dto.floating'].definition.type, 'dto-field')
  assert.deepEqual(reach.factDefinitionLines(byId['F-dto.floating'].definition), ['kinds: float, double'])
  assert.equal(byId['F-dto.floating.tokens'].definition, null)
  assert.deepEqual(byId['F-dto.floating.any'].usedBy, [{ ruleId: 'RULE-CVE-2026-89407', informational: true }])
  assert.deepEqual(byId['F-jackson.polymorphicSerializer'].usedBy, [{ ruleId: 'RULE-CVE-2026-89407', informational: false }])
  // 한 규칙에서 판정에도 쓰고 참고로도 나오면 판정 쪽 한 번만 센다
  const both = reach.factRows([{ ...ruleRule, infoFacts: ['F-dto.floating'] }])
  assert.deepEqual(both.find((row) => row.id === 'F-dto.floating').usedBy, [{ ruleId: 'RULE-CVE-2026-89407', informational: false }])
})

test('취약 함수는 CVE마다 묶고 수정 버전·커밋을 합친다', () => {
  const groups = reach.groupVulnFunctions(functions)
  assert.deepEqual(groups.map((group) => group.cve), ['CVE-2026-8763', 'CVE-2026-13506', 'CVE-2026-89407'])
  const group = groups[1]
  assert.equal(group.functions.length, 3)
  assert.deepEqual(group.fixedVersions, ['1.85', '1.80.2'])
  assert.deepEqual(group.fixCommits, ['bcgit/bc-java@77454da9'])
  assert.deepEqual(group.confidences, ['high'])
  assert.equal(reach.shortClassName('org.bouncycastle.asn1.LazyEncodedSequence'), 'LazyEncodedSequence')
  assert.equal(reach.packageName(`${BC}@1.81`), 'bcprov-jdk18on')
})

test('검색은 RULE-ID·CVE·패키지·사실·함수 이름에서 찾는다(대소문자 무시)', () => {
  assert.equal(reach.ruleMatches(ruleRule, 'polymorphic'), true)
  assert.equal(reach.ruleMatches(callgraphRule, 'getobjects', functions), true)
  assert.equal(reach.ruleMatches(callgraphRule, 'getobjects'), false)
  assert.equal(reach.ruleMatches(ruleRule, 'bcprov'), false)
  assert.equal(reach.ruleMatches(ruleRule, '  '), true)
  const groups = reach.groupVulnFunctions(functions)
  assert.deepEqual(groups.filter((group) => reach.vulnFunctionGroupMatches(group, 'LazyConstruction')).map((group) => group.cve), ['CVE-2026-13506'])
  const rows = reach.factRows(data.rules)
  assert.deepEqual(rows.filter((row) => reach.factMatches(row, 'redis')).map((row) => row.id), ['F-jackson.polymorphicSerializer'])
})

test('규칙 탭: 목록은 CVE 순, 고른 규칙이 없으면 첫 규칙을 상세로 보인다', () => {
  const html = renderView({})
  assert.ok(html.indexOf('RULE-CVE-2026-8763') < html.indexOf('RULE-CVE-2026-13506'))
  assert.match(html, /aria-label="RULE-CVE-2026-8763 상세"/)
  assert.match(html, /aria-selected="true" class="tab reach-tab active">CVE 규칙/)
  assert.match(html, /취약 함수 <span class="caption">3 CVE · 5<\/span>/)
})

test('규칙 상세: 평가 순서 4줄, 사실 링크, 참고 사실, 적용 Finding', () => {
  const html = renderView({ selectedRuleId: 'RULE-CVE-2026-89407' })
  assert.match(html, /aria-label="RULE-CVE-2026-89407 상세"/)
  for (const step of ['1. 호출 가능', '2. 취약 조건 미충족', '3. 미확인', '4. 기본값']) assert.ok(html.includes(step), step)
  assert.match(html, /href="\/vulnerabilities\/rules\?tab=facts&amp;fact=F-dto.floating.tokens"/)
  assert.match(html, /reach-fact-tag negated"[^>]*><span class="reach-term-not">없음<\/span><code class="reach-term-id">F-dto.floating.tokens<\/code>/)
  assert.match(html, /<code class="reach-term-id">F-dto.floating.any<\/code> <span class="caption">판정에 쓰지 않음<\/span>/)
  assert.match(html, /href="\/vulnerabilities\/findings\?finding=103"/)
  assert.doesNotMatch(html, /finding=104/)
  assert.match(html, /href="\/vulnerabilities\/findings\?cve=CVE-2026-89407"/)
  assert.match(html, /역직렬화 타입에 실수형 필드가 있다/)
})

test('규칙 상세: 취약점을 못 받았거나 적용 취약점이 없을 때', () => {
  assert.match(renderView({ findings: null, selectedRuleId: 'RULE-CVE-2026-89407' }), /취약점을 불러오지 못해/)
  assert.match(renderView({ selectedRuleId: 'RULE-CVE-2026-8763' }), /이 규칙을 쓴 취약점이 아직 없어요/)
})

test('검색어에 맞는 규칙이 없으면 빈 상태를 보인다', () => {
  assert.match(renderView({ query: 'no-such-thing' }), /맞는 규칙이 없어요/)
})

test('사실 탭: 고른 사실 줄을 강조하고 쓰는 규칙으로 이동한다', () => {
  const html = renderView({ tab: 'facts', selectedFact: 'F-dto.floating' })
  assert.match(html, /id="fact-F-dto.floating" class="reach-row selected"/)
  assert.match(html, /href="\/vulnerabilities\/rules\?tab=rules&amp;rule=RULE-CVE-2026-89407"/)
  assert.match(html, /정의 없음\(참고 사실\)/)
})

test('취약 함수 탭: CVE 한 줄로 묶고, 주소의 CVE는 펼친다', () => {
  const html = renderView({ tab: 'functions', openCve: 'CVE-2026-13506' })
  assert.match(html, /<details open="">/)
  assert.match(html, /3개 · LazyEncodedSequence.force, LazyEncodedSequence.getObjects …/)
  assert.match(html, /org.bouncycastle.asn1.LazyConstructionEnumeration.&lt;init&gt;\(\)V/)
  assert.match(html, /bcgit\/bc-java@77454da9/)
  assert.equal((html.match(/<details open="">/g) ?? []).length, 1)
})

test('사이드바 하위 메뉴에 규칙이 있다', () => {
  assert.equal(reach.VULNERABILITY_RULES_PATH, '/vulnerabilities/rules')
  assert.ok(reach.vulnerabilityPages.some((page) => page.path === '/vulnerabilities/rules' && page.title === '검사 기준'))
  assert.equal(reach.rulesLink({ tab: 'facts', fact: 'F-a' }), '/vulnerabilities/rules?tab=facts&fact=F-a')
})

test('페이지: 데이터를 받기 전에는 불러오는 중을 보인다', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client },
    createElement(MemoryRouter, { initialEntries: ['/vulnerabilities/rules'] }, createElement(reach.VulnerabilityRulesPage))))
  assert.match(html, /불러오는 중/)
  assert.match(html, /규칙 데이터 검색/)
})
