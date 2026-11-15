/** GitHub 조직 로그인 (ADR-D010). 백엔드 Spring Security 의 GitHub 로그인 경로 */
export const GITHUB_LOGIN_PATH = '/oauth2/authorization/github'

/** GitHub 로그인이 거부되면 백엔드가 /login?error=github 로 돌려보낸다. 이유는 서버 로그에만 남는다 */
export function githubLoginError(search: string): string | null {
  return new URLSearchParams(search).get('error') === 'github'
    ? 'GitHub로 로그인하지 못했어요. Logssey GitHub 조직원만 로그인할 수 있습니다.'
    : null
}

/** /api/v1/auth/options 응답에서 GitHub 로그인을 보일지. 모양이 다르면 숨긴다 */
export function isGithubLoginAvailable(options: unknown): boolean {
  return typeof options === 'object' && options !== null && (options as { github?: unknown }).github === true
}
