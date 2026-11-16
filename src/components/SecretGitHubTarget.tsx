import type { GitHubScanTarget } from '@/api/secretConnections'

export function SecretGitHubTarget({ target }: { target: GitHubScanTarget | null | undefined }) {
  if (!target) return null
  return <span className="secret-github-target">
    <span>{target.repository}</span>
    <span className="secret-github-branch">브랜치 {target.branch}</span>
    <small>{target.path ? `폴더 ${target.path}` : '이 브랜치 전체'}</small>
  </span>
}
