import type { Permission } from "@leadflow/shared";
import type { Role, User, Workspace } from "@prisma/client";

export type AuthContext = {
  user: User;
  workspace: Workspace;
  workspaceId: string;
  role: Role;
  permissions: Permission[];
};
