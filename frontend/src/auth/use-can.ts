import { hasPermission, type Permission } from "@leadflow/shared";
import { useAuth } from "./use-auth";

export function useCan() {
  const { user } = useAuth();

  return (permission: Permission): boolean =>
    user ? hasPermission(user.permissions, permission) : false;
}
