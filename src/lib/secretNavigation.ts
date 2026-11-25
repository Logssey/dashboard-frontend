import type { IconName } from '@/components/Icon'

/** Carry only the selected discovery origin between different read scopes. */
export function secretOriginParams(next: URLSearchParams, context: URLSearchParams | string | null | undefined): URLSearchParams {
  const params = new URLSearchParams(next)
  const origin = typeof context === 'string' ? context : context?.get('origin')
  if ((origin === 'TEST' || origin === 'PRODUCTION') && !params.has('origin')) params.set('origin', origin)
  return params
}

export function withSecretOrigin(path: string, context: URLSearchParams | string | null | undefined): string {
  const [href, hash] = path.split('#', 2)
  const [pathname, search] = href.split('?', 2)
  const params = secretOriginParams(new URLSearchParams(search), context)
  return `${pathname}${params.size ? `?${params}` : ''}${hash === undefined ? '' : `#${hash}`}`
}
export const secretNavigation: Array<{ path: string; icon: IconName; label: string }> = [
  { path: '/secrets', icon: 'key', label: '현황' },
  { path: '/secrets/findings', icon: 'list', label: '키·노출 위치' },
  { path: '/secrets/cases', icon: 'shield', label: '대응 관리' },
  { path: '/secrets/connections', icon: 'plug', label: '연결 관리' },
  { path: '/secrets/history', icon: 'clock', label: '스캔 이력' },
  { path: '/secrets/key-patterns', icon: 'code', label: '키 형식 등록' },
]
export function activeSecretNavigation(path: string, current: string) {
  if (path === '/secrets') return current === path
  if (path === '/secrets/findings') return current === path || current.startsWith('/secrets/triage') || /^\/secrets\/[1-9]\d*(?:\/|$)/.test(current)
  return current === path || current.startsWith(`${path}/`)
}
