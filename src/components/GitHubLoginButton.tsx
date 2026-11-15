import { useQuery } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { fetchGithubLoginAvailable } from '@/api/authOptions'
import { GITHUB_LOGIN_PATH, githubLoginError } from '@/lib/githubLogin'

/** GitHub 조직 로그인 버튼 (ADR-D010). 서버에 GitHub 로그인이 설정돼 있을 때만 보인다 */
export function GitHubLoginButton() {
  const location = useLocation()
  const { data: available } = useQuery({
    queryKey: ['auth-options', 'github'],
    queryFn: fetchGithubLoginAvailable,
    staleTime: Infinity,
    retry: false,
  })
  const error = githubLoginError(location.search)

  if (!available && !error) return null

  return (
    <div className="login-form">
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {available && (
        <a className="btn outline" href={GITHUB_LOGIN_PATH}>
          GitHub로 로그인
        </a>
      )}
    </div>
  )
}
