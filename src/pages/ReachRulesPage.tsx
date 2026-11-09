import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  fetchReachRuleData,
  fetchReachRuleFindings,
  isMissingEndpoint,
  type ReachFindingListItem,
  type ReachRule,
  type ReachRuleData,
} from '@/api/reach'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { ReachMethodTag, ReachReviewBadge, ReachStatusBadge } from '@/components/ReachBadges'
import {
  evaluationClauses,
  factDefinitionLines,
  factMatches,
  factRows,
  groupVulnFunctions,
  packageName,
  readRulesTab,
  ruleFindings,
  ruleMatches,
  shortClassName,
  sortRules,
  vulnFunctionGroupMatches,
  type ConditionTerm,
  type EvaluationStep,
  type FactRow,
  type RulesTab,
  type VulnFunctionGroup,
} from '@/lib/reachRules'
import { labelOf, reachStatusLabel } from '@/lib/reachLabels'
import { VULNERABILITY_FINDINGS_PATH, VULNERABILITY_RULES_PATH } from '@/lib/reachRoutes'
import './reach.css'

// SCR-06 규칙·취약 함수 데이터 (/vulnerabilities/rules). 조회 전용이다. 규칙과 취약 함수는 데이터 파일로 추가한다(NFR-07).
// 탭(tab)·고른 규칙(rule)·사실(fact)·CVE(cve)·검색어(q)는 주소 쿼리에 남긴다

const RULE_DATA_QUERY_KEY = ['reach-rule-data']
const RULE_FINDINGS_QUERY_KEY = ['reach-rule-findings']

const stepLabel: Record<EvaluationStep, string> = {
  REACHABLE: '도달 가능',
  UNREACHABLE: '도달 불가',
  UNKNOWN: '미확인',
  DEFAULT: '기본값',
}

export function rulesLink(params: Record<string, string>): string {
  return `${VULNERABILITY_RULES_PATH}?${new URLSearchParams(params)}`
}

function findingLink(finding: ReachFindingListItem): string {
  return `${VULNERABILITY_FINDINGS_PATH}?finding=${finding.id}`
}

function Term({ term }: { term: ConditionTerm }) {
  // 한글은 일반 글꼴로, 사실 ID만 고정폭으로 쓴다 (고정폭 글꼴에 한글이 없는 환경이 있다)
  const prefix = term.negated ? <span className="reach-term-not">없음</span> : null
  if (!term.factId)
    return (
      <span className="badge reach-method reach-term">
        {prefix}
        {term.label}
      </span>
    )
  return (
    <Link className={`badge reach-term reach-fact-tag ${term.negated ? 'negated' : ''}`.trim()} to={rulesLink({ tab: 'facts', fact: term.factId })}>
      {prefix}
      <code className="reach-term-id">{term.label}</code>
    </Link>
  )
}

/** 조건 한 칸. 줄끼리는 "또는", 한 줄 안은 "그리고" */
function Clauses({ clauses }: { clauses: ConditionTerm[][] }) {
  if (!clauses.length) return <span className="caption">조건 없음</span>
  return (
    <ul className="reach-clauses">
      {clauses.map((group, index) => (
        <li key={index}>
          {index > 0 && <span className="reach-or">또는</span>}
          {group.map((term, termIndex) => (
            <span key={`${term.name}-${termIndex}`} className="reach-and">
              {termIndex > 0 && <span className="caption"> 그리고 </span>}
              <Term term={term} />
            </span>
          ))}
        </li>
      ))}
    </ul>
  )
}

