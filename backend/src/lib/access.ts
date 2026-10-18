import { hasPermission, type Permission } from "@leadflow/shared";
import type { AuthContext } from "../types/auth";

export function canViewValue(auth: AuthContext): boolean {
  return hasPermission(auth.permissions, "crm.view_value" as Permission);
}

export function actorOf(auth: AuthContext): { id: string; name: string } {
  return { id: auth.user.id, name: auth.user.name };
}
