// Reach 백엔드가 생기기 전까지 쓰는 예시 데이터.
// 값은 Reach 화면 명세(SCR-01·02)와 API 명세(API-04·05·08) 예시의 PoC 결과 23행이다. 실제 판정 결과가 아니다
import { compareFindings, summarizeFindings } from '@/lib/reach'
import { ApiError } from './client'
import type {
  ReachAppItem,
  ReachFindingDetail,
  ReachFindingFilter,
  ReachFindingListItem,
  ReachFindingPage,
  ReachMethod,
  ReachNotAnalyzedReason,
  ReachProposal,
  ReachReviewState,
  ReachSeverity,
  ReachStatus,
  ReachSummary,
  ReachScan,
  ReachScanFilter,
  ReachScanPage,
  ReachWorkloadList,
} from './reach'

const SEEN_AT = '2026-10-11T01:01:20Z'
const ANALYZED_AT = '2026-10-11T01:01:15Z'
const REVIEWED_AT = '2026-10-11T02:10:00Z'
const GENERATED_AT = '2026-10-11T02:15:00Z'

const BC = 'org.bouncycastle'
const TOMCAT = 'org.apache.tomcat.embed'
const JACKSON3 = 'tools.jackson.core'
const JACKSON2 = 'com.fasterxml.jackson.core'

const NO_TRIGGER = '도달 불가(발동 조건 없음)'
const COPY_REFERENCE = '규칙명세서 9-1, PoC 작업 기록 15-7절'

type Row = {
  severity: ReachSeverity
  cve: string
  name: string
  group: string
  version: string
  fixed: string[]
  status: ReachStatus
  method?: ReachMethod
  reason?: ReachNotAnalyzedReason
  review: ReachReviewState
  summary: string
  proposal?: string
}

const judged = (
  severity: ReachSeverity, cve: string, name: string, group: string, version: string, fixed: string[],
  method: ReachMethod, review: ReachReviewState, summary: string,
): Row => ({ severity, cve, name, group, version, fixed, status: 'UNREACHABLE', method, review, summary })

const jackson2Copy = (severity: ReachSeverity, cve: string, name: string, fixed: string[], proposal: string): Row => ({
  severity, cve, name, group: JACKSON2, version: '2.21.5', fixed, status: 'NOT_ANALYZED', reason: 'UNANALYZED_COPY',
  review: 'UNREVIEWED', summary: '판정하지 않은 패키지 사본', proposal,
})

const osPackage = (cve: string, name: string, version: string, fixed: string[]): Row => ({
  severity: 'MEDIUM', cve, name, group: 'alpine', version, fixed, status: 'NOT_ANALYZED', reason: 'OS_PACKAGE',
  review: 'UNREVIEWED', summary: 'OS 패키지. Java 호출 그래프로 판정하지 않는다',
})