/** SCR-06-05. 위에서부터 처음 맞는 줄이 판정이 된다 */
export function EvaluationTable({ rule }: { rule: ReachRule }) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="평가 순서 표">
      <table className="reach-table reach-eval-table">
        <thead>
          <tr>
            <th scope="col">순서</th>
            <th scope="col">조건</th>
            <th scope="col">이유</th>
          </tr>
        </thead>
        <tbody>
          {rule.evaluationOrder.map((step, index) => {
            const status = step === 'DEFAULT' ? rule.defaultStatus : step
            const reason = step === 'DEFAULT' ? null : rule.reasons?.[step]
            return (
              <tr key={step}>
                <th scope="row" className="reach-nowrap">
                  {index + 1}. {stepLabel[step]}
                  {step === 'DEFAULT' && (
                    <span className="asset">
                      → <ReachStatusBadge status={status} />
                    </span>
                  )}
                </th>
                <td>
                  {step === 'DEFAULT' ? (
                    <span className="caption">위 조건에 모두 맞지 않으면 {labelOf(reachStatusLabel, status)}</span>
                  ) : rule.definition ? (
                    <Clauses clauses={evaluationClauses(rule, step)} />
                  ) : (
                    <span className="caption">조건 원문 없음</span>
                  )}
                </td>
                <td className="reach-reason">{reason ?? <span className="caption">—</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function RuleList({
  rules,
  selectedId,
  findings,
  onSelect,
}: {
  rules: ReachRule[]
  selectedId: string | null
  findings: ReachFindingListItem[] | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="규칙 목록">
      <table className="reach-table reach-rule-list">
        <thead>
          <tr>
            <th scope="col">규칙</th>
            <th scope="col">방식</th>
            <th scope="col" title="기본 범위(앱마다 최신 완료 스캔)에서 이 규칙이 적용되는 Finding 수">
              적용 Finding
            </th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr
              key={rule.id}
              className={`reach-row ${rule.id === selectedId ? 'selected' : ''}`.trim()}
              onClick={() => onSelect(rule.id)}
              aria-selected={rule.id === selectedId}
            >
              <td>
                <button type="button" className="reach-row-button" aria-label={`${rule.id} 상세 보기`}>
                  <strong className="reach-mono reach-rule-list-id">{rule.id}</strong>
                </button>
                <span className="asset">{rule.packages.map(packageName).join(', ')}</span>
              </td>
              <td>
                <ReachMethodTag method={rule.method} />
              </td>
              <td>{findings ? ruleFindings(rule, findings).length : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RuleDetail({ rule, data, findings }: { rule: ReachRule; data: ReachRuleData; findings: ReachFindingListItem[] | null }) {
  const applied = findings ? ruleFindings(rule, findings) : null
  const functionCount = data.vulnFunctions.filter((fn) => fn.cve === rule.cve).length
  return (
    <section className="card reach-rule-detail" aria-label={`${rule.id} 상세`}>
      <header className="reach-rule-head">
        <div className="row reach-title-row">
          <h2 className="reach-mono reach-rule-id">{rule.id}</h2>
          <ReachMethodTag method={rule.method} />
        </div>
        <p className="caption">
          <Link className="reach-link" to={`${VULNERABILITY_FINDINGS_PATH}?cve=${encodeURIComponent(rule.cve)}`}>
            {rule.cve}
          </Link>{' '}
          · 대상 {rule.packages.map((pkg) => <code key={pkg} className="reach-mono">{pkg}</code>)}
        </p>
      </header>

      <div className="reach-section">
        <h4>평가 순서</h4>
        <EvaluationTable rule={rule} />
        <p className="caption">위에서부터 처음 맞는 줄이 판정이에요. 어느 줄로 판정됐는지는 Finding 상세의 적용 규칙에서 볼 수 있어요.</p>
      </div>

      <div className="reach-section">
        <h4>쓰는 사실</h4>
        <div className="reach-tags">
          {rule.facts.length ? (
            rule.facts.map((fact) => (
              <Link key={fact} className="badge reach-term reach-fact-tag" to={rulesLink({ tab: 'facts', fact })}>
                <code className="reach-term-id">{fact}</code>
              </Link>
            ))
          ) : (
            <span className="caption">사실 없이 호출 그래프 결과로만 판정해요.</span>
          )}
          {(rule.infoFacts ?? []).map((fact) => (
            <Link key={fact} className="badge reach-term reach-fact-tag info" to={rulesLink({ tab: 'facts', fact })}>
              <code className="reach-term-id">{fact}</code> <span className="caption">판정에 쓰지 않음</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="reach-section">
        <h4>취약 함수</h4>
        <p className="caption">
          {functionCount ? (
            <Link className="reach-link" to={rulesLink({ tab: 'functions', cve: rule.cve })}>
              {functionCount}개 보기
            </Link>
          ) : (
            '이 CVE의 취약 함수 데이터가 없어요.'
          )}
        </p>
      </div>

      <div className="reach-section">
        <h4>적용 Finding</h4>
        {applied === null ? (
          <p className="caption">Finding을 불러오지 못해 적용 Finding을 보여줄 수 없어요.</p>
        ) : applied.length === 0 ? (
          <p className="caption">이 규칙을 쓴 Finding이 아직 없어요.</p>
        ) : (
          <ul className="reach-applied">
            {applied.map((finding) => (
              <li key={finding.id}>
                <Link className="reach-link" to={findingLink(finding)}>
                  #{finding.id}
                </Link>{' '}
                {finding.component.name} {finding.component.version} <ReachStatusBadge status={finding.verdict.status} />{' '}
                <ReachReviewBadge state={finding.review.reviewState} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="caption reach-note">
        대조군·회귀 테스트와 규칙 변경 이력은 아직 API에 없어요(SCR-06-07·08). 규칙 데이터 {rule.version ?? data.rulesVersion ?? '버전 모름'} 기준이에요.
      </p>
    </section>
  )
}

function FactTable({ rows, selected }: { rows: FactRow[]; selected: string | null }) {
  // 규칙 상세에서 사실을 눌러 들어오면 그 줄을 화면에 보인다
  useEffect(() => {
    if (selected) document.getElementById(`fact-${selected}`)?.scrollIntoView({ block: 'center' })
  }, [selected])
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="사실 표. 좁은 화면에서는 가로로 스크롤하세요.">
      <table className="reach-table reach-fact-table">
        <thead>
          <tr>
            <th scope="col">사실 ID</th>
            <th scope="col">수집 방법</th>
            <th scope="col">쓰는 규칙</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} id={`fact-${row.id}`} className={row.id === selected ? 'reach-row selected' : undefined}>
              <td>
                <code className="reach-mono reach-fact-id">{row.id}</code>
              </td>
              <td>
                {row.definition?.type ? <span className="badge reach-method">{String(row.definition.type)}</span> : null}
                {factDefinitionLines(row.definition).map((line) => (
                  <span key={line} className="asset reach-mono">
                    {line}
                  </span>
                ))}
                {!row.definition && <span className="caption">정의 없음(참고 사실)</span>}
              </td>
              <td>
                <div className="reach-tags">
                  {row.usedBy.map((use) => (
                    <Link key={use.ruleId} className="reach-link" to={rulesLink({ tab: 'rules', rule: use.ruleId })}>
                      {use.ruleId}
                      {use.informational && <span className="caption"> (참고)</span>}
                    </Link>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function VulnFunctionTable({ groups, openCve, rules }: { groups: VulnFunctionGroup[]; openCve: string | null; rules: ReachRule[] }) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="취약 함수 표. 좁은 화면에서는 가로로 스크롤하세요.">
      <table className="reach-table reach-function-table">
        <thead>
          <tr>
            <th scope="col">CVE</th>
            <th scope="col">패키지</th>
            <th scope="col">취약 함수</th>
            <th scope="col">수정 버전</th>
            <th scope="col">출처·확인</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const rule = rules.find((item) => item.cve === group.cve)
            return (
              <tr key={group.cve} className={group.cve === openCve ? 'reach-row selected' : undefined}>
                <td className="reach-nowrap">
                  {rule ? (
                    <Link className="reach-link" to={rulesLink({ tab: 'rules', rule: rule.id })}>
                      {group.cve}
                    </Link>
                  ) : (
                    group.cve
                  )}
                </td>
                <td className="reach-nowrap">{group.packages.map(packageName).join(', ')}</td>
                <td>
                  <details open={group.cve === openCve}>
                    <summary>
                      {group.functions.length}개 · {group.functions.slice(0, 2).map((fn) => `${shortClassName(fn.class)}.${fn.method}`).join(', ')}
                      {group.functions.length > 2 && ' …'}
                    </summary>
                    <ul className="reach-function-list">
                      {group.functions.map((fn) => (
                        <li key={fn.id}>
                          <code className="reach-mono">
                            {fn.class}.{fn.method}
                            {fn.descriptor ?? ''}
                          </code>
                          {fn.note && <span className="caption"> {fn.note}</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                </td>
                <td>{group.fixedVersions.join(', ') || <span className="caption">—</span>}</td>
                <td>
                  {group.fixCommits.map((commit) => (
                    <span key={commit} className="asset reach-mono">
                      {commit}
                    </span>
                  ))}
                  {group.confidences.length > 0 && <span className="caption">확신도 {group.confidences.join(', ')}</span>}
                  {!group.fixCommits.length && !group.confidences.length && <span className="caption">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function RulesView({
  data,
  findings,
  tab,
  query,
  selectedRuleId,
  selectedFact,
  openCve,
  onTab,
  onSelectRule,
}: {
  data: ReachRuleData
  findings: ReachFindingListItem[] | null
  tab: RulesTab
  query: string
  selectedRuleId: string | null
  selectedFact: string | null
  openCve: string | null
  onTab: (tab: RulesTab) => void
  onSelectRule: (id: string) => void
}) {
  const rules = sortRules(data.rules)
  const facts = factRows(data.rules)
  const groups = groupVulnFunctions(data.vulnFunctions)
  const shownRules = rules.filter((rule) => ruleMatches(rule, query, data.vulnFunctions))
  const shownFacts = facts.filter((row) => factMatches(row, query))
  const shownGroups = groups.filter((group) => vulnFunctionGroupMatches(group, query))
  const selected = shownRules.find((rule) => rule.id === selectedRuleId) ?? shownRules[0] ?? null

  const tabs: Array<{ id: RulesTab; label: string; count: string }> = [
    { id: 'rules', label: 'CVE 규칙', count: String(rules.length) },
    { id: 'facts', label: '사실', count: String(facts.length) },
    { id: 'functions', label: '취약 함수', count: `${groups.length} CVE · ${data.vulnFunctions.length}` },
  ]

  return (
    <div className="stack">
      <div className="tabs reach-tabs" role="tablist" aria-label="규칙 데이터">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`tab reach-tab ${tab === item.id ? 'active' : ''}`.trim()}
            onClick={() => onTab(item.id)}
          >
            {item.label} <span className="caption">{item.count}</span>
          </button>
        ))}
      </div>

      {tab === 'rules' &&
        (shownRules.length === 0 ? (
          <section className="card">
            <EmptyState title="맞는 규칙이 없어요" description="검색어를 바꿔 보세요." />
          </section>
        ) : (
          <div className="reach-rules-layout">
            <section className="card list-card">
              <RuleList rules={shownRules} selectedId={selected?.id ?? null} findings={findings} onSelect={onSelectRule} />
            </section>
            {selected && <RuleDetail rule={selected} data={data} findings={findings} />}
          </div>
        ))}

      {tab === 'facts' && (
        <section className="card list-card">
          {shownFacts.length ? (
            <FactTable rows={shownFacts} selected={selectedFact} />
          ) : (
            <EmptyState title="맞는 사실이 없어요" description="검색어를 바꿔 보세요." />
          )}
          <p className="caption reach-table-notice">
            사실 목록 API가 없어 규칙에 나오는 사실만 모았어요. 사실의 뜻과 수집 범위는 규칙명세서 7절이 기준이에요.
          </p>
        </section>
      )}

      {tab === 'functions' && (
        <section className="card list-card">
          {shownGroups.length ? (
            <VulnFunctionTable groups={shownGroups} openCve={openCve} rules={rules} />
          ) : (
            <EmptyState title="맞는 취약 함수가 없어요" description="검색어를 바꿔 보세요." />
          )}
          <p className="caption reach-table-notice">수정으로 바뀐 메서드예요. 호출 그래프 판정은 이 메서드까지 닿는지 봐요.</p>
        </section>
      )}
    </div>
  )
}

export function VulnerabilityRulesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = readRulesTab(searchParams.get('tab'))
  const query = searchParams.get('q') ?? ''
  const [queryInput, setQueryInput] = useState(query)
  const ruleData = useQuery({ queryKey: RULE_DATA_QUERY_KEY, queryFn: fetchReachRuleData, staleTime: 5 * 60_000 })
  const findings = useQuery({ queryKey: RULE_FINDINGS_QUERY_KEY, queryFn: fetchReachRuleFindings })

  const update = (changes: Record<string, string | null>) =>
    setSearchParams(
      (previous) => {
        const params = new URLSearchParams(previous)
        for (const [key, value] of Object.entries(changes)) {
          if (value) params.set(key, value)
          else params.delete(key)
        }
        return params
      },
      { replace: true },
    )

  const data = ruleData.data
  const missing = ruleData.isError && isMissingEndpoint(ruleData.error)
  const dataLine = data
    ? `규칙 데이터 ${data.rulesVersion ?? '—'} · 취약 함수 데이터 ${data.vulnFunctionsVersion ?? '—'}${data.vulnFunctionsGenerated ? ` (${data.vulnFunctionsGenerated})` : ''}`
    : '판정에 쓰는 규칙·사실·취약 함수 데이터를 확인하세요.'

  return (
    <>
      <PageHeader
        title="규칙"
        description={dataLine}
        actions={
          <form
            className="row reach-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              update({ q: queryInput.trim() || null })
            }}
          >
            <input
              className="input reach-cve-input"
              type="search"
              value={queryInput}
              placeholder="RULE-ID, CVE, 패키지, 사실, 함수"
              aria-label="규칙 데이터 검색"
              onChange={(event) => {
                setQueryInput(event.target.value)
                if (!event.target.value) update({ q: null })
              }}
            />
            <button type="submit" className="btn outline small">
              찾기
            </button>
          </form>
        }
      />
      {findings.data?.sample && (
        <p className="notice page-notice" role="status">
          백엔드에 Finding 목록 API(API-04)가 없어 적용 Finding은 명세 예시 값으로 세고 있어요.
        </p>
      )}

      {ruleData.isPending && (
        <div className="reach-loading" role="status" aria-live="polite">
          {[0, 1, 2].map((row) => (
            <div key={row} className="skeleton" />
          ))}
          <span className="reach-sr-only">불러오는 중</span>
        </div>
      )}
      {ruleData.isError && (
        <p className="notice error" role="alert">
          {missing
            ? '백엔드에 규칙·취약 함수 API(API-09·10)가 없어요. develop을 받아 백엔드를 다시 띄워 주세요.'
            : '규칙 데이터를 불러오지 못했어요.'}{' '}
          <button type="button" className="btn outline small" onClick={() => void ruleData.refetch()}>
            다시 시도
          </button>
        </p>
      )}

      {data && (
        <RulesView
          data={data}
          findings={findings.data?.data ?? null}
          tab={tab}
          query={query}
          selectedRuleId={searchParams.get('rule')}
          selectedFact={searchParams.get('fact')}
          openCve={searchParams.get('cve')}
          onTab={(next) => update({ tab: next === 'rules' ? null : next, fact: null, cve: null })}
          onSelectRule={(id) => update({ rule: id })}
        />
      )}
    </>
  )
}
