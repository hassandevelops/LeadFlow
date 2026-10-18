import { Route, Routes } from "react-router";
import { RequireGuest, RequireSession } from "./auth/session-guard";
import { AppShell } from "./components/app-shell";
import { RequirePermission } from "./components/permission-gate";
import { AuditPage } from "./pages/audit-page";
import { CalendarPage } from "./pages/calendar-page";
import { CompaniesPage } from "./pages/companies-page";
import { CompanyDetailPage } from "./pages/company-detail-page";
import { ContactDetailPage } from "./pages/contact-detail-page";
import { ContactsPage } from "./pages/contacts-page";
import { DashboardPage } from "./pages/dashboard-page";
import { InboxPage } from "./pages/inbox-page";
import { IntegrationsPage } from "./pages/integrations-page";
import { LeadsPage } from "./pages/leads-page";
import { LoginPage } from "./pages/login-page";
import { NotFoundPage } from "./pages/not-found-page";
import { OpportunityDetailPage } from "./pages/opportunity-detail-page";
import { PaymentsPage } from "./pages/payments-page";
import { PipelinePage } from "./pages/pipeline-page";
import { RecoveryQueuePage } from "./pages/recovery-queue-page";
import { SettingsAssignmentRulesPage } from "./pages/settings-assignment-rules-page";
import { SettingsLayout } from "./pages/settings-layout";
import { SettingsOverviewPage } from "./pages/settings-overview-page";
import { SettingsPipelinePage } from "./pages/settings-pipeline-page";
import { SettingsUsersPage } from "./pages/settings-users-page";
import { SignupPage } from "./pages/signup-page";

export function App() {
  return (
    <Routes>
      <Route element={<RequireGuest />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
      </Route>
      <Route element={<RequireSession />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route
            path="/leads"
            element={
              <RequirePermission permission="leads.view">
                <LeadsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/recovery-queue"
            element={
              <RequirePermission permission="leads.view">
                <RecoveryQueuePage />
              </RequirePermission>
            }
          />
          <Route
            path="/pipeline"
            element={
              <RequirePermission permission="crm.view">
                <PipelinePage />
              </RequirePermission>
            }
          />
          <Route
            path="/contacts"
            element={
              <RequirePermission permission="crm.view">
                <ContactsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/contacts/:id"
            element={
              <RequirePermission permission="crm.view">
                <ContactDetailPage />
              </RequirePermission>
            }
          />
          <Route
            path="/companies"
            element={
              <RequirePermission permission="crm.view">
                <CompaniesPage />
              </RequirePermission>
            }
          />
          <Route
            path="/companies/:id"
            element={
              <RequirePermission permission="crm.view">
                <CompanyDetailPage />
              </RequirePermission>
            }
          />
          <Route
            path="/opportunities/:id"
            element={
              <RequirePermission permission="crm.view">
                <OpportunityDetailPage />
              </RequirePermission>
            }
          />
          <Route
            path="/conversations"
            element={
              <RequirePermission permission="crm.view">
                <InboxPage />
              </RequirePermission>
            }
          />
          <Route
            path="/payments"
            element={
              <RequirePermission permission="crm.view">
                <PaymentsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/appointments"
            element={
              <RequirePermission permission="crm.view">
                <CalendarPage />
              </RequirePermission>
            }
          />
          <Route
            path="/audit"
            element={
              <RequirePermission permission="audit.view">
                <AuditPage />
              </RequirePermission>
            }
          />
          <Route
            path="/integrations"
            element={
              <RequirePermission permission="integrations.manage">
                <IntegrationsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/settings"
            element={
              <RequirePermission permission="crm.view">
                <SettingsLayout />
              </RequirePermission>
            }
          >
            <Route index element={<SettingsOverviewPage />} />
            <Route
              path="users"
              element={
                <RequirePermission permission="users.manage">
                  <SettingsUsersPage />
                </RequirePermission>
              }
            />
            <Route
              path="assignment-rules"
              element={
                <RequirePermission permission="assignment.manage_rules">
                  <SettingsAssignmentRulesPage />
                </RequirePermission>
              }
            />
            <Route
              path="pipeline"
              element={
                <RequirePermission permission="crm.edit">
                  <SettingsPipelinePage />
                </RequirePermission>
              }
            />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