/** SCR-02 예시 데이터 순서(기본 정렬) 그대로 */
const rows: Row[] = [
  judged('CRITICAL', 'CVE-2025-14813', 'bcprov-jdk18on', BC, '1.81', ['1.80.2', '1.81.1', '1.84'], 'CALLGRAPH', 'CONFIRMED', '취약 메서드 G3413CTRBlockCipher.generateCRT에 닿는 경로 없음'),
  judged('CRITICAL', 'CVE-2026-8763', 'bcprov-jdk18on', BC, '1.81', ['1.85'], 'CALLGRAPH', 'CONFIRMED', 'Name Constraints 검증 메서드에 닿지 않는다. BC provider·CertPathValidator 참조 없음'),
  judged('CRITICAL', 'CVE-2026-65182', 'tomcat-embed-core', TOMCAT, '11.0.24', ['11.0.25'], 'RULE', 'CONFIRMED', '컨테이너 보안 제약(security-constraint, @ServletSecurity) 없음'),
  judged('CRITICAL', 'CVE-2026-65905', 'tomcat-embed-core', TOMCAT, '11.0.24', ['11.0.25'], 'RULE', 'CONFIRMED', 'DIGEST 인증기 설정 없음'),
  judged('CRITICAL', 'CVE-2026-68525', 'tomcat-embed-core', TOMCAT, '11.0.24', ['11.0.25', '10.1.58', '9.0.121'], 'RULE', 'CONFIRMED', 'FORM 인증(LoginConfig) 설정 없음'),
  judged('HIGH', 'CVE-2026-13506', 'bcprov-jdk18on', BC, '1.81', ['1.85'], 'CALLGRAPH', 'PROVISIONAL', 'ASN.1 지연 파싱 메서드에 닿지 않는다. 패키지는 Argon2 경로로 닿는다'),
  judged('HIGH', 'CVE-2026-68497', 'jackson-databind', JACKSON3, '3.1.5', ['3.1.6'], 'RULE', 'CONFIRMED', 'javax.xml.datatype(Duration, XMLGregorianCalendar) 사용 없음'),
  judged('HIGH', 'CVE-2026-89407', 'jackson-core', JACKSON3, '3.1.5', ['3.1.7', '3.2.2'], 'RULE', 'CONFIRMED', 'Jackson에 타입을 알려줄 수 있는 자리(tokens 97개)의 타입에 실수형 필드 없음'),
  judged('HIGH', 'CVE-2026-89425', 'jackson-core', JACKSON3, '3.1.5', ['3.1.7'], 'CALLGRAPH', 'CONFIRMED', 'DataInput 파서 메서드에 닿지 않는다. DataInput 사용 없음'),
  judged('HIGH', 'CVE-2026-91776', 'jackson-databind', JACKSON3, '3.1.5', ['3.1.7'], 'RULE', 'CONFIRMED', '@JsonTypeInfo, default typing, 문제 처리기 사용 없음'),
  judged('HIGH', 'CVE-2026-91777', 'jackson-databind', JACKSON3, '3.1.5', ['3.1.7'], 'RULE', 'CONFIRMED', '@JsonIdentityInfo 사용 없음'),
  judged('MEDIUM', 'CVE-2026-0636', 'bcprov-jdk18on', BC, '1.81', ['1.84'], 'CALLGRAPH', 'CONFIRMED', 'LDAP 저장소 메서드(parseDN, search)에 닿지 않는다'),
  judged('MEDIUM', 'CVE-2026-19032', 'jackson-databind', JACKSON3, '3.1.5', ['3.1.6'], 'RULE', 'CONFIRMED', '역직렬화 타입에 Path 필드 없음'),
  judged('MEDIUM', 'CVE-2026-83557', 'jackson-databind', JACKSON3, '3.1.5', ['3.1.6'], 'RULE', 'CONFIRMED', '@JsonTypeInfo 사용 없음'),
  jackson2Copy('HIGH', 'CVE-2026-68497', 'jackson-databind', ['2.21.6'], NO_TRIGGER),
  jackson2Copy('HIGH', 'CVE-2026-89407', 'jackson-core', ['2.18.11', '2.21.7', '2.22.3'],
    '도달 불가. 운영 기본에서 외부 입력을 Jackson 2로 읽는 경로가 없다. anthropic을 켜도 SDK 매퍼가 문자열→숫자 변환을 막는다'),
  jackson2Copy('HIGH', 'CVE-2026-89425', 'jackson-core', ['2.21.7'], '도달 불가'),
  jackson2Copy('HIGH', 'CVE-2026-91776', 'jackson-databind', ['2.21.7'], NO_TRIGGER),
  jackson2Copy('HIGH', 'CVE-2026-91777', 'jackson-databind', ['2.21.7'], NO_TRIGGER),
  jackson2Copy('MEDIUM', 'CVE-2026-19032', 'jackson-databind', ['2.21.6'], NO_TRIGGER),
  osPackage('CVE-2026-46675', 'libpng', '1.6.58-r1', ['1.6.59-r0']),
  jackson2Copy('MEDIUM', 'CVE-2026-83557', 'jackson-databind', ['2.21.6'], NO_TRIGGER),
  osPackage('CVE-2026-85091', 'zlib', '1.3.2-r0', ['1.3.2-r1']),
]

function purlOf(row: Row): string {
  return row.group === 'alpine' ? `pkg:apk/alpine/${row.name}@${row.version}` : `pkg:maven/${row.group}/${row.name}@${row.version}`
}

function proposalOf(row: Row): ReachProposal | undefined {
  return row.proposal ? { status: 'UNREACHABLE', summary: row.proposal, reference: COPY_REFERENCE } : undefined
}

const items: ReachFindingListItem[] = rows.map((row, index) => ({
  id: index + 1,
  scanId: 1,
  targetId: 1,
  component: { purl: purlOf(row), name: row.name, version: row.version },
  vulnerability: { id: row.cve, severity: row.severity, fixedVersions: row.fixed },
  deployment: 'RUNNING',
  verdict: { status: row.status, method: row.method, summary: row.summary, notAnalyzedReason: row.reason },
  review: { reviewState: row.review, disagreesWithTool: false, proposal: proposalOf(row) },
  firstSeenAt: SEEN_AT,
}))

