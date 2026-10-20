import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/layout/AppLayout'
import { RequireAuth } from '@/layout/RequireAuth'
import { LOGIN_PATH, OVERVIEW_PATH, sectionPages } from '@/lib/routes'
import { ComingSoonPage } from '@/pages/ComingSoonPage'
import { LoginPage } from '@/pages/LoginPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { SecretsPage } from '@/pages/SecretsPage'
import { SecretKeyDetailPage } from '@/pages/SecretKeyDetailPage'
import { SecretOverviewPage } from '@/pages/SecretOverviewPage'
import { SecretConnectionsPage } from '@/pages/SecretConnectionsPage'
import { SecretConnectionScopesPage } from '@/pages/SecretConnectionScopesPage'
import { SecretHistoryPage } from '@/pages/SecretHistoryPage'
import { SecretRunDetailPage } from '@/pages/SecretRunDetailPage'
import { SecretCasesPage } from '@/pages/SecretCasesPage'
import { SecretTriagePage } from '@/pages/SecretTriagePage'
import { SecretTriageCandidatesPage } from '@/pages/SecretTriageCandidatesPage'
import { SecretPageBoundary } from '@/components/SecretPageBoundary'
import { IacPage } from '@/iac/IacPage'

export function App() {
  return (
    <Routes>
      <Route path={LOGIN_PATH} element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path={OVERVIEW_PATH} element={<OverviewPage />} />
          <Route path="/secrets" element={<SecretOverviewPage />} />
          <Route path="/secrets/findings" element={<SecretsPage />} />
          <Route path="/secrets/:secretId" element={<SecretPageBoundary returnTo="/secrets/findings"><SecretKeyDetailPage /></SecretPageBoundary>} />
          <Route path="/secrets/cases" element={<SecretCasesPage />} />
          <Route path="/secrets/triage" element={<SecretTriageCandidatesPage />} />
          <Route path="/secrets/triage/:secretId" element={<SecretTriagePage />} />
          <Route path="/secrets/connections" element={<SecretConnectionsPage />} />
          <Route path="/secrets/connections/:connectionId/scopes" element={<SecretPageBoundary returnTo="/secrets/connections"><SecretConnectionScopesPage /></SecretPageBoundary>} />
          <Route path="/secrets/history" element={<SecretHistoryPage />} />
          <Route path="/secrets/history/:runId" element={<SecretPageBoundary returnTo="/secrets/history"><SecretRunDetailPage /></SecretPageBoundary>} />
          <Route path="/iac" element={<IacPage />} />
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
