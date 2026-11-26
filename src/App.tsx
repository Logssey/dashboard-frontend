import { SecurityDetailPage } from '@/pages/SecurityDetailPages'
import { lazy } from 'react'
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
import { SecretKeyPatternsPage } from '@/pages/SecretKeyPatternsPage'
import { SecretPageBoundary } from '@/components/SecretPageBoundary'
import { IacPage } from '@/iac/IacPage'
import { VulnerabilityFindingsPage, VulnerabilitySummaryPage } from '@/pages/VulnerabilitiesPage'
import { VulnerabilityWorkloadsPage } from '@/pages/ReachWorkloadsPage'
import { VulnerabilityScansPage } from '@/pages/ReachScansPage'
import { VulnerabilityRulesPage } from '@/pages/ReachRulesPage'
import { RuntimePage } from '@/pages/RuntimePage'
import { CompliancePage } from '@/pages/CompliancePage'
import { ReportListPage } from '@/report/ReportListPage'
import { ReportViewPage } from '@/report/ReportViewPage'
import { CodeScanPage } from '@/code/CodeScanPage'
import { CodePolicyPage } from '@/code/CodePolicyPage'

const SecretClassificationQueuePage = lazy(() => import('@/pages/SecretScopeClassificationPage').then((module) => ({ default: module.SecretClassificationQueuePage })))
const SecretScopeClassificationPage = lazy(() => import('@/pages/SecretScopeClassificationPage').then((module) => ({ default: module.SecretScopeClassificationPage })))
const SecretPolicyListPage = lazy(() => import('@/pages/SecretPolicyPages').then((module) => ({ default: module.SecretPolicyListPage })))
const SecretPolicyDetailPage = lazy(() => import('@/pages/SecretPolicyPages').then((module) => ({ default: module.SecretPolicyDetailPage })))
const SecretInvestigationListPage = lazy(() => import('@/pages/SecretInvestigationPages').then((module) => ({ default: module.SecretInvestigationListPage })))
const SecretInvestigationDetailPage = lazy(() => import('@/pages/SecretInvestigationPages').then((module) => ({ default: module.SecretInvestigationDetailPage })))
const SecretFixtureAttestationsPage = lazy(() => import('@/pages/SecretFixtureAttestationsPage').then((module) => ({ default: module.SecretFixtureAttestationsPage })))
const SecretAlertListPage = lazy(() => import('@/pages/SecretAlertPages').then((module) => ({ default: module.SecretAlertListPage })))
const SecretAlertDetailPage = lazy(() => import('@/pages/SecretAlertPages').then((module) => ({ default: module.SecretAlertDetailPage })))
const SecretTriagePage = lazy(() => import('@/pages/SecretTriagePage').then((module) => ({ default: module.SecretTriagePage })))
const SecretTriageCandidatesPage = lazy(() => import('@/pages/SecretTriageCandidatesPage').then((module) => ({ default: module.SecretTriageCandidatesPage })))
const SecretCasesPage = lazy(() => import('@/pages/SecretCasesPage').then((module) => ({ default: module.SecretCasesPage })))
const ActionManagementPage = lazy(() => import('@/pages/ActionManagementPage').then(module => ({default:module.ActionManagementPage})))
const SecretCaseDetailPage = lazy(() => import('@/pages/SecretCaseDetailPage').then((module) => ({ default: module.SecretCaseDetailPage })))
const SecretRunFindingsPage = lazy(() => import('@/pages/SecretRunFindingsPage').then((module) => ({ default: module.SecretRunFindingsPage })))

