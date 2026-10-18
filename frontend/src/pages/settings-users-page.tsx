import { useState } from "react";
import {
  PERMISSIONS,
  ROLE_PRESET_LABELS,
  presetPermissions,
  type Permission,
  type PublicUser,
  type Role,
  type RolePreset,
} from "@leadflow/shared";
import { useAuth } from "../auth/use-auth";
import {
  useInviteUser,
  useUpdateUserPermissions,
  useUpdateUserRole,
  useUsers,
} from "../api/users";
import { Avatar } from "../components/ui/avatar";
import { StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardHeader } from "../components/ui/card";
import { Checkbox, Field, Select, TextInput } from "../components/ui/field";
import { Modal } from "../components/ui/modal";
import { Pagination } from "../components/ui/pagination";
import { ErrorBlock, LoadingBlock } from "../components/ui/states";
import { TD, TH, TR, TableWrap } from "../components/ui/table";
import { useToast } from "../components/ui/toast";
import { humanize } from "../lib/format";

const ROLES: Role[] = ["owner", "admin", "user"];
const PRESETS: RolePreset[] = ["owner", "admin", "manager", "user"];

export function SettingsUsersPage() {
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const usersQuery = useUsers({ page, pageSize });
  const updateRole = useUpdateUserRole();
  const updatePermissions = useUpdateUserPermissions();
  const inviteUser = useInviteUser();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<{ name: string; email: string; role: Role }>({
    name: "",
    email: "",
    role: "user",
  });
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [permissionsTarget, setPermissionsTarget] = useState<PublicUser | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<Permission[]>([]);

  if (usersQuery.isPending) return <LoadingBlock />;
  if (usersQuery.isError) {
    return <ErrorBlock error={usersQuery.error} onRetry={() => void usersQuery.refetch()} />;
  }

  const users = usersQuery.data.data;

  function canEdit(target: PublicUser): boolean {
    if (!currentUser) return false;
    if (target.id === currentUser.id) return false;
    if (currentUser.role === "admin" && target.role === "owner") return false;
    return true;
  }

  async function handleRoleChange(target: PublicUser, role: Role) {
    try {
      await updateRole.mutateAsync({ id: target.id, input: { role } });
      toast.show({ title: `${target.name} is now ${role}`, variant: "success" });
    } catch (error) {
      toast.show({
        title: "Could not change role",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    }
  }

  async function handleInvite() {
    if (!inviteForm.name.trim() || !inviteForm.email.trim()) {
      setInviteError("Name and email are required");
      return;
    }
    try {
      await inviteUser.mutateAsync(inviteForm);
      toast.show({ title: `Invited ${inviteForm.name}`, variant: "success" });
      setInviteOpen(false);
      setInviteForm({ name: "", email: "", role: "user" });
      setInviteError(null);
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : "Could not invite user");
    }
  }

  async function handleSavePermissions() {
    if (!permissionsTarget) return;
    try {
      await updatePermissions.mutateAsync({
        id: permissionsTarget.id,
        input: { permissions: permissionDraft },
      });
      toast.show({ title: `Permissions updated for ${permissionsTarget.name}`, variant: "success" });
      setPermissionsTarget(null);
    } catch (error) {
      toast.show({
        title: "Could not update permissions",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Team"
          description={`${usersQuery.data.total} members in this workspace`}
          actions={
            <Button onClick={() => setInviteOpen(true)} size="sm">
              Invite teammate
            </Button>
          }
        />
        <TableWrap>
          <thead>
            <tr>
              <TH>Member</TH>
              <TH>Role</TH>
              <TH>Status</TH>
              <TH>Open leads</TH>
              <TH className="text-right">Actions</TH>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <TR key={user.id}>
                <TD>
                  <div className="flex items-center gap-3">
                    <Avatar name={user.name} />
                    <div>
                      <p className="font-medium text-slate-900">
                        {user.name}
                        {user.id === currentUser?.id ? (
                          <span className="ml-2 text-xs text-slate-400">(you)</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </div>
                  </div>
                </TD>
                <TD>
                  <Select
                    className="w-32"
                    value={user.role}
                    disabled={!canEdit(user) || updateRole.isPending}
                    onChange={(event) => void handleRoleChange(user, event.target.value as Role)}
                    aria-label={`Role for ${user.name}`}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role} disabled={currentUser?.role === "admin" && role === "owner"}>
                        {humanize(role)}
                      </option>
                    ))}
                  </Select>
                </TD>
                <TD>
                  <StatusBadge status={user.employeeStatus} />
                </TD>
                <TD>{user.openLeadCount}</TD>
                <TD className="text-right">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!canEdit(user) && user.id !== currentUser?.id}
                    onClick={() => {
                      setPermissionsTarget(user);
                      setPermissionDraft(user.permissions);
                    }}
                  >
                    Permissions
                  </Button>
                </TD>
              </TR>
            ))}
          </tbody>
        </TableWrap>
        <Pagination
          page={page}
          pageSize={pageSize}
          total={usersQuery.data.total}
          onPageChange={setPage}
        />
      </Card>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite teammate"
        description="They will receive an email invitation to join the workspace."
        footer={
          <>
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleInvite()} isLoading={inviteUser.isPending}>
              Send invite
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Full name" required>
            <TextInput
              value={inviteForm.name}
              onChange={(event) => setInviteForm({ ...inviteForm, name: event.target.value })}
              autoFocus
            />
          </Field>
          <Field label="Email" required>
            <TextInput
              type="email"
              value={inviteForm.email}
              onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })}
            />
          </Field>
          <Field label="Role">
            <Select
              value={inviteForm.role}
              onChange={(event) => setInviteForm({ ...inviteForm, role: event.target.value as Role })}
            >
              {ROLES.filter((role) => !(currentUser?.role === "admin" && role === "owner")).map(
                (role) => (
                  <option key={role} value={role}>
                    {humanize(role)}
                  </option>
                ),
              )}
            </Select>
          </Field>
          {inviteError ? (
            <p role="alert" className="text-sm text-red-600">
              {inviteError}
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={permissionsTarget !== null}
        onClose={() => setPermissionsTarget(null)}
        title={`Permissions — ${permissionsTarget?.name ?? ""}`}
        description="Fine-tune what this teammate can see and do."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPermissionsTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSavePermissions()} isLoading={updatePermissions.isPending}>
              Save permissions
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset}
                variant="secondary"
                size="sm"
                onClick={() => setPermissionDraft(presetPermissions(preset))}
              >
                Apply {ROLE_PRESET_LABELS[preset]} preset
              </Button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {PERMISSIONS.map((permission) => (
              <Checkbox
                key={permission}
                label={humanize(permission.replaceAll(".", " "))}
                checked={permissionDraft.includes(permission)}
                onChange={(event) => {
                  setPermissionDraft((draft) =>
                    event.target.checked
                      ? [...draft, permission]
                      : draft.filter((item) => item !== permission),
                  );
                }}
              />
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
