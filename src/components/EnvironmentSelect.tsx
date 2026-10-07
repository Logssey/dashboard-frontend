import type { Environment } from '@/api/types'
import { useEnvironmentStore } from '@/store/environment'

const options: Array<[Environment, string]> = [
  ['ALL', '전체 환경'],
  ['PROD', '운영 환경'],
  ['DEV', '개발 환경'],
]

export function EnvironmentSelect() {
  const environment = useEnvironmentStore((state) => state.environment)
  const setEnvironment = useEnvironmentStore((state) => state.setEnvironment)
  return (
    <select
      className="select"
      aria-label="환경"
      value={environment}
      onChange={(event) => setEnvironment(event.target.value as Environment)}
    >
      {options.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  )
}
