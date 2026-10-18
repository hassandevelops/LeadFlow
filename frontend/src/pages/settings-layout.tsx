import { NavLink, Outlet } from "react-router";
import type { Permission } from "@leadflow/shared";
import { useCan } from "../auth/use-can";
import { PageHeader } from "../components/ui/card";
import { cn } from "../lib/cn";

const TABS: Array<{ to: string; label: string; permission?: Permission; end?: boolean }> = [
  { to: "/settings", label: "Overview", end: true },
  { to: "/settings/users", label: "Team", permission: "users.manage" },
  {
    to: "/settings/assignment-rules",
    label: "Assignment rules",
    permission: "assignment.manage_rules",
  },
  { to: "/settings/pipeline", label: "Pipelines & fields", permission: "crm.edit" },
];

export function SettingsLayout() {
  const can = useCan();
  const visibleTabs = TABS.filter((tab) => !tab.permission || can(tab.permission));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Settings" description="Workspace configuration for your team." />
      <div className="mb-6 flex flex-wrap gap-1 border-b border-slate-200" role="tablist">
        {visibleTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            role="tab"
            className={({ isActive }) =>
              cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
                isActive
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700",
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