/** API-14 예시. Re:Used 설치의 설정 (명세 API-14) */
export function sampleReachApps(): ReachAppItem[] {
  return [
    { code: 'API', repo: 'service-backend', path: null, image: 'logssey/reused-api' },
    { code: 'WEB', repo: 'service-frontend', path: null, image: 'logssey/reused-web' },
    { code: 'CHAT', repo: 'service-backend', path: 'chat-server', image: 'logssey/reused-chat' },
  ]
}

export function sampleReachSummary(): ReachSummary {
  return summarizeFindings(items, { targetId: 1, scanId: 1 }, GENERATED_AT)
}

/** API-04를 흉내 낸다: 필터 → 기본 정렬 → 커서(예시에서는 건너뛸 개수) */
export function sampleReachFindings(filter: ReachFindingFilter, cursor: string | null, size: number): ReachFindingPage {
  const cve = filter.cveContains.trim().toLowerCase()
  const matched = items
    .filter((item) => !filter.status.length || filter.status.includes(item.verdict.status))
    .filter((item) => !filter.severity.length || filter.severity.includes(item.vulnerability.severity))
    .filter((item) => !filter.reviewState.length || filter.reviewState.includes(item.review.reviewState))
    .filter((item) => !filter.deployment.length || filter.deployment.includes(item.deployment))
    .filter((item) => !cve || item.vulnerability.id.toLowerCase().includes(cve))
    .sort(compareFindings)
  const start = Number(cursor ?? 0) || 0
  const end = start + size
  return {
    items: matched.slice(start, end),
    nextCursor: end < matched.length ? String(end) : null,
    hasNext: end < matched.length,
    totalCount: matched.length,
  }
}

/** API-05 예시에 근거가 있는 Finding. 나머지는 목록 값으로 근거 한 줄을 만든다 */
const detailExtras: Record<string, Partial<ReachFindingDetail> & { verdictExtra?: Partial<ReachFindingDetail['verdict']> }> = {
  [`${TOMCAT}:CVE-2026-68525`]: {
    vulnerability: { id: 'CVE-2026-68525', severity: 'CRITICAL', affectedFeature: 'FORM 인증 제약 우회', fixedVersions: ['11.0.25', '10.1.58', '9.0.121'] },
    verdictExtra: {
      callgraph: { packageReached: false, vulnFunctionReached: false },
      evidence: [
        { order: 1, kind: 'RULE', ruleId: 'RULE-CVE-2026-68525', matchedCondition: 'UNREACHABLE', summary: 'FORM 인증(LoginConfig) 설정 없음', checkedAbsent: ['FormAuthenticator', 'LoginConfig'] },
        { order: 2, kind: 'NOTE', summary: "호출 그래프상 패키지 도달은 '아니요'다. Spring Boot가 Tomcat을 리플렉션으로 띄워 그래프에 잡히지 않을 뿐 실제로는 쓰인다. 판정은 규칙이 정했다" },
      ],
    },
    upgrade: {
      suggestedVersion: '11.0.25',
      change: "build.gradle: ext['tomcat.version'] = '11.0.25' (Spring Boot 관리 버전 덮어쓰기)",
      note: '업그레이드 실험(실험용 clone, Jackson·Tomcat·bcprov·apk를 함께 올림)에서 이미지 취약점 0, 백엔드 테스트 945개 통과. 적용 여부는 팀이 정한다',
    },
  },
  [`${BC}:CVE-2025-14813`]: {
    vulnerability: {
      id: 'CVE-2025-14813', severity: 'CRITICAL', fixedVersions: ['1.80.2', '1.81.1', '1.84'],
      severityNote: 'Trivy는 CRITICAL로 보고했다. CNA의 CVSS 벡터로는 7.5(HIGH)다',
      affectedFeature: 'GOST R 34.13-2015 CTR 모드(G3413CTRBlockCipher)',
    },
    verdictExtra: {
      callgraph: { packageReached: true, vulnFunctionPresent: true, vulnFunctionReached: false, weakOnly: false },
      evidence: [
        { order: 1, kind: 'PATH', pathTarget: 'PACKAGE', candidate: true, summary: '패키지 도달 후보 경로. 가장 짧은 후보이며 실제 경로와 다를 수 있다', path: ['PasswordEncoderConfig', 'Argon2PasswordEncoder', '…', 'Argon2BytesGenerator'] },
        { order: 2, kind: 'NOTE', summary: '패키지 수준으로는 닿지만(Spring Security의 Argon2), 함수 수준으로는 취약 기능(GOST CTR)에 닿지 않는다' },
      ],
    },
  },
  [`${JACKSON3}:CVE-2026-89407`]: {
    // 화면 명세 SCR-03 배치 예시의 부제
    vulnerability: {
      id: 'CVE-2026-89407', severity: 'HIGH', fixedVersions: ['3.1.7', '3.2.2'],
      affectedFeature: '`NumberInput.looksLikeValidNumber`의 정규식 역추적. 입력 길이의 제곱에 비례해 처리 시간이 늘어난다(DoS)',
      cwe: ['CWE-400', 'CWE-1333'],
    },
    verdictExtra: {
      evidence: [
        { order: 1, kind: 'FACT', factId: 'F-dto.floating.tokens', value: false, checkedCount: 97, summary: 'Jackson에 타입을 알려줄 수 있는 자리(tokens) 97개에서 필드를 따라갔다. 실수형 필드 없음' },
        { order: 2, kind: 'FACT', factId: 'F-dto.floating.any', informational: true, value: true, summary: '앱 전체로 보면 실수형 필드가 있다. 응답 전용 record의 Double averageRating이며 판정에는 쓰지 않는다', locations: [{ symbol: 'SellerBriefResponse.averageRating' }, { symbol: 'SellerProfileResponse.averageRating' }] },
        { order: 3, kind: 'RULE', ruleId: 'RULE-CVE-2026-89407', matchedCondition: 'UNREACHABLE', summary: '도달 불가 조건에 맞음' },
      ],
    },
  },
}

