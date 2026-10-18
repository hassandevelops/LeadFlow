import { z } from "zod";
import { employeeStatusSchema, roleSchema } from "../enums";
import { permissionSchema } from "../permissions";
import { emailSchema, idSchema, timestampsSchema } from "./common";

export const publicUserSchema = z
  .object({
    id: idSchema,
    name: z.string(),
    email: emailSchema,
    role: roleSchema,
    permissions: z.array(permissionSchema),
    employeeStatus: employeeStatusSchema,
    openLeadCount: z.number().int().min(0),
  })
  .merge(timestampsSchema);
export type PublicUser = z.infer<typeof publicUserSchema>;

export const inviteUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  role: roleSchema,
  permissions: z.array(permissionSchema).optional(),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateUserRoleSchema = z.object({
  role: roleSchema,
  permissions: z.array(permissionSchema).optional(),
});
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;

export const updateUserPermissionsSchema = z.object({
  permissions: z.array(permissionSchema),
});
export type UpdateUserPermissionsInput = z.infer<typeof updateUserPermissionsSchema>;

export const updateEmployeeStatusSchema = z.object({
  status: employeeStatusSchema,
});
export type UpdateEmployeeStatusInput = z.infer<typeof updateEmployeeStatusSchema>;

export const availabilitySchema = z.object({
  userId: idSchema,
  name: z.string(),
  status: employeeStatusSchema,
  openLeadCount: z.number().int().min(0),
  maxOpenLeads: z.number().int().min(1),
  isAvailable: z.boolean(),
});
export type Availability = z.infer<typeof availabilitySchema>;
