// 규칙·취약 함수 화면(SCR-06) 계산. 데이터가 작아(규칙 14개, 함수 46개) 받은 목록 안에서 찾고 묶는다
import type { ReachFindingListItem, ReachRule, ReachRuleCondition, ReachRuleDefinition, ReachVulnFunction } from '@/api/reach'
import { compareCve } from './reach'

export type RulesTab = 'rules' | 'facts' | 'functions'

export function readRulesTab(value: string | null): RulesTab {
  return value === 'facts' || value === 'functions' ? value : 'rules'
}

/** 호출 그래프 결과. 사실이 아니라 API-09 facts에서 빠지고 조건 원문(definition)에만 나온다 */
const callgraphResultLabel: Record<string, string> = {
  sink: '호출 그래프: 취약 함수에 닿음',
  sink_weak: '호출 그래프: 약한 경로로만 닿음',
  sinks_missing: '호출 그래프: 분석한 jar에 취약 함수 없음',
}

export function isCallgraphResult(name: string): boolean {
  return name in callgraphResultLabel
}

/** 조건 원문의 사실 이름 → API·근거와 같은 사실 ID(F-…). "!"는 뗀다 */
export function factIdOf(name: string): string {
  return `F-${name.replace(/^!/, '')}`
}

export interface ConditionTerm {
  /** 원문 그대로의 이름("!" 뗌) */
  name: string
  negated: boolean
  /** 사실이면 F- ID, 호출 그래프 결과면 null */
  factId: string | null
  label: string
}

/** 조건 한 칸을 "또는"으로 묶인 "그리고" 묶음으로 푼다. 빈 칸이면 빈 배열 */
export function conditionClauses(condition: ReachRuleCondition | undefined): ConditionTerm[][] {
  return (condition ?? []).map((group) =>
    group.map((raw) => {
      const negated = raw.startsWith('!')
      const name = negated ? raw.slice(1) : raw
      const callgraph = isCallgraphResult(name)
      return {
        name,
        negated,
        factId: callgraph ? null : factIdOf(name),
        label: callgraph ? callgraphResultLabel[name] : factIdOf(name),
      }
    }),
  )
}

export type EvaluationStep = 'REACHABLE' | 'UNREACHABLE' | 'UNKNOWN' | 'DEFAULT'

const conditionKey: Record<Exclude<EvaluationStep, 'DEFAULT'>, keyof ReachRuleDefinition['verdict']> = {
  REACHABLE: 'reachable_if',
  UNREACHABLE: 'unreachable_if',
  UNKNOWN: 'unknown_if',
}

/** 평가 순서 한 줄(SCR-06-05). DEFAULT는 조건 없이 defaultStatus가 된다 */
export function evaluationClauses(rule: ReachRule, step: EvaluationStep): ConditionTerm[][] {
  if (step === 'DEFAULT') return []
  const verdict = rule.definition?.verdict
  return conditionClauses(verdict?.[conditionKey[step]] as ReachRuleCondition | undefined)
}

/** pkg:maven/org.bouncycastle/bcprov-jdk18on@1.81 → bcprov-jdk18on */
export function packageName(purl: string): string {
  const withoutVersion = purl.split('@')[0]
  return withoutVersion.slice(withoutVersion.lastIndexOf('/') + 1)
}

/** org.bouncycastle.asn1.LazyEncodedSequence → LazyEncodedSequence (안쪽 클래스 $는 그대로) */
export function shortClassName(className: string): string {
  return className.slice(className.lastIndexOf('.') + 1)
}

/** 규칙이 적용되는 Finding: 같은 CVE이고 패키지가 규칙의 packages 중 하나(버전 무시) */
export function ruleAppliesTo(rule: ReachRule, finding: ReachFindingListItem): boolean {
  if (finding.vulnerability.id !== rule.cve) return false
  const purl = finding.component.purl
  return rule.packages.some((pkg) => purl === pkg || purl.startsWith(`${pkg}@`))
}

export function ruleFindings(rule: ReachRule, findings: ReachFindingListItem[]): ReachFindingListItem[] {
  return findings.filter((finding) => ruleAppliesTo(rule, finding))
}

/** CVE 연도·번호 순(SCR-06-03) */
export function sortRules(rules: ReachRule[]): ReachRule[] {
  return [...rules].sort((a, b) => compareCve(a.cve, b.cve) || a.id.localeCompare(b.id))
}

