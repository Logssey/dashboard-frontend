import { useQuery } from '@tanstack/react-query'
import { fetchMe } from '@/api/auth'

export const ME_QUERY_KEY = ['me'] as const

/** 지금 로그인한 사용자. 로그인 안 되어 있으면 null (새로고침 시 로그인 확인, 02 기능 설계 2) */
export function useMe() {
  return useQuery({ queryKey: ME_QUERY_KEY, queryFn: fetchMe, staleTime: Infinity, retry: false })
}
