import type { ReactNode } from "react";
import type { Permission } from "@leadflow/shared";
import { useCan } from "../auth/use-can";
import { EmptyState } from "./ui/states";

export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const can = useCan();

  if (!can(permission)) {
    return (
      <EmptyState
        title="No access"
        description="You do not have permission to view this page. Ask a workspace admin for access."
      />
    );
  }

  return children;
}
