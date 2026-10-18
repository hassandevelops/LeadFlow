import { useState } from "react";
import { Link } from "react-router";
import {
  DASHBOARD_WIDGET_KEYS,
  type DashboardScope,
  type DashboardWidgetKey,
} from "@leadflow/shared";
import { useAuth } from "../auth/use-auth";
import { useCan } from "../auth/use-can";
import {
  useDashboard,
  useDashboardPreferences,
  useUpdateDashboardPreferences,
} from "../api/dashboard";
import { Avatar } from "../components/ui/avatar";
import { Badge, StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardHeader, PageHeader } from "../components/ui/card";
import { Checkbox, Field, Select, TextInput } from "../components/ui/field";
import { Modal } from "../components/ui/modal";
import { ErrorBlock, LoadingBlock } from "../components/ui/states";
import { useToast } from "../components/ui/toast";
import { formatDateTime, formatDuration, formatMoney, humanize } from "../lib/format";

const WIDGET_LABELS: Record<DashboardWidgetKey, string> = {
  new_leads_today: "New leads today",
  open_pipeline_value: "Open pipeline value",
  avg_time_to_first_response: "Avg. time to first response",
  recovery_queue: "Recovery queue",
  escalations_24h: "Escalations (24h)",
  employee_availability: "Employee availability",
  upcoming_appointments: "Upcoming appointments",
  collected_revenue: "Revenue",
};

