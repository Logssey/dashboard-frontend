import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/layout/AppLayout'
import { RequireAuth } from '@/layout/RequireAuth'
import { LOGIN_PATH, OVERVIEW_PATH, sectionPages } from '@/lib/routes'
import { ComingSoonPage } from '@/pages/ComingSoonPage'
import { LoginPage } from '@/pages/LoginPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { SecretsPage } from '@/pages/SecretsPage'
import { SecretOverviewPage } from '@/pages/SecretOverviewPage'
import { SecretConnectionsPage } from '@/pages/SecretConnectionsPage'
import { SecretHistoryPage } from '@/pages/SecretHistoryPage'
import { SecretCasesPage } from '@/pages/SecretCasesPage'

export function App() {
  return (
    <Routes>
      <Route path={LOGIN_PATH} element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path={OVERVIEW_PATH} element={<OverviewPage />} />
          <Route path="/secrets" element={<SecretOverviewPage />} />
          <Route path="/secrets/findings" element={<SecretsPage />} />
          <Route path="/secrets/cases" element={<SecretCasesPage />} />
          <Route path="/secrets/connections" element={<SecretConnectionsPage />} />
          <Route path="/secrets/history" element={<SecretHistoryPage />} />
          {sectionPages
            .filter((page) => !page.path.startsWith('/secrets'))
            .map((page) => (
              <Route key={page.path} path={page.path} element={<ComingSoonPage page={page} />} />
            ))}
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={OVERVIEW_PATH} replace />} />
    </Routes>
  )
}
