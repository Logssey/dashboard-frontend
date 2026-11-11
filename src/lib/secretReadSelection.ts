import type { SecretOrigin } from '@/api/secrets'

export type SecretReadOrigin = SecretOrigin | 'ALL'

// Keep this boundary aligned with SecretDisplayLabels.credentialLike and SecretSafeSearch.
const credentialLike = /AKIA[A-Z0-9]{16}|ASIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_|(?:secret_|ntn_)[A-Za-z0-9]{20,}|[A-Za-z0-9_-]{24,}|[0-9]{10,}/
export const secretSearchErrorMessage = '검색할 수 없는 값이에요. 키·토큰 원문 대신 마스킹된 표시나 발견 위치를 입력하세요.'

export const validSecretSearch = (value: string) => value.trim().length <= 100
  && !/[\u0000-\u001f\u007f-\u009f]/.test(value.trim()) && !credentialLike.test(value.trim())

export function safeSecretSearch(value: string | null | undefined): string {
  if (!validSecretSearch(value ?? '')) throw new Error('SECRET_SEARCH_REJECTED')
  return (value ?? '').trim()
}

function stripRejectedSearch(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params)
  const queries = next.getAll('q')
  if (queries.some((value) => !validSecretSearch(value))) {
    next.delete('q')
    next.delete('snapshotId')
    next.delete('focus')
    next.set('page', '1')
    next.set('searchRejected', '1')
  } else if (queries.length) {
    const q = safeSecretSearch(queries[0])
    if (q) next.set('q', q)
    else next.delete('q')
  }
  return next
}

export function sanitizedSecretSearchParams(params: URLSearchParams): URLSearchParams {
  const next = stripRejectedSearch(params)
  if (next.has('returnQuery')) {
    const safeReturn = stripRejectedSearch(new URLSearchParams(next.get('returnQuery')!))
    if (safeReturn.get('searchRejected') === '1') {
      safeReturn.delete('searchRejected')
      next.set('searchRejected', '1')
    }
    next.set('returnQuery', safeReturn.toString())
  }
  return next
}

export function canonicalSecretListParams(params: URLSearchParams): URLSearchParams {
  const next = sanitizedSecretSearchParams(params)
  const origin = next.get('origin')
  if (origin && origin !== 'ALL' && ['PRODUCTION', 'TEST', 'UNCLASSIFIED'].includes(origin)) {
    next.delete('snapshotId')
    next.delete('focus')
    next.set('page', '1')
  }
  if (!origin || ['PRODUCTION', 'TEST', 'UNCLASSIFIED'].includes(origin)) next.set('origin', 'ALL')
  return next
}

export function canonicalSecretLocationParams(params: URLSearchParams): URLSearchParams {
  const next = canonicalSecretListParams(params)
  const previousOrigin = params.get('origin')
  const originChanged = previousOrigin !== 'ALL' && (!previousOrigin || ['PRODUCTION', 'TEST', 'UNCLASSIFIED'].includes(previousOrigin))
  const keys = ['source', 'environment', 'presence', 'exposure', 'actionStatus']
  const filtered = keys.some((key) => next.has(key) && next.get(key) !== 'ALL')
  keys.forEach((key) => next.delete(key))
  if (filtered || originChanged || next.get('searchRejected') === '1') { next.delete('detailVersion'); next.set('locationPage', '1') }
  if (next.has('returnQuery')) {
    const original = new URLSearchParams(next.get('returnQuery')!)
    const safe = canonicalSecretListParams(original)
    if (safe.get('searchRejected') === '1') {
      safe.delete('searchRejected')
      next.set('searchRejected', '1')
    }
    next.set('returnQuery', safe.toString())
  }
  return next
}

export function changedSecretListParams(params: URLSearchParams, values: Record<string, string>): URLSearchParams {
  const next = canonicalSecretListParams(params)
  for (const [key, value] of Object.entries(values)) {
    if (value) next.set(key, key === 'q' ? safeSecretSearch(value) : value)
    else next.delete(key)
  }
  next.delete('snapshotId')
  next.delete('focus')
  next.delete('searchRejected')
  next.set('page', '1')
  return next
}