export function DashboardPage() {
  const toast = useToast();
  const { user } = useAuth();
  const can = useCan();
  const canCompany = can("dashboard.company_view");
  const [scope, setScope] = useState<DashboardScope>(canCompany ? "company" : "personal");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const dashboardQuery = useDashboard({
    scope,
    from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
  });
  const preferencesQuery = useDashboardPreferences();
  const updatePreferences = useUpdateDashboardPreferences();

  const metrics = dashboardQuery.data;
  const preferences = preferencesQuery.data?.widgets;
  const isVisible = (key: DashboardWidgetKey) => preferences?.[key] ?? true;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`Welcome back, ${user?.name.split(" ")[0] ?? "there"}`}
        description={
          metrics
            ? `Updated ${formatDateTime(metrics.generatedAt)} · server time ${formatDateTime(metrics.serverTime)}`
            : "Live workspace metrics."
        }
        actions={
          <>
            <Field label="Scope" className="w-36">
              <Select
                value={scope}
                onChange={(event) => setScope(event.target.value as DashboardScope)}
              >
                <option value="personal">Personal</option>
                {canCompany ? <option value="company">Company</option> : null}
              </Select>
            </Field>
            <Field label="From" className="w-36">
              <TextInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </Field>
            <Field label="To" className="w-36">
              <TextInput type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </Field>
            <Button variant="secondary" onClick={() => setCustomizeOpen(true)}>
              Customize
            </Button>
          </>
        }
      />

      {dashboardQuery.isPending ? <LoadingBlock /> : null}
      {dashboardQuery.isError ? (
        <ErrorBlock error={dashboardQuery.error} onRetry={() => void dashboardQuery.refetch()} />
      ) : null}

      {metrics ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isVisible("new_leads_today") ? (
            <MetricCard
              label="New leads today"
              value={String(metrics.newLeadsToday)}
              caption={scope === "company" ? "Across the workspace" : "Assigned to you"}
            />
          ) : null}

          {isVisible("avg_time_to_first_response") ? (
            <MetricCard
              label="Avg. time to first response"
              value={formatDuration(metrics.avgTimeToFirstResponseSeconds)}
              caption="From lead assignment to first touch"
            />
          ) : null}

          {isVisible("recovery_queue") ? (
            <MetricCard
              label="Recovery queue"
              value={String(metrics.recoveryQueueCount)}
              caption={
                <Link to="/recovery" className="text-blue-600 hover:underline">
                  Open recovery queue
                </Link>
              }
            />
          ) : null}

          {isVisible("escalations_24h") ? (
            <MetricCard
              label="Escalations (24h)"
              value={String(metrics.escalationsLast24h)}
              caption="Leads that breached the ack window"
            />
          ) : null}

          {isVisible("collected_revenue") ? (
            <MetricCard
              label="Revenue this month"
              value={formatMoney(
                metrics.collectedRevenueThisMonth.amount,
                metrics.collectedRevenueThisMonth.currency,
              )}
              caption={`Projected: ${formatMoney(
                metrics.projectedRevenue.amount,
                metrics.projectedRevenue.currency,
              )}`}
            />
          ) : null}

          {isVisible("open_pipeline_value") ? (
            <Card className="md:col-span-2 xl:col-span-1">
              <CardHeader title="Open pipeline value" />
              <div className="space-y-3 px-5 pb-5">
                {metrics.openPipelineValueByStage.length === 0 ? (
                  <p className="text-sm text-slate-500">No open opportunities.</p>
                ) : null}
                {metrics.openPipelineValueByStage.map((row) => {
                  const max = Math.max(
                    ...metrics.openPipelineValueByStage.map((item) => item.value ?? 0),
                    1,
                  );
                  return (
                    <div key={row.stageId}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700">{row.stageName}</span>
                        <span className="text-slate-500">
                          {row.valueHidden || row.value === null
                            ? "—"
                            : formatMoney(row.value, "usd")}{" "}
                          · {row.count}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                        <div
                          className="h-1.5 rounded-full bg-slate-800"
                          style={{
                            width: `${Math.round(((row.value ?? 0) / max) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}

          {isVisible("employee_availability") ? (
            <Card className="md:col-span-2">
              <CardHeader title="Employee availability" />
              <ul className="divide-y divide-slate-100">
                {metrics.employeeAvailability.map((item) => (
                  <li key={item.userId} className="flex items-center gap-3 px-5 py-3">
                    <Avatar name={item.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                      <p className="text-xs text-slate-500">
                        {item.openLeadCount}/{item.maxOpenLeads} open leads
                      </p>
                    </div>
                    <StatusBadge status={item.status} />
                    {!item.isAvailable ? (
                      <Badge tone="amber">At capacity</Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {isVisible("upcoming_appointments") ? (
            <Card className="md:col-span-2 xl:col-span-3">
              <CardHeader
                title="Upcoming appointments"
                actions={
                  <Link to="/calendar" className="text-sm text-blue-600 hover:underline">
                    Open calendar
                  </Link>
                }
              />
              {metrics.upcomingAppointments.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-slate-500">Nothing scheduled.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {metrics.upcomingAppointments.map((appointment) => (
                    <li
                      key={appointment.id}
                      className="flex items-center justify-between gap-3 px-5 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {appointment.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatDateTime(appointment.startsAt)} –{" "}
                          {formatDateTime(appointment.endsAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {appointment.status === "cancelled" ? (
                          <Badge tone="red">Cancelled</Badge>
                        ) : (
                          <StatusBadge status={appointment.syncState} />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
        </div>
      ) : null}

      <Modal
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        title="Customize dashboard"
        description="Choose which widgets appear on your dashboard."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCustomizeOpen(false)}>
              Close
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {DASHBOARD_WIDGET_KEYS.map((key) => (
            <Checkbox
              key={key}
              label={WIDGET_LABELS[key]}
              checked={isVisible(key)}
              onChange={(event) => {
                const next = {
                  ...(preferences ??
                    Object.fromEntries(
                      DASHBOARD_WIDGET_KEYS.map((item) => [item, true]),
                    )),
                  [key]: event.target.checked,
                } as Record<DashboardWidgetKey, boolean>;
                updatePreferences.mutate(
                  { widgets: next },
                  {
                    onError: (error) =>
                      toast.show({
                        title: "Could not save preferences",
                        description: error instanceof Error ? error.message : undefined,
                        variant: "error",
                      }),
                  },
                );
              }}
            />
          ))}
        </div>
      </Modal>
    </div>
  );
}

function MetricCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption?: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      {caption ? <p className="mt-1 text-xs text-slate-500">{caption}</p> : null}
    </Card>
  );
}
