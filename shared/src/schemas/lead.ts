import { z } from "zod";
import { assignmentModeSchema, leadSourceSchema, recoveryReasonSchema } from "../enums";
import { customFieldsSchema, emailSchema, idSchema, phoneSchema } from "./common";

export const createLeadSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    title: z.string().trim().min(1).max(200).optional(),
    value: z.number().nonnegative().max(100000000).optional(),
    source: leadSourceSchema.default("manual"),
    pipelineId: idSchema.optional(),
    ownerId: idSchema.optional(),
    customFields: customFieldsSchema.optional(),
    note: z.string().trim().max(5000).optional(),
  })
  .refine((value) => value.email !== undefined || value.phone !== undefined, {
    message: "A lead needs at least an email or a phone number",
    path: ["email"],
  });
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const webFormLeadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  message: z.string().trim().max(5000).optional(),
});
export type WebFormLeadInput = z.infer<typeof webFormLeadSchema>;

export const reassignLeadSchema = z.object({
  toUserId: idSchema,
  reason: z.string().trim().max(500).optional(),
});
export type ReassignLeadInput = z.infer<typeof reassignLeadSchema>;

export const escalationLevelSchema = z.object({
  targetUserId: idSchema.nullable().default(null),
  timeoutSeconds: z.number().int().min(5).max(86400).default(300),
});
export type EscalationLevel = z.infer<typeof escalationLevelSchema>;

export const ABSENCE_HANDLING = ["reassign_unacknowledged", "reassign_all"] as const;
export const absenceHandlingSchema = z.enum(ABSENCE_HANDLING);
export type AbsenceHandling = z.infer<typeof absenceHandlingSchema>;

export const assignmentRulesSchema = z.object({
  mode: assignmentModeSchema.default("round_robin"),
  maxOpenLeadsPerUser: z.number().int().min(1).max(50).default(10),
  ackWindowSeconds: z.number().int().min(5).max(86400).default(300),
  escalationLevels: z.array(escalationLevelSchema).max(5).default([]),
  backupUserId: idSchema.nullable().default(null),
  managerUserId: idSchema.nullable().default(null),
  idleThresholdSeconds: z.number().int().min(60).max(604800).default(86400),
  absenceHandling: absenceHandlingSchema.default("reassign_unacknowledged"),
});
export type AssignmentRules = z.infer<typeof assignmentRulesSchema>;

export const updateAssignmentRulesSchema = assignmentRulesSchema.partial();
export type UpdateAssignmentRulesInput = z.infer<typeof updateAssignmentRulesSchema>;

export const recoveryQueueItemSchema = z.object({
  leadId: idSchema,
  title: z.string(),
  source: leadSourceSchema,
  ownerId: idSchema.nullable(),
  ownerName: z.string().nullable(),
  reason: recoveryReasonSchema,
  ackDeadlineAt: z.string().nullable(),
  escalationCount: z.number().int().min(0),
  assignedAt: z.string().nullable(),
  lastActionAt: z.string().nullable(),
});
export type RecoveryQueueItem = z.infer<typeof recoveryQueueItemSchema>;