function defaultEvidence(item: ReachFindingListItem): ReachFindingDetail['verdict']['evidence'] {
  const { method, summary } = item.verdict
  if (method === 'RULE') return [{ order: 1, kind: 'RULE', ruleId: `RULE-${item.vulnerability.id}`, matchedCondition: 'UNREACHABLE', summary }]
  return [{ order: 1, kind: 'NOTE', summary }]
}

export function sampleReachFinding(findingId: number): ReachFindingDetail {
  const item = items.find((candidate) => candidate.id === findingId)
  if (!item) throw new ApiError(404, 'NOT_FOUND', '찾을 수 없어요. 주소가 바뀌었거나 지워졌을 수 있어요.')
  const group = item.component.purl.split('/').slice(1, -1).join('/')
  const extra = detailExtras[`${group}:${item.vulnerability.id}`] ?? {}
  const reviewed = item.review.reviewState !== 'UNREVIEWED'
  return {
    id: item.id,
    scanId: item.scanId,
    targetId: item.targetId,
    component: { ...item.component, ecosystem: item.component.purl.startsWith('pkg:apk/') ? 'apk' : 'maven' },
    vulnerability: { ...item.vulnerability, ...extra.vulnerability },
    deployment: item.deployment,
    sources: ['TRIVY'],
    verdict: {
      ...item.verdict,
      ruleId: item.verdict.method === 'RULE' ? `RULE-${item.vulnerability.id}` : undefined,
      evidence: defaultEvidence(item),
      analyzedAt: ANALYZED_AT,
      engine: { reach: 'v0' },
      ...extra.verdictExtra,
    },
    review: {
      ...item.review,
      status: reviewed && item.verdict.status !== 'NOT_ANALYZED' ? item.verdict.status : undefined,
      note: item.review.reviewState === 'CONFIRMED' ? 'PoC 정답지(answer-key.md)와 같은 판정' : undefined,
      reviewer: reviewed ? { id: 1, name: '보안 담당자' } : undefined,
      reviewedAt: reviewed ? REVIEWED_AT : undefined,
      version: reviewed ? 2 : 1,
    },
    upgrade: extra.upgrade,
    sameCveFindings: items
      .filter((other) => other.vulnerability.id === item.vulnerability.id && other.id !== item.id)
      .map((other) => other.id),
    firstSeenAt: item.firstSeenAt,
    lastSeenAt: item.firstSeenAt,
  }
}

// ---- 워크로드·스캔 예시 (API 명세 API-03·API-07 예시, PoC 값) ----

