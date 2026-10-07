// 백엔드 호출 공통 처리
// - 로그인 쿠키(세션)는 브라우저가 자동으로 보낸다 (프록시 덕분에 같은 사이트로 취급)
// - GET이 아닌 요청에는 CSRF 토큰(XSRF-TOKEN 쿠키 값)을 X-XSRF-TOKEN 헤더로 붙인다 (API 명세 0.2)
// - 오류는 { code, message } 모양을 ApiError로 바꿔 던진다 (API 명세 0.4)

export class ApiError extends Error {
  readonly status: number
  readonly code: string | null

  constructor(status: number, code: string | null, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

function readCookie(name: string): string | null {
  const prefix = `${name}=`
  const found = document.cookie.split('; ').find((part) => part.startsWith(prefix))
  return found ? decodeURIComponent(found.slice(prefix.length)) : null
}

/** CSRF 쿠키가 아직 없으면 GET 요청을 한 번 보내서 받아 둔다 */
async function ensureCsrfToken(): Promise<string | null> {
  const existing = readCookie('XSRF-TOKEN')
  if (existing) return existing
  await fetch('/api/v1/auth/me', { credentials: 'same-origin' })
  return readCookie('XSRF-TOKEN')
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')
  if (method !== 'GET') {
    const token = await ensureCsrfToken()
    if (token) headers.set('X-XSRF-TOKEN', token)
  }

  const response = await fetch(path, { ...init, method, headers, credentials: 'same-origin' })

  if (response.status === 204) return undefined as T
  if (!response.ok) {
    let code: string | null = null
    let message = '요청을 처리하지 못했어요.'
    try {
      const body = (await response.json()) as { code?: string; message?: string }
      code = body.code ?? null
      message = body.message ?? message
    } catch {
      // 본문이 없는 오류 (예: 404)
    }
    throw new ApiError(response.status, code, message)
  }
  return (await response.json()) as T
}