export function App() {
  return (
    <Routes>
      <Route path={LOGIN_PATH} element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path={OVERVIEW_PATH} element={<OverviewPage />} />
          <Route path="/iac/actions" element={<ActionManagementPage fixedArea="IAC" />} />
          <Route path="/vulnerabilities/actions" element={<ActionManagementPage fixedArea="IMAGE" />} />
          <Route path="/actions" element={<ActionManagementPage />} />
          <Route path="/secrets" element={<SecretOverviewPage />} />
          <Route path="/secrets/findings" element={<SecretsPage />} />
          <Route path="/secrets/:secretId" element={<SecretPageBoundary returnTo="/secrets/findings"><SecretKeyDetailPage /></SecretPageBoundary>} />
          <Route path="/secrets/:secretId/fixture-attestations" element={<SecretPageBoundary returnTo="/secrets/findings"><SecretFixtureAttestationsPage /></SecretPageBoundary>} />
          <Route path="/secrets/cases" element={<SecretPageBoundary returnTo="/secrets"><SecretCasesPage /></SecretPageBoundary>} />
          <Route path="/secrets/cases/:caseId" element={<SecretPageBoundary returnTo="/secrets/cases"><SecretCaseDetailPage /></SecretPageBoundary>} />
          <Route path="/secrets/triage" element={<SecretPageBoundary returnTo="/secrets"><SecretTriageCandidatesPage /></SecretPageBoundary>} />
          <Route path="/secrets/triage/investigations" element={<SecretPageBoundary returnTo="/secrets/triage"><SecretInvestigationListPage /></SecretPageBoundary>} />
          <Route path="/secrets/triage/investigations/:taskId" element={<SecretPageBoundary returnTo="/secrets/triage/investigations"><SecretInvestigationDetailPage /></SecretPageBoundary>} />
          <Route path="/secrets/triage/alerts" element={<SecretPageBoundary returnTo="/secrets/triage"><SecretAlertListPage /></SecretPageBoundary>} />
          <Route path="/secrets/triage/alerts/:alertId" element={<SecretPageBoundary returnTo="/secrets/triage/alerts"><SecretAlertDetailPage /></SecretPageBoundary>} />
          <Route path="/secrets/triage/:secretId" element={<SecretPageBoundary returnTo="/secrets/triage"><SecretTriagePage /></SecretPageBoundary>} />
          <Route path="/secrets/connections" element={<SecretConnectionsPage />} />
          <Route path="/secrets/connections/review" element={<SecretPageBoundary returnTo="/secrets/connections"><SecretClassificationQueuePage /></SecretPageBoundary>} />
          <Route path="/secrets/connections/policies" element={<SecretPageBoundary returnTo="/secrets/connections"><SecretPolicyListPage /></SecretPageBoundary>} />
          <Route path="/secrets/connections/policies/:policyId/versions/:version" element={<SecretPageBoundary returnTo="/secrets/connections/policies"><SecretPolicyDetailPage /></SecretPageBoundary>} />
          <Route path="/secrets/connections/:connectionId/scopes/:scopeId" element={<SecretPageBoundary returnTo="/secrets/connections"><SecretScopeClassificationPage /></SecretPageBoundary>} />
          <Route path="/secrets/connections/:connectionId/scopes" element={<SecretPageBoundary returnTo="/secrets/connections"><SecretConnectionScopesPage /></SecretPageBoundary>} />
          <Route path="/secrets/key-patterns" element={<SecretKeyPatternsPage />} />
          <Route path="/secrets/history" element={<SecretHistoryPage />} />
          <Route path="/secrets/history/:runId" element={<SecretPageBoundary returnTo="/secrets/history"><SecretRunDetailPage /></SecretPageBoundary>} />
          <Route path="/secrets/history/:runId/findings" element={<SecretPageBoundary returnTo="/secrets/history"><SecretRunFindingsPage /></SecretPageBoundary>} />
          <Route path="/iac" element={<IacPage />} />
          <Route path="/iac/prs" element={<IacPage />} />
          <Route path="/iac/paths" element={<IacPage />} />
          <Route path="/iac/changes" element={<IacPage />} />
          <Route path="/iac/checks" element={<IacPage />} />
          <Route path="/iac/prs/:id" element={<SecurityDetailPage kind="pr" />} />
          <Route path="/iac/findings/:id" element={<SecurityDetailPage kind="iacFinding" />} />
          <Route path="/iac/paths/:id" element={<SecurityDetailPage kind="path" />} />
          <Route path="/vulnerabilities/findings/:id" element={<SecurityDetailPage kind="finding" />} />
          <Route path="/vulnerabilities" element={<VulnerabilitySummaryPage />} />
          <Route path="/vulnerabilities/findings" element={<VulnerabilityFindingsPage />} />
          <Route path="/vulnerabilities/workloads" element={<VulnerabilityWorkloadsPage />} />
          <Route path="/vulnerabilities/scans" element={<VulnerabilityScansPage />} />
          <Route path="/vulnerabilities/rules" element={<VulnerabilityRulesPage />} />
          <Route path="/runtime" element={<RuntimePage />} />
          <Route path="/configuration" element={<CompliancePage />} />
          <Route path="/reports" element={<ReportListPage />} />
          <Route path="/reports/:reportId" element={<ReportViewPage />} />
          <Route path="/code" element={<CodeScanPage />} />
          <Route path="/code/policy" element={<CodePolicyPage />} />
          {sectionPages
            .filter(
              (page) =>
                !page.path.startsWith('/secrets') &&
                !page.path.startsWith('/vulnerabilities') &&
                page.path !== '/runtime' &&
                page.path !== '/configuration' &&
                page.path !== '/reports' &&
                page.path !== '/code',
            )
            .map((page) => (
              <Route key={page.path} path={page.path} element={<ComingSoonPage page={page} />} />
            ))}
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={OVERVIEW_PATH} replace />} />
    </Routes>
  )
}
