import { canonicalSecretLocationParams } from './secretReadSelection'

export function keyContextPath(path: string, secretId: number, context: URLSearchParams): string {
  const [pathname, search] = path.split('?', 2)
  const next = new URLSearchParams(search)
  next.set('return', 'key')
  next.set('returnSecretId', String(secretId))
  next.set('returnQuery', canonicalSecretLocationParams(context).toString())
  return `${pathname}?${next}`
}

export function keyContextReturn(params: URLSearchParams): string | null {
  const id = params.get('returnSecretId') ?? ''
  const query = params.get('returnQuery') ?? ''
  if (params.get('return') !== 'key' || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || query.length > 12000) return null
  return `/secrets/${id}?${canonicalSecretLocationParams(new URLSearchParams(query))}`
}

export function contextualExplanationPath(href: string, pathname: string, search: string): string {
  const target = new URL(href, 'https://logssey.invalid')
  if (target.pathname !== pathname) return href
  const context = new URLSearchParams(search)
  for (const key of ['occurrence', 'return', 'returnSecretId', 'returnQuery', 'origin']) {
    if (context.has(key) && !target.searchParams.has(key)) target.searchParams.set(key, context.get(key)!)
  }
  return `${target.pathname}${target.search}${target.hash}`
}
