import { z } from "zod";
import type { Role } from "./enums";

export const PERMISSIONS = [
  "crm.view",
  "crm.create",
  "crm.edit",
  "crm.delete",
  "crm.export",
  "crm.view_value",
  "leads.view",
  "leads.assign",
  "assignment.manage_rules",
  "users.manage",
  "integrations.manage",
  "audit.view",
  "dashboard.company_view",
] as const;

export const permissionSchema = z.enum(PERMISSIONS);
export type Permission = z.infer<typeof permissionSchema>;

export const ROLE_PRESETS = {
  owner: [...PERMISSIONS],
  admin: [...PERMISSIONS],
  manager: [
    "crm.view",
    "crm.create",
    "crm.edit",
    "crm.export",
    "crm.view_value",
    "leads.view",
    "leads.assign",
    "assignment.manage_rules",
    "dashboard.company_view",
  ],
  user: ["crm.view", "crm.create", "crm.edit", "leads.view"],
} as const satisfies Record<string, readonly Permission[]>;

export type RolePreset = keyof typeof ROLE_PRESETS;

export const BASE_ROLE_PRESETS: Record<Role, readonly Permission[]> = {
  owner: ROLE_PRESETS.owner,
  admin: ROLE_PRESETS.admin,
  user: ROLE_PRESETS.user,
};

export const ROLE_PRESET_LABELS: Record<RolePreset, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  user: "User",
};

export function presetPermissions(preset: RolePreset): Permission[] {
  return [...ROLE_PRESETS[preset]];
}

export function hasPermission(granted: readonly Permission[], required: Permission): boolean {
  return granted.includes(required);
}
