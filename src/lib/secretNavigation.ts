import type { IconName } from '@/components/Icon'
export const secretNavigation: Array<{ path: string; icon: IconName; label: string }> = [
  { path: '/secrets', icon: 'key', label: '현황' },
  { path: '/secrets/findings', icon: 'list', label: '키·노출 위치' },
  { path: '/secrets/cases', icon: 'shield', label: '대응 관리' },
  { path: '/secrets/connections', icon: 'plug', label: '연결 관리' },
  { path: '/secrets/history', icon: 'clock', label: '스캔 이력' },
]
export function activeSecretNavigation(path: string, current: string) {
  if (path === '/secrets') return current === path
  if (path === '/secrets/findings') return current === path || current.startsWith('/secrets/triage') || /^\/secrets\/[1-9]\d*(?:\/|$)/.test(current)
  return current === path || current.startsWith(`${path}/`)
}
