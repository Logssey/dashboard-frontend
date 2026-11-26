import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { build } from 'esbuild'

const bundle = await build({ stdin: { contents: "export * from './src/api/secretValidation'; export { ApiError } from './src/api/client'; export * from './src/lib/secretValidation'; export * from './src/components/SecretValidation'; export * from './src/components/SecretValidationPolicy'; export * from './src/components/SecretConnectionValidationSettings';", resolveDir: resolve('.') }, bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, alias: { '@': resolve('src') } })
const path = resolve('node_modules/.secret-validation-test.mjs'); await writeFile(path, bundle.outputFiles[0].contents)
const api = await import(pathToFileURL(path).href); after(() => unlink(path))
const data = { support: { status: 'SUPPORTED' }, latestAttempt: null, lastAuthenticatedAt: null, lastConclusiveValidation: null, latestRequest: null, freshness: { status: 'UNAVAILABLE' }, nextDueAt: null, postActionValidationPending: false, capabilities: { canRequestValidation: false, blockedReasonCodes: [] }, contextVersion: 'safe-context', readAt: '2026-10-22T00:00:00Z' }
const location = { occurrenceId: 8, safeLocationLabel: '운영 구성 파일', sourceDetails: { status: 'AVAILABLE', repository: 'safe/project', path: 'config.ts', branch: 'main', line: '4', label: '승인 위치' }, capabilities: {} }
function render(Component, props, entries, url = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } })
  for (const [key, value, error] of entries) {
    client.setQueryData(key, value)
    if (error) client.getQueryCache().find({ queryKey: key }).setState({ error, status: 'error', errorUpdateCount: 1, errorUpdatedAt: Date.now() })
  }
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: [url] }, createElement(Component, props)))); client.clear(); return html
}
test('unsupported, disabled, synthetic and incomplete are distinct from an authentication failure', () => {
  const cases = [['UNSUPPORTED_TYPE', '검증 미지원'], ['DISABLED', '검증 꺼짐'], ['SYNTHETIC_FIXTURE', '검증 생략'], ['MISSING_SESSION_TOKEN', '구성 부족']]
  for (const [reason, expected] of cases) {
    const value = { ...data, capabilities: { canRequestValidation: false, blockedReasonCodes: [reason] } }
    const html = render(api.SecretValidationCard, { secretId: 12, locations: [location] }, [[['secret-validation', 12, 8], value]])
    assert.match(html, new RegExp(expected)); assert.match(html, /실제 확인 시각<\/dt><dd>—/); assert.doesNotMatch(html, /검증 시도 기록 없음|무효|원문 보기/)
  }
})
test('latest unknown and previous authentication time do not become a current valid result', () => {
  const value = { ...data, latestAttempt: { attemptId: 2, result: 'UNKNOWN', reasonCode: 'PROVIDER_UNAVAILABLE', providerCheckedAt: null, completedAt: '2026-10-22T02:00:00Z' }, lastAuthenticatedAt: '2026-10-21T01:00:00Z', lastConclusiveValidation: { attemptId: 1, result: 'VALID', providerCheckedAt: '2026-10-21T01:00:00Z' } }
  const html = render(api.SecretValidationCard, { secretId: 12, locations: [location] }, [[['secret-validation', 12, 8], value]])
  assert.match(html, /<h3>확인 불가<\/h3>/); assert.match(html, /실제 확인 시각<\/dt><dd>—/); assert.match(html, /최근 시도 시각/); assert.match(html, /마지막 인증 성공/); assert.match(html, /이전 확정 결과/)
})
test('pending requests and stale validation are not fresh authentication successes', () => {
  assert.equal(api.completedRequest('PENDING'), false); assert.equal(api.completedRequest('UNRECOGNIZED'), false); assert.equal(api.completedRequest('SUCCEEDED'), true); assert.equal(api.completedRequest('FAILED'), true)
  assert.equal(api.validationPresentation({ ...data, latestRequest: { requestId: 4, status: 'PENDING' } }).title, '확인 대기')
  assert.equal(api.validationPresentation({ ...data, freshness: { status: 'STALE' } }).title, '다시 확인 필요')
  assert.equal(api.validationPresentation({ ...data, postActionValidationPending: true }).title, '조치 후 미검증')
  const html = render(api.SecretValidationPolicy, { scopeId: 5 }, [[['secret-validation-policy', 5], { enabled: true, expectedValidationApprovalRevision: 2, profileStatus: 'DISABLED', canConfigure: false }]])
  assert.match(html, /서버 검증 기능이 꺼져 있어요/); assert.doesNotMatch(html, /<button[^>]*>이 범위 검증/)
})
test('synthetic guard takes precedence over a global disabled profile and missing setup has a concrete path', () => {
  assert.equal(api.validationPresentation({ ...data, capabilities: { canRequestValidation: false, blockedReasonCodes: ['DISABLED', 'SYNTHETIC_FIXTURE'] } }).title, '합성 키 검증 생략')
  const html = render(api.SecretValidationCard, { secretId: 12, locations: [{ ...location, connectionId: 3, scopeId: 5 }] }, [[['secret-validation', 12, 8], { ...data, capabilities: { canRequestValidation: false, blockedReasonCodes: ['DISABLED', 'PROFILE_UNCONFIGURED'] }, validationPolicy: { canConfigure: true } }]])
  assert.match(html, /연결의 키 검증 설정을 저장/); assert.match(html, /href="\/secrets\/connections\?validationConnectionId=3"/); assert.match(html, /인증 결과 재확인 기한 미정/); assert.doesNotMatch(html, /담당자에게 사유 코드를 알려/)
})

