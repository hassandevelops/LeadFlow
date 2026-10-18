import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { EMPLOYEE_STATUSES, type Permission } from "@leadflow/shared";
import { useAuth } from "../auth/use-auth";
import { useCan } from "../auth/use-can";
import { useUpdateMyStatus } from "../api/users";
import { useToast } from "./ui/toast";
import { Avatar } from "./ui/avatar";
import { Select } from "./ui/field";
import { humanize } from "../lib/format";
import { env } from "../lib/env";
import { cn } from "../lib/cn";
import { useServerEvents } from "../realtime/use-server-events";
import { useQueryClient } from "@tanstack/react-query";

type NavItem = { to: string; label: string; permission?: Permission; anyOf?: Permission[] };

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard" },
  { to: "/leads", label: "Leads", permission: "leads.view" },
  { to: "/recovery-queue", label: "Recovery queue", permission: "leads.view" },
  { to: "/pipeline", label: "Pipeline", permission: "crm.view" },
  { to: "/contacts", label: "Contacts", permission: "crm.view" },
  { to: "/companies", label: "Companies", permission: "crm.view" },
  { to: "/conversations", label: "Inbox", permission: "crm.view" },
  { to: "/appointments", label: "Calendar", permission: "crm.view" },
  { to: "/payments", label: "Payments", permission: "crm.view" },
  { to: "/audit", label: "Audit log", permission: "audit.view" },
  { to: "/integrations", label: "Integrations", permission: "integrations.manage" },
  { to: "/settings", label: "Settings", anyOf: ["users.manage", "assignment.manage_rules", "crm.edit"] },
];

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return cn(
    "block rounded-md px-3 py-2 text-sm font-medium",
    isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const can = useCan();
  const navigate = useNavigate();
  const toast = useToast();
  const updateStatus = useUpdateMyStatus();
  const queryClient = useQueryClient();
  const [isNavOpen, setIsNavOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  useServerEvents();

  useEffect(() => {
    mainRef.current?.focus();
    setIsNavOpen(false);
  }, [user?.id]);

  const visibleItems = NAV_ITEMS.filter(
    (item) =>
      (!item.permission || can(item.permission)) &&
      (!item.anyOf || item.anyOf.some((permission) => can(permission))),
  );

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  async function handleResetDemo() {
    const { resetDb, setSession } = await import("../mocks/store");
    resetDb();
    setSession(null);
    queryClient.clear();
    toast.show({ title: "Demo data reset", variant: "success" });
    window.location.assign("/login");
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-5">
        <div className="min-w-0">
          <p className="text-lg font-semibold">LeadFlow</p>
          <p className="truncate text-xs text-slate-500">{user?.workspaceName}</p>
        </div>
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setIsNavOpen(false)}
          className="rounded-md p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
        >
          ✕
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3" aria-label="Main">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={navLinkClass}
            onClick={() => setIsNavOpen(false)}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-200 px-4 py-4">
        <div className="flex items-center gap-2">
          <Avatar name={user?.name ?? "?"} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="truncate text-xs text-slate-500 capitalize">{user?.role}</p>
          </div>
        </div>
        <label className="mt-3 block">
          <span className="text-xs font-medium text-slate-500">My status</span>
          <Select
            value={user?.employeeStatus ?? "offline"}
            disabled={updateStatus.isPending}
            onChange={(event) => {
              const status = event.target.value as (typeof EMPLOYEE_STATUSES)[number];
              updateStatus.mutate(
                { status },
                {
                  onError: (error) =>
                    toast.show({ title: "Could not update status", description: error.message, variant: "error" }),
                },
              );
            }}
          >
            {EMPLOYEE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {humanize(status)}
              </option>
            ))}
          </Select>
        </label>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-3 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
        >
          Sign out
        </button>
        {env.enableMocks ? (
          <button
            type="button"
            onClick={handleResetDemo}
            className="mt-2 w-full rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
          >
            Reset demo data
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:block">
        {sidebar}
      </aside>

      {isNavOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            role="presentation"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setIsNavOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">{sidebar}</aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setIsNavOpen(true)}
            className="rounded-md border border-slate-300 p-1.5 text-slate-600"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
              <path d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 5A.75.75 0 0 1 2.75 9h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 9.75Zm0 5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" />
            </svg>
          </button>
          <p className="text-sm font-semibold">LeadFlow</p>
        </header>
        <main ref={mainRef} tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
