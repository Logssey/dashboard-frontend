import { apiRequest } from './client'
import { isGithubLoginAvailable } from '@/lib/githubLogin'

/** 로그인 화면이 보여 줄 로그인 방법. 호출이 실패하면 비밀번호 로그인만 보인다 */
export async function fetchGithubLoginAvailable(): Promise<boolean> {
  try {
    return isGithubLoginAvailable(await apiRequest<unknown>('/api/v1/auth/options'))
  } catch {
    return false
  }
}