test('historical source protection remains an unchecked observation after the current target is allowed', () => {
  const value = { ...data, latestAttempt: { attemptId: 4, result: 'UNCHECKED', reasonCode: 'SOURCE_GUARD_BLOCKED', providerCheckedAt: null }, capabilities: { canRequestValidation: true, blockedReasonCodes: [] } }
  const html = render(api.SecretValidationCard, { secretId: 12, locations: [location] }, [[['secret-validation', 12, 8], value]])
  assert.match(html, /<h3>이전 검증 생략<\/h3>/)
  assert.match(html, /당시 적용된 원천 보호 설정으로 인증 확인을 생략/)
  assert.match(html, /합성 여부는 별도 근거로 확인/)
  assert.match(html, /실제 확인 시각<\/dt><dd>—/)
  assert.doesNotMatch(html, /합성 시험 키로 확인되어|<h3>유효<\/h3>|<h3>사용 불가<\/h3>|담당자에게 사유 코드를 알려/)
  const history = render(api.SecretValidationHistory, { secretId: 12 }, [[['secret-validation-history', 12, null, 0], { items: [{ attemptId: 4, result: 'UNCHECKED', reasonCode: 'SOURCE_GUARD_BLOCKED', providerCheckedAt: null }], total: 1, page: 0, size: 20 }]])
  assert.match(history, /당시 적용된 원천 보호 설정/)
  assert.doesNotMatch(history, /합성 시험 키로 확인되어/)
})

test('current connection and issuer policy has precedence over a historical source exclusion', () => {
  const value = { ...data, latestAttempt: { attemptId: 4, result: 'UNCHECKED', reasonCode: 'SOURCE_GUARD_BLOCKED' }, capabilities: { canRequestValidation: false, blockedReasonCodes: ['VALIDATOR_NOT_ALLOWED'] }, validationPolicy: { connectionId: 3, canConfigure: true, connectionEnabled: true } }
  const html = render(api.SecretValidationCard, { secretId: 12, locations: [{ ...location, connectionId: 3, scopeId: 5 }] }, [[['secret-validation', 12, 8], value]])
  assert.match(html, /<h3>키 발급 서비스 허용 필요<\/h3>/)
  assert.match(html, /href="\/secrets\/connections\?validationConnectionId=3"/)
  assert.match(html, /이 연결에서 해당 키 발급 서비스의 검증을 허용/)
  assert.doesNotMatch(html, /<h3>이전 검증 생략|<h3>유효/)
})

