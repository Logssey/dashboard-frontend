import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { canonicalSecretListParams } from './secretReadSelection'

export function useSecretListParams(overview = false) {
  const [params, setParams] = useSearchParams()
  const canonical = canonicalSecretListParams(params)
  if (overview) {
    const keys = ['source', 'provider', 'environment', 'connectionId', 'assignee', 'q']
    const filtered = keys.some((key) => canonical.has(key) && !['', 'ALL'].includes(canonical.get(key)!))
    keys.forEach((key) => canonical.delete(key))
    if (filtered) canonical.delete('snapshotId')
  }
  const current = params.toString()
  const normalized = canonical.toString()
  useEffect(() => {
    if (current !== normalized) setParams(new URLSearchParams(normalized), { replace: true })
  }, [current, normalized, setParams])
  return [canonical, setParams] as const
}
