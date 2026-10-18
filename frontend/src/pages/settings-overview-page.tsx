import { Link } from "react-router";
import { useAuth } from "../auth/use-auth";
import { useCan } from "../auth/use-can";
import { Card, CardBody, CardHeader } from "../components/ui/card";

export function SettingsOverviewPage() {
  const { user } = useAuth();
  const can = useCan();

  const sections = [
    {
      to: "/settings/users",
      title: "Team & permissions",
      description: "Invite teammates, manage roles and fine-tune permissions.",
      visible: can("users.manage"),
    },
    {
      to: "/settings/assignment-rules",
      title: "Lead assignment rules",
      description: "Round-robin capacity, acknowledgement windows and escalation levels.",
      visible: can("assignment.manage_rules"),
    },
    {
      to: "/settings/pipeline",
      title: "Pipelines & custom fields",
      description: "Stages, required fields and custom data captured across the CRM.",
      visible: can("crm.edit"),
    },
  ].filter((section) => section.visible);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="sm:col-span-2">
        <CardHeader title="Workspace" description="Current account details" />
        <CardBody>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-slate-500">Workspace</dt>
              <dd className="font-medium">{user?.workspaceName}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Signed in as</dt>
              <dd className="font-medium">{user?.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Role</dt>
              <dd className="font-medium capitalize">{user?.role}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>
      {sections.map((section) => (
        <Link
          key={section.to}
          to={section.to}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-slate-400"
        >
          <p className="text-sm font-semibold text-slate-900">{section.title}</p>
          <p className="mt-1 text-sm text-slate-500">{section.description}</p>
        </Link>
      ))}
    </div>
  );
}
