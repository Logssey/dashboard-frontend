import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { login } from '@/api/auth'
import { ApiError } from '@/api/client'
import { GitHubLoginButton } from '@/components/GitHubLoginButton'
import { Icon } from '@/components/Icon'
import { OVERVIEW_PATH } from '@/lib/routes'
import { ME_QUERY_KEY, useMe } from '@/layout/useMe'

/** 로그인 (02 기능 설계 1). 회원가입 없음. 소셜 로그인은 GitHub 조직 로그인만(ADR-D010) */
export function LoginPage() {
  const { data: me, isPending } = useMe()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')

  const from = (location.state as { from?: string } | null)?.from ?? OVERVIEW_PATH

  const loginMutation = useMutation({
    mutationFn: () => login(loginId.trim(), password),
    onSuccess: (user) => {
      queryClient.setQueryData(ME_QUERY_KEY, user)
      navigate(from, { replace: true })
    },
  })

  if (isPending) return null
  if (me) return <Navigate to={OVERVIEW_PATH} replace />

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!loginId.trim() || !password) return
    loginMutation.mutate()
  }

  const error = loginMutation.error
  const errorMessage =
    error instanceof ApiError && error.status === 401
      ? error.message
      : error
        ? '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.'
        : null

  return (
    <div className="login-page">
      <section className="card login-card">
        <div className="brand">
          <Icon name="shield" />
          <span>
            <strong>logssey</strong>
            <small>CLOUD SECURITY</small>
          </span>
        </div>
        <div>
          <h1>로그인</h1>
          <p className="subtitle">보안 대시보드 관리자 계정으로 로그인하세요.</p>
        </div>
        <form className="login-form" onSubmit={onSubmit} noValidate>
          <label className="field">
            아이디
            <input
              className="input"
              autoComplete="username"
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              required
            />
          </label>
          <label className="field">
            비밀번호
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {errorMessage && (
            <p className="notice error" role="alert">
              {errorMessage}
            </p>
          )}
          <button
            className="btn primary"
            type="submit"
            disabled={loginMutation.isPending || !loginId.trim() || !password}
          >
            {loginMutation.isPending ? '로그인 중…' : '로그인'}
          </button>
        </form>
        <GitHubLoginButton />
      </section>
    </div>
  )
}
