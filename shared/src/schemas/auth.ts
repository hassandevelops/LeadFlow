import { z } from "zod";
import { employeeStatusSchema, roleSchema } from "../enums";
import { permissionSchema } from "../permissions";
import { emailSchema, idSchema } from "./common";

export const signupSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: z.string().min(10).max(128),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const sessionUserSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  workspaceName: z.string(),
  workspaceSlug: z.string(),
  name: z.string(),
  email: emailSchema,
  role: roleSchema,
  permissions: z.array(permissionSchema),
  employeeStatus: employeeStatusSchema,
});
export type SessionUser = z.infer<typeof sessionUserSchema>;