export interface FactUse {
  ruleId: string
  /** 참고 사실(infoFacts)로만 쓰면 true */
  informational: boolean
}

export interface FactRow {
  id: string
  /** 조건 원문에 붙은 사실 정의(type, classes, regex 등). 참고 사실은 정의가 없을 수 있다 */
  definition: Record<string, unknown> | null
  usedBy: FactUse[]
}

/**
 * 사실 표(SCR-06-10). 사실 목록 API가 없어(미결 7) 규칙들의 facts·infoFacts를 모은다.
 * 한 규칙에서 판정에도 쓰고 참고로도 나오면 판정 쪽으로 센다
 */
export function factRows(rules: ReachRule[]): FactRow[] {
  const rows = new Map<string, FactRow>()
  const row = (id: string) => {
    let current = rows.get(id)
    if (!current) {
      current = { id, definition: null, usedBy: [] }
      rows.set(id, current)
    }
    return current
  }
  for (const rule of sortRules(rules)) {
    for (const fact of rule.definition?.facts ?? []) {
      const target = row(factIdOf(fact.id))
      if (!target.definition) target.definition = fact
    }
    for (const id of rule.facts) {
      row(id).usedBy.push({ ruleId: rule.id, informational: false })
    }
    for (const id of rule.infoFacts ?? []) {
      const target = row(id)
      if (!target.usedBy.some((use) => use.ruleId === rule.id)) target.usedBy.push({ ruleId: rule.id, informational: true })
    }
  }
  return [...rows.values()].sort((a, b) => a.id.localeCompare(b.id))
}

/** 사실 정의에서 id·type을 뺀 나머지를 "키: 값" 줄로 (JVM 내부 이름은 그대로) */
export function factDefinitionLines(definition: Record<string, unknown> | null): string[] {
  if (!definition) return []
  return Object.entries(definition)
    .filter(([key]) => key !== 'id' && key !== 'type')
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
}

export interface VulnFunctionGroup {
  cve: string
  packages: string[]
  functions: ReachVulnFunction[]
  fixedVersions: string[]
  fixCommits: string[]
  confidences: string[]
  notes: string[]
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

/** 취약 함수 표(SCR-06-11). API는 함수 한 개가 한 줄이고 화면은 CVE 한 개를 한 줄로 묶는다 */
export function groupVulnFunctions(functions: ReachVulnFunction[]): VulnFunctionGroup[] {
  const groups = new Map<string, ReachVulnFunction[]>()
  for (const fn of functions) groups.set(fn.cve, [...(groups.get(fn.cve) ?? []), fn])
  return [...groups.entries()]
    .sort(([a], [b]) => compareCve(a, b))
    .map(([cve, items]) => ({
      cve,
      packages: unique(items.map((fn) => fn.package)),
      functions: items,
      fixedVersions: unique(items.flatMap((fn) => fn.fixedVersions ?? [])),
      fixCommits: unique(items.flatMap((fn) => fn.fixCommits ?? [])),
      confidences: unique(items.map((fn) => fn.confidence)),
      notes: unique(items.map((fn) => fn.note)),
    }))
}

function includes(haystack: Array<string | undefined>, query: string): boolean {
  return haystack.some((value) => value?.toLowerCase().includes(query))
}

function normalize(query: string): string {
  return query.trim().toLowerCase()
}

/** 검색(SCR-06-01): RULE-ID, CVE, 패키지, 사실 ID, 함수 이름 */
export function ruleMatches(rule: ReachRule, query: string, functions: ReachVulnFunction[] = []): boolean {
  const q = normalize(query)
  if (!q) return true
  const ruleFunctions = functions.filter((fn) => fn.cve === rule.cve)
  return includes(
    [rule.id, rule.cve, ...rule.packages, ...rule.facts, ...(rule.infoFacts ?? []), ...ruleFunctions.flatMap((fn) => [fn.class, fn.method])],
    q,
  )
}

export function factMatches(row: FactRow, query: string): boolean {
  const q = normalize(query)
  return !q || includes([row.id, ...row.usedBy.map((use) => use.ruleId), ...factDefinitionLines(row.definition)], q)
}

export function vulnFunctionGroupMatches(group: VulnFunctionGroup, query: string): boolean {
  const q = normalize(query)
  return !q || includes([group.cve, ...group.packages, ...group.functions.flatMap((fn) => [fn.class, fn.method])], q)
}
