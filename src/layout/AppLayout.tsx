import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { logout } from '@/api/auth'
import { secretNavigation, activeSecretNavigation } from '@/lib/secretNavigation'
import { useSecretWorkbench } from '@/lib/useSecretWorkbench'
import { availableMetric, parseWorkbenchFilters } from '@/lib/secretWorkbench'
import { isSecretSnapshotInvalidated } from '@/lib/secretSnapshotState'
import { sanitizedSecretSearchParams, secretSearchErrorMessage } from '@/lib/secretReadSelection'
import { Icon, type IconName } from '@/components/Icon'
import { infrastructurePaths, LOGIN_PATH, OVERVIEW_PATH, pageTitle, sectionPages } from '@/lib/routes'
import { ME_QUERY_KEY, useMe } from './useMe'

const navigation: Array<{ path: string; icon: IconName; label: string }> = [
  { path: OVERVIEW_PATH, icon: 'grid', label: '통합 현황' },
  { path: '/secrets', icon: 'key', label: '시크릿' },
  { path: '/configuration', icon: 'cloud', label: '인프라 보안' },
  { path: '/vulnerabilities', icon: 'shield', label: '취약점 관리' },
]



function initials(name: string): string {
  const words = name.trim().split(/\s+/)
  const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)
  return letters.toUpperCase()
}

/** 사이드바 + 상단 바 + 본문 (템플릿 레이아웃). 템플릿 전용 메뉴와 표시용 문구는 뺐다 (ADR-D007) */
export function AppLayout() {
  const { data: me } = useMe()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const title = pageTitle(location.pathname)
  const inInfrastructure = infrastructurePaths.includes(location.pathname)
  const inSecrets = location.pathname === '/secrets' || location.pathname.startsWith('/secrets/')
  const safeNavigation = sanitizedSecretSearchParams(new URLSearchParams(location.search))

  const summarySelection = parseWorkbenchFilters(new URLSearchParams())
  const summary = useSecretWorkbench(summarySelection.filters, inSecrets && !!me && summarySelection.valid)
  const reviewMetric = summary.data?.metrics.find((metric) => metric.key === 'reviewRequiredLocations')

  useEffect(() => {
    document.title = `${title} · Logssey`
    setMenuOpen(false)
  }, [title])

  // 로그아웃: 로그아웃 API 호출 후 로그인 화면으로 (02 기능 설계 2)
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.setQueryData(ME_QUERY_KEY, null)
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_QUERY_KEY[0] })
      navigate(LOGIN_PATH, { replace: true })
    },
  })

  if (inSecrets && safeNavigation.toString() !== location.search.replace(/^\?/, '')) {
    return <Navigate replace to={{ pathname: location.pathname, search: safeNavigation.toString(), hash: location.hash }} />
  }

  return (
    <>
      <button
        className={`scrim ${menuOpen ? 'visible' : ''}`.trim()}
        onClick={() => setMenuOpen(false)}
        tabIndex={-1}
        aria-label="메뉴 닫기"
      />
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`.trim()} id="sidebar" aria-label="사이드바">
        <div className="row between">
          <NavLink className="brand" to={OVERVIEW_PATH}>
            <Icon name="shield" />
            <span>
              <strong>logssey</strong>
              <small>CLOUD SECURITY</small>
            </span>
          </NavLink>
          <button className="icon-btn mobile-only" onClick={() => setMenuOpen(false)} aria-label="메뉴 닫기">
            <Icon name="close" />
          </button>
        </div>
        <div className="workspace">
          <span className="avatar">R</span>
          <div>
            <strong>Re:Used</strong>
            <small>Team workspace</small>
          </div>
        </div>
        <p className="nav-label">보안 워크스페이스</p>
        <nav aria-label="보안 메뉴">
          {navigation.map((item) => {
            const isInfrastructure = item.path === '/configuration'
            const isSecrets = item.path === '/secrets'
            const active = isInfrastructure ? inInfrastructure : isSecrets ? inSecrets : location.pathname === item.path
            return (
              <div key={item.path}>
                <NavLink className={`nav-link ${active ? 'active' : ''}`.trim()} to={item.path} end>
                  <Icon name={item.icon} />
                  {item.label}
                </NavLink>
                {isSecrets && inSecrets && (
                  <div className="secret-subnav" role="group" aria-label="시크릿 세부 메뉴">
                    {secretNavigation.map((page) => (
                      <Link
                        key={page.path}
                        className={`nav-link secret-sub ${activeSecretNavigation(page.path, location.pathname) ? 'active' : ''}`.trim()}
                        to={page.path}
                        aria-current={activeSecretNavigation(page.path, location.pathname) ? 'page' : undefined}
                      >
                        <Icon name={page.icon} />
                        <span>{page.label}</span>
                        {page.path === '/secrets/findings' && summary.isSuccess && !isSecretSnapshotInvalidated(summarySelection.filters.snapshotId) && availableMetric(reviewMetric) && (
                          <span className="secret-nav-count" title="검토·대응 생성이 필요한 발견 위치" aria-label={`확인 필요 위치 ${reviewMetric!.value}곳`}>{reviewMetric!.value}</span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
                {isInfrastructure &&
                  active &&
                  sectionPages
                    .filter((page) => infrastructurePaths.includes(page.path))
                    .map((page) => (
                      <NavLink
                        key={page.path}
                        className={`nav-link sub ${location.pathname === page.path ? 'active' : ''}`.trim()}
                        to={page.path}
                      >
                        {page.title}
                      </NavLink>
                    ))}
              </div>
            )
          })}
        </nav>
      </aside>

      <div className="shell" inert={menuOpen}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-only"
              onClick={() => setMenuOpen(true)}
              aria-label="메뉴 열기"
              aria-controls="sidebar"
              aria-expanded={menuOpen}
            >
              <Icon name="menu" />
            </button>
            <span className="desktop-only">워크스페이스</span>
            <span className="desktop-only">
              <Icon name="chevron" />
            </span>
            <span>{title}</span>
          </div>
          <div className="row topbar-user">
            {me && (
              <>
                <span className="avatar desktop-only">{initials(me.displayName)}</span>
                <span className="name desktop-only">{me.displayName}</span>
              </>
            )}
            <button
              className="btn outline small"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              로그아웃
            </button>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {inSecrets && safeNavigation.get('searchRejected') === '1' && !['/secrets/findings', '/secrets/cases', '/secrets/triage'].includes(location.pathname)
            && <p className="notice error" role="alert">{secretSearchErrorMessage}</p>}
          <Outlet />
          <footer className="footer">
            <span>© 2026 Logssey · Cloud security, clearly.</span>
            {!inSecrets && <span>샘플 데이터로 동작 중입니다.</span>}
          </footer>
        </main>
      </div>
    </>
  )
}