test('another active scan does not replace the explanation of the current authentication observation', () => {
  const value = { ...data, latestAttempt: { attemptId: 7, result: 'INVALID', reasonCode: 'AUTHENTICATION_REJECTED', providerCheckedAt: '2026-11-12T00:00:00Z' }, capabilities: { canRequestValidation: false, blockedReasonCodes: ['ACTIVE_JOB_EXISTS'] } }
  const html = render(api.SecretValidationCard, { secretId: 12, locations: [location] }, [[['secret-validation', 12, 8], value]])
  assert.match(html, /<h3>사용 불가<\/h3>/)
  assert.match(html, /인증이 거절됨/)
  assert.match(html, /다른 확인 작업이 진행 중/)
})
test('abandoned attempts in history have no invented unchecked result or provider timestamp', () => {
  const html = render(api.SecretValidationHistory, { secretId: 12 }, [[['secret-validation-history', 12, null, 0], { items: [{ attemptId: 3, state: 'ABANDONED', result: null, reasonCode: 'LEASE_EXPIRED', purpose: 'CREDENTIAL_VALIDITY', completedAt: '2026-10-22T00:00:00Z', providerCheckedAt: null }], total: 1, page: 0, size: 20 }]])
  assert.match(html, /시도 중단 · 결론 없음/); assert.match(html, /실행 권한이 만료/); assert.doesNotMatch(html, /<td>미검증<\/td>/)
})
test('validation API uses selected location, opaque context, CSRF and independent policy revision', async () => {
  const originalFetch = globalThis.fetch, originalDocument = globalThis.document, calls = []
  globalThis.document = { cookie: 'XSRF-TOKEN=csrf-test' }; globalThis.fetch = async (url, init) => { calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null }); return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }) }
  try {
    await api.requestSecretValidation(12, { occurrenceId: 8, expectedContextVersion: 'opaque', idempotencyKey: 'same-command' })
    await api.fetchValidationRequest(4); await api.fetchValidationHistory(12, 8, 2)
    await api.updateValidationPolicy(5, { expectedValidationApprovalRevision: 2, enabled: false, reasonCode: 'VALIDATION_DISABLED', idempotencyKey: 'policy-command' })
    assert.equal(calls[0].url, '/api/v1/secrets/12/validation-requests'); assert.equal(calls[0].init.headers.get('X-XSRF-TOKEN'), 'csrf-test'); assert.deepEqual(calls[0].body, { occurrenceId: 8, expectedContextVersion: 'opaque', idempotencyKey: 'same-command' })
    assert.equal(calls[1].url, '/api/v1/secrets/validation-requests/4'); assert.match(calls[2].url, /occurrenceId=8/); assert.match(calls[2].url, /page=2/); assert.equal(calls[3].body.expectedValidationApprovalRevision, 2)
    for (const call of calls) assert.doesNotMatch(JSON.stringify(call.body), /rawSecret|endpoint|authRef/)
  } finally { globalThis.fetch = originalFetch; globalThis.document = originalDocument }
})

test('canonical occurrence drives validation and history even when a legacy validation selection differs', () => {
  const value = { ...data, latestAttempt: { result: 'VALID', reasonCode: 'AUTHENTICATED', providerCheckedAt: '2026-10-22T00:00:00Z' } }
  const html = render(api.SecretValidationCard, { secretId: 12, locations: [location, { ...location, occurrenceId: 9 }] }, [[['secret-validation', 12, 8], value]], '/?occurrence=8&validationOccurrence=9')
  assert.match(html, /<h3>유효<\/h3>/)
  const history = render(api.SecretValidationHistory, { secretId: 12 }, [[['secret-validation-history', 12, 8, 0], { items: [{ attemptId: 1, result: 'VALID', reasonCode: 'AUTHENTICATED', providerCheckedAt: '2026-10-22T00:00:00Z' }], total: 1, page: 0, size: 20 }]], '/?occurrence=8&validationOccurrence=9')
  assert.match(history, /<td>유효/)
})

test('an invalid explicit validation location cannot borrow another location result or request controls', () => {
  const value = { ...data, latestAttempt: { result: 'VALID', reasonCode: 'AUTHENTICATED', providerCheckedAt: '2026-10-22T00:00:00Z' }, capabilities: { canRequestValidation: true, blockedReasonCodes: [] } }
  const html = render(api.SecretValidationCard, { secretId: 12, locations: [location] }, [[['secret-validation', 12, 8], value]], '/?occurrence=0&validationOccurrence=8')
  assert.match(html, /선택한 위치가 현재 필터·페이지에 없어요/)
  assert.doesNotMatch(html, /<h3>유효<\/h3>|>키 인증 확인<|>확인 요청</)
})

test('provider failure reasons identify access, response and network failures in the actual card', () => {
  const cases = [['ACCESS_LIMITED', /공급자 접근 제한/], ['UNEXPECTED_RESPONSE', /응답 형식이 예상과 달라/], ['CLIENT_FAILURE', /공급자와 통신하지 못했어요/]]
  for (const [reasonCode, expected] of cases) {
    const value = { ...data, latestAttempt: { attemptId: 4, result: 'UNKNOWN', reasonCode, providerCheckedAt: null, completedAt: '2026-11-05T00:00:00Z' }, latestRequest: { requestId: 4, jobId: 4, status: 'FAILED', reasonCode: 'VALIDATOR_TEMPORARY', attemptNo: 3, maxAttempts: 3 } }
    const html = render(api.SecretValidationCard, { secretId: 12, locations: [location] }, [[['secret-validation', 12, 8], value]])
    assert.match(html, /<h3>확인 불가<\/h3>/)
    assert.match(html, expected)
    assert.match(html, /일시적인 인증 확인 오류/)
    assert.doesNotMatch(html, /요청 구성 문제|담당자에게 사유 코드를 알려/)
  }
})

