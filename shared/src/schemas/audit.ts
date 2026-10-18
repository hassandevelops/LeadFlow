import { z } from "zod";
import { actorTypeSchema, auditEventTypeSchema } from "../enums";
import { paginationQuerySchema } from "../http";
import { idSchema, isoDateSchema } from "./common";

export const auditEntrySchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  actorId: idSchema.nullable(),
  actorType: actorTypeSchema,
  actorName: z.string(),
  eventType: auditEventTypeSchema,
  targetType: z.string(),
  targetId: z.string(),
  summary: z.string(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  at: isoDateSchema,
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditQuerySchema = paginationQuerySchema.extend({
  eventType: auditEventTypeSchema.optional(),
  actorId: idSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;
