import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/layout/AppLayout'
import { RequireAuth } from '@/layout/RequireAuth'
import { LOGIN_PATH, OVERVIEW_PATH, sectionPages } from '@/lib/routes'
import { ComingSoonPage } from '@/pages/ComingSoonPage'
import { LoginPage } from '@/pages/LoginPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { SecretsPage } from '@/pages/SecretsPage'

export function App() {
  return (
    <Routes>
      <Route path={LOGIN_PATH} element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path={OVERVIEW_PATH} element={<OverviewPage />} />
          <Route path="/secrets" element={<SecretsPage />} />
          {sectionPages
            .filter((page) => page.path !== '/secrets')
            .map((page) => (
              <Route key={page.path} path={page.path} element={<ComingSoonPage page={page} />} />
            ))}
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={OVERVIEW_PATH} replace />} />
    </Routes>
  )
}
