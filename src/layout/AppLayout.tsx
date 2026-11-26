import { iacPages } from '@/iac/IacPage'
import '@/styles/security-workspace.css'
import { useEffect, useLayoutEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { logout } from '@/api/auth'
import { secretNavigation, activeSecretNavigation } from '@/lib/secretNavigation'
import { useSecretWorkbench } from '@/lib/useSecretWorkbench'
import { availableMetric, parseWorkbenchFilters } from '@/lib/secretWorkbench'
import { isSecretSnapshotInvalidated } from '@/lib/secretSnapshotState'
import { sanitizedSecretSearchParams, secretSearchErrorMessage } from '@/lib/secretReadSelection'
import { Icon, type IconName } from '@/components/Icon'
import { HelpChat } from '@/components/HelpChat'
import { clearHelpMessages } from '@/lib/helpChat'
import { LOGIN_PATH, OVERVIEW_PATH, pageTitle } from '@/lib/routes'
import { isVulnerabilityPath, vulnerabilityPages } from '@/lib/reachRoutes'
import { codePages, isCodePath } from '@/code/routes'
import { ME_QUERY_KEY, useMe } from './useMe'

const scrollPositions = new Map<string, number>()

const navigation: Array<{ path: string; icon: IconName; label: string }> = [
  { path: OVERVIEW_PATH, icon: 'grid', label: '통합 현황' },
  { path: '/actions', icon: 'task', label: '조치 관리' },
  { path: '/secrets', icon: 'key', label: '시크릿 보안' },
  { path: '/iac', icon: 'cloud', label: 'IaC 보안' },
  { path: '/vulnerabilities', icon: 'layers', label: '이미지 보안' },
  { path: '/code', icon: 'code', label: '코드 보안' },
  { path: '/runtime', icon: 'activity', label: '런타임 보안' },
  { path: '/configuration', icon: 'compliance', label: '컴플라이언스' },
  { path: '/reports', icon: 'report', label: '리포트' },
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
  const scrollKey = location.pathname + location.search
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => window.scrollTo(0, scrollPositions.get(scrollKey) ?? 0))
    const save = () => scrollPositions.set(scrollKey, window.scrollY)
    window.addEventListener('scroll', save, { passive: true })
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', save) }
  }, [scrollKey])
  const inIac = location.pathname === '/iac' || location.pathname.startsWith('/iac/')
  const inSecrets = location.pathname === '/secrets' || location.pathname.startsWith('/secrets/')
  const inVulnerabilities = isVulnerabilityPath(location.pathname)
  const actionTab = new URLSearchParams(location.search).get('tab') === 'actions'
  const inIacActions = location.pathname === '/iac/actions' || location.pathname.startsWith('/iac/findings/') || actionTab && location.pathname.startsWith('/iac/paths/')
  const inImageActions = location.pathname === '/vulnerabilities/actions' || actionTab && location.pathname.startsWith('/vulnerabilities/findings/')
  const inCode = isCodePath(location.pathname)
  const sectionPages = inSecrets ? secretNavigation.map(({ label, ...page }) => ({ ...page, title: label }))
    : inIac ? iacPages : inVulnerabilities ? vulnerabilityPages : inCode ? codePages : []
  const sectionActivePath = inSecrets ? secretNavigation.find((page) => activeSecretNavigation(page.path, location.pathname))?.path
    : inIacActions ? '/iac/actions' : inImageActions ? '/vulnerabilities/actions'
    : [...sectionPages].reverse().find((page) => location.pathname === page.path || location.pathname.startsWith(page.path + '/'))?.path
  const inSecurity = navigation.slice(2, 8).some(item => location.pathname === item.path || location.pathname.startsWith(item.path + '/'))
  const [securityOpen, setSecurityOpen] = useState(inSecurity)
  useEffect(() => { if (inSecurity) setSecurityOpen(true) }, [inSecurity, location.pathname])
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
      clearHelpMessages()
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
            <strong>{import.meta.env?.MODE === 'actiondemo' ? '로컬 시연' : 'Re:Used'}</strong>
            <small>{import.meta.env?.MODE === 'actiondemo' ? '운영 데이터와 분리' : 'Team workspace'}</small>
          </div>
        </div>
        <p className="nav-label">보안 워크스페이스</p>
        <nav aria-label="보안 메뉴">
          <NavLink className="nav-link" to={OVERVIEW_PATH} end><Icon name="grid" />통합 현황</NavLink>
          <button type="button" className={`nav-link security-menu-toggle${inSecurity ? ' active' : ''}`} aria-expanded={securityOpen} aria-controls="security-menu-group" onClick={() => setSecurityOpen(open => !open)}>
            <Icon name="shield" /><span>보안 점검</span><Icon name="chevron" />
          </button>
          <div id="security-menu-group" className={`nav-expansion${securityOpen ? ' is-open' : ''}`} inert={!securityOpen} aria-hidden={!securityOpen}><div className="nav-expansion-content security-menu-group">
          {navigation.slice(2, 8).map(item => {
            const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/')
            const pages = item.path === '/secrets' ? secretNavigation.map(({label,...page})=>({...page,title:label})) : item.path === '/iac' ? iacPages : item.path === '/vulnerabilities' ? vulnerabilityPages : item.path === '/code' ? codePages : []
            return <div key={item.path}>
              <Link className={`nav-link security-area-link${active ? ' active' : ''}`} to={item.path} aria-current={active ? 'page' : undefined} aria-expanded={pages.length ? active : undefined} aria-controls={pages.length ? `submenu-${item.path.slice(1)}` : undefined}><Icon name={item.icon} /><span>{item.label}</span></Link>
              {!!pages.length && <div id={`submenu-${item.path.slice(1)}`} className={`nav-expansion${active ? ' is-open' : ''}`} inert={!active} aria-hidden={!active}><div className="nav-expansion-content">
                <div className="security-subnav" role="group" aria-label={`${item.label} 세부 메뉴`}>
                  {pages.map(page=><Link key={page.path} className={`nav-link sub${active && page.path === sectionActivePath ? ' active' : ''}`} to={page.path} aria-current={active && page.path === sectionActivePath ? 'page' : undefined}>
                    <Icon name={page.icon} /><span>{page.title}</span>
                    {page.path === '/secrets/findings' && inSecrets && summary.isSuccess && !isSecretSnapshotInvalidated(summarySelection.filters.snapshotId) && availableMetric(reviewMetric) && <span className="secret-nav-count" aria-label={`확인 필요 위치 ${reviewMetric!.value}곳`}>{reviewMetric!.value}</span>}
                  </Link>)}
                </div>
              </div></div>}
            </div>
          })}
          </div></div>
          <NavLink className="nav-link" to="/actions"><Icon name="task" />조치 관리</NavLink>
          <NavLink className="nav-link" to="/reports"><Icon name="report" />리포트</NavLink>
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
            {me && <HelpChat page={title} />}
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
        <main id="main" className={inSecrets || inIac || inVulnerabilities ? 'security-workspace' : undefined} tabIndex={-1}>
          {import.meta.env?.VITE_READ_ONLY_PREVIEW === 'true' && <p className="notice page-notice" role="status">로컬 미리보기 · 운영 조회 결과를 임시 보관해 보여줍니다. 저장, 검사 실행 등 운영 데이터를 바꾸는 작업은 차단됩니다.</p>}
          {import.meta.env?.DEV && import.meta.env?.VITE_LOCAL_ACTION_PREVIEW === 'true' && <p className="notice page-notice" role="status">로컬 조치 기능 검증 · 예시 데이터만 사용합니다. 저장 내용은 로컬 테스트 DB에만 반영됩니다.</p>}
          {inSecrets && safeNavigation.get('searchRejected') === '1' && !['/secrets/findings', '/secrets/cases', '/secrets/triage'].includes(location.pathname)
            && <p className="notice error" role="alert">{secretSearchErrorMessage}</p>}

          <Outlet />
          <footer className="footer">
            <span>© 2026 Logssey · Cloud security, clearly.</span>
          </footer>
        </main>
      </div>
    </>
  )
}