const OBSERVED_AT = '2026-11-07T03:17:05Z'
const API_DIGEST = 'sha256:a6ffffef7fc1f9e876f02884ff708d90cb223d8ece7ddab7b8690441d10529d5'

/** API-07 예시. reused-api는 스캔한 digest가 그대로 돌고 있고, chat·web은 아직 스캔이 없다 */
export function sampleReachWorkloads(): ReachWorkloadList {
  const base = {
    cluster: 'reused-prod',
    namespace: 'reused',
    kind: 'Deployment',
    replicas: { ready: 2 },
    deployment: 'RUNNING' as const,
    observedAt: OBSERVED_AT,
    source: 'MANUAL' as const,
  }
  return {
    observations: [{ cluster: 'reused-prod', namespace: 'reused', observedAt: OBSERVED_AT, source: 'MANUAL', fresh: true }],
    items: [
      {
        ...base,
        id: 1,
        name: 'reused-api',
        container: 'api',
        app: 'API',
        image: { repository: 'logssey/reused-api', digest: API_DIGEST, revision: 'bb4639b7e45c21d5ced03a5f541b1982093e0865' },
        scanMatch: { status: 'MATCH', scanId: 1, matchedBy: 'DIGEST' },
      },
      {
        ...base,
        id: 2,
        name: 'reused-chat',
        container: 'chat',
        app: null,
        image: { repository: 'logssey/reused-chat', digest: 'sha256:4b57e13cfad629d039e76b4d865d0c6ca1a4d00d352ddd90f2216364d1be99ee' },
        scanMatch: { status: 'NO_SCAN' },
      },
      {
        ...base,
        id: 3,
        name: 'reused-web',
        container: 'web',
        app: null,
        image: { repository: 'logssey/reused-web', digest: 'sha256:a89a79ed38c8a594f9f0d2c98a570d37d5cc19ffcd6299191c004128b68f934f' },
        scanMatch: { status: 'NO_SCAN' },
      },
    ],
  }
}

const SAMPLE_SCAN: ReachScan = {
  id: 1,
  scanStatus: 'SUCCEEDED',
  trigger: 'MANUAL',
  target: {
    id: 1,
    type: 'IMAGE',
    app: 'API',
    image: { repository: 'logssey/reused-api', digest: API_DIGEST, revision: 'bb4639b', createdAt: '2026-09-29T07:46:33Z' },
    displayName: 'reused-api @ a6ffffef',
  },
  stages: [
    { name: 'SBOM', status: 'SUCCEEDED' },
    { name: 'MATCH', status: 'SUCCEEDED' },
    { name: 'L1', status: 'SUCCEEDED' },
    { name: 'L2', status: 'SUCCEEDED', durationSeconds: 40 },
    { name: 'REPORT', status: 'SUCCEEDED' },
  ],
  tools: { trivy: '0.75.0', trivyDbUpdatedAt: '2026-10-10T14:44:00Z', reach: 'v0' },
  counts: {
    total: 23,
    bySeverity: { CRITICAL: 5, HIGH: 11, MEDIUM: 7, LOW: 0, UNKNOWN: 0 },
    byStatus: { REACHABLE: 0, UNREACHABLE: 14, UNKNOWN: 0, NOT_ANALYZED: 9 },
    byReviewState: { UNREVIEWED: 9, PROVISIONAL: 1, CONFIRMED: 13 },
  },
  createdAt: '2026-10-11T01:00:00Z',
  startedAt: '2026-10-11T01:00:05Z',
  finishedAt: '2026-10-11T01:01:20Z',
}

/** API-02 예시. 스캔은 PoC 스캔 하나다 */
export function sampleReachScans(filter: ReachScanFilter): ReachScanPage {
  const items = [SAMPLE_SCAN].filter(
    (scan) =>
      (!filter.scanStatus.length || filter.scanStatus.includes(scan.scanStatus)) &&
      (!filter.trigger.length || filter.trigger.includes(scan.trigger)),
  )
  return { items, nextCursor: null, hasNext: false, totalCount: items.length }
}

/** API-03 예시. 없는 id는 백엔드처럼 NOT_FOUND */
export function sampleReachScan(scanId: number): ReachScan {
  if (scanId !== SAMPLE_SCAN.id) throw new ApiError(404, 'NOT_FOUND', '스캔을 찾을 수 없어요.')
  return SAMPLE_SCAN
}