test('retry progress distinguishes scheduled work from a terminal failure and evidence freshness', () => {
  const request = { requestId: 4, jobId: 4, status: 'PENDING', attemptNo: 1, maxAttempts: 3, nextRetryAt: '2026-11-05T01:00:00Z', availableAt: '2026-11-05T01:00:00Z' }
  const pending = render(api.SecretValidationCard, { secretId: 12, locations: [location] }, [[['secret-validation', 12, 8], { ...data, latestRequest: request }]])
  assert.match(pending, /<h3>재시도 대기<\/h3>/)
  assert.match(pending, /시도 1 \/ 3회/)
  assert.match(pending, /다음 시도/)
  const failed = render(api.SecretValidationCard, { secretId: 12, locations: [location] }, [[['secret-validation', 12, 8], { ...data, nextDueAt: '2038-01-01T00:00:00Z', latestRequest: { ...request, status: 'FAILED', attemptNo: 3 } }]])
  assert.match(failed, /시도 3 \/ 3회/)
  assert.match(failed, /자동 재시도가 종료/)
  assert.match(failed, /인증 결과 재확인 기한 미정/)
  assert.doesNotMatch(failed, /다음 시도|실행 가능 시각|2038/)
})

test('automatic read recovery is bounded and stops on authentication or access errors', () => {
  for (const status of [401, 403, 404, 409, 422]) {
    assert.equal(api.canRecoverValidationRead(new api.ApiError(status, null, 'safe'), 1), false)
  }
  for (const error of [new api.ApiError(500, null, 'safe'), new api.ApiError(429, null, 'safe'), new TypeError('network failed')]) {
    assert.equal(api.canRecoverValidationRead(error, 1), true)
    assert.equal(api.canRecoverValidationRead(error, 5), true)
    assert.equal(api.canRecoverValidationRead(error, 6), false)
  }
})

test('a terminal read wins over stale progress for the same request without hiding a newer request', () => {
  const pending = { requestId: 4, jobId: 4, status: 'PENDING' }
  const succeeded = { ...pending, status: 'SUCCEEDED' }
  assert.equal(api.currentValidationRequest(pending, succeeded), succeeded)
  assert.equal(api.currentValidationRequest(succeeded, pending), succeeded)
  const newer = { requestId: 5, jobId: 5, status: 'PENDING' }
  assert.equal(api.currentValidationRequest(succeeded, newer), newer)
  assert.equal(api.currentValidationRequest(newer, succeeded), newer)
})

test('a failed read marks cached authentication as historical in both collapsed and expanded views', () => {
  const value = { ...data, latestAttempt: { attemptId: 2, result: 'VALID', reasonCode: 'AUTHENTICATED', providerCheckedAt: '2026-11-05T00:00:00Z', completedAt: '2026-11-05T00:00:00Z' }, freshness: { status: 'CURRENT' } }
  const html = render(api.SecretValidationCard, { secretId: 12, locations: [location] }, [[['secret-validation', 12, 8], value, new api.ApiError(500, null, 'safe')]])
  const summary = html.match(/<summary>(.*?)<\/summary>/s)[1]
  assert.match(summary, /연결 확인 필요/)
  assert.match(summary, /이전 관측/)
  assert.doesNotMatch(summary, /<span>유효<\/span>/)
  assert.match(html, /이전 관측 유효/)
  assert.match(html, /현재 상태를 다시 조회해야 해요/)
  assert.match(html, /잠시 후 자동으로 다시 조회/)
})

const connectionPolicy = { connectionId: 3, provider: 'GITHUB', enabled: true, allowedIssuers: ['GITHUB'], enabledIssuers: ['GITHUB', 'AWS'], expectedValidationRevision: 2, profileStatus: 'ENABLED', profileVersion: 'credential-validation-v1', canConfigure: true, blockedReasonCodes: [], approvedScopeCount: 1, scopeCount: 2 }
const renderConnectionPolicy = (policy) => render(api.SecretConnectionValidationSettings, { connectionId: 3 }, [[['secret-connection-validation-policy', 3], policy]])

test('a configured connection exposes its actual selected issuer and a distinct scope approval path', () => {
  const html = renderConnectionPolicy(connectionPolicy)
  assert.equal((html.match(/checked=""/g) ?? []).length, 2)
  assert.match(html, /검증할 키 발급 서비스/)
  assert.match(html, /저장소가 GitHub여도 안에서 AWS 키가 발견/)
  assert.match(html, /2개 검사 대상 중 1개/)
  assert.match(html, /href="\/secrets\/connections\/3\/scopes"/)
  assert.doesNotMatch(html, /type="password"|name="token"|인증 성공/)
})

