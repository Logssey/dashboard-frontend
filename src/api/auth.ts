import { ApiError, apiRequest } from './client'
import type { LoginResponse } from './types'

export function login(loginId: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ loginId, password }),
  })
}

export function logout(): Promise<void> {
  return apiRequest<void>('/api/v1/auth/logout', { method: 'POST' })
}

/** 로그인 안 되어 있으면 null */
export async function fetchMe(): Promise<LoginResponse | null> {
  try {
    return await apiRequest<LoginResponse>('/api/v1/auth/me')
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}