test('first connection setup starts with explicit empty issuer selection despite compatibility defaults', () => {
  const html = renderConnectionPolicy({ ...connectionPolicy, enabled: false, profileStatus: 'UNCONFIGURED', profileVersion: null, allowedIssuers: ['GITHUB', 'AWS', 'NOTION'] })
  assert.equal((html.match(/checked=""/g) ?? []).length, 0)
  assert.match(html, /연결 검증 꺼짐/)
})

test('connection settings show server-disabled issuers and preserve read-only role boundaries', () => {
  const html = renderConnectionPolicy({ ...connectionPolicy, enabledIssuers: [], profileStatus: 'DISABLED', canConfigure: false })
  assert.match(html, /GitHub PAT의 서버 검증 기능이 꺼져/)
  assert.match(html, /<fieldset disabled=""/)
  assert.match(html, /이 연결의 보안 담당자가/)
  assert.doesNotMatch(html, />검증 설정 저장</)
})

test('a different connection response cannot expose editable policy for the selected connection', () => {
  const html = renderConnectionPolicy({ ...connectionPolicy, connectionId: 99 })
  assert.match(html, /선택한 연결과 검증 설정이 달라요/)
  assert.doesNotMatch(html, /<form|검증 설정 저장/)
})

test('scope approval displays allowed issuers and returns directly to its connection policy', () => {
  const html = render(api.SecretValidationPolicy, { scopeId: 5 }, [[['secret-validation-policy', 5], { enabled: false, connectionId: 3, connectionEnabled: false, allowedIssuers: ['GITHUB'], expectedValidationApprovalRevision: 2, profileStatus: 'UNCONFIGURED', canConfigure: true }]])
  assert.match(html, /허용한 키 발급 서비스 GitHub PAT/)
  assert.match(html, /연결의 키 검증 설정을 먼저 확인/)
  assert.match(html, /href="\/secrets\/connections\?validationConnectionId=3"/)
})

test('connection policy API uses one versioned command and explicit issuer allow-list', async () => {
  const originalFetch = globalThis.fetch, originalDocument = globalThis.document, calls = []
  globalThis.document = { cookie: 'XSRF-TOKEN=csrf-test' }
  globalThis.fetch = async (url, init) => { calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null }); return new Response(JSON.stringify(connectionPolicy), { status: 200, headers: { 'Content-Type': 'application/json' } }) }
  try {
    await api.fetchConnectionValidationPolicy(3)
    await api.updateConnectionValidationPolicy(3, { expectedValidationRevision: 2, enabled: true, allowedIssuers: ['GITHUB'], reasonCode: 'VALIDATION_APPROVED', idempotencyKey: 'explicit-connection-policy' })
    assert.equal(calls[0].url, '/api/v1/secrets/connections/3/validation-policy')
    assert.equal(calls[1].init.method, 'PATCH')
    assert.equal(calls[1].init.headers.get('X-XSRF-TOKEN'), 'csrf-test')
    assert.deepEqual(calls[1].body, { expectedValidationRevision: 2, enabled: true, allowedIssuers: ['GITHUB'], reasonCode: 'VALIDATION_APPROVED', idempotencyKey: 'explicit-connection-policy' })
    assert.doesNotMatch(JSON.stringify(calls), /rawSecret|authRef|sourcePath|profileVersion/)
  } finally { globalThis.fetch = originalFetch; globalThis.document = originalDocument }
})

test('a saved connection policy gives a next action matching its actual execution conditions', () => {
  assert.match(api.connectionValidationNextAction(connectionPolicy), /키 상세에서 확인 조건/)
  assert.match(api.connectionValidationNextAction({ ...connectionPolicy, enabled: false }), /외부 인증 확인이 꺼져/)
  assert.match(api.connectionValidationNextAction({ ...connectionPolicy, approvedScopeCount: 0 }), /검사 대상에서 인증 확인을 허용한 뒤/)
  assert.match(api.connectionValidationNextAction({ ...connectionPolicy, profileStatus: 'UNCONFIGURED' }), /연결의 검증 설정을 다시 확인/)
  assert.match(api.connectionValidationNextAction({ ...connectionPolicy, profileStatus: 'DISABLED', enabledIssuers: [] }), /서버 검증 기능을 켜야/)
  assert.match(api.connectionValidationNextAction({ ...connectionPolicy, enabledIssuers: ['AWS'] }), /서버 검증 기능을 켜야/)
})
