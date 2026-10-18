import { z } from "zod";
import { activityTypeSchema, leadSourceSchema } from "../enums";
import { pageSchema, paginationQuerySchema } from "../http";
import { appointmentSchema } from "./appointment";
import { customFieldsSchema, emailSchema, idSchema, phoneSchema, tagsSchema, timestampsSchema } from "./common";
import { conversationSchema } from "./messaging";
import { paymentRequestSchema, paymentSchema } from "./payment";
import { publicUserSchema } from "./user";

export const companySchema = z
  .object({
    id: idSchema,
    workspaceId: idSchema,
    name: z.string(),
    domain: z.string().nullable(),
    phone: z.string().nullable(),
    address: z.string().nullable(),
  })
  .merge(timestampsSchema);
export type Company = z.infer<typeof companySchema>;

export const createCompanySchema = z.object({
  name: z.string().trim().min(1).max(200),
  domain: z.string().trim().max(200).optional(),
  phone: phoneSchema.optional(),
  address: z.string().trim().max(500).optional(),
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const updateCompanySchema = createCompanySchema.partial();
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export const contactSchema = z
  .object({
    id: idSchema,
    workspaceId: idSchema,
    name: z.string(),
    email: emailSchema.nullable(),
    phone: z.string().nullable(),
    companyId: idSchema.nullable(),
    ownerId: idSchema.nullable(),
    tags: tagsSchema,
    customFields: customFieldsSchema,
    optedOut: z.boolean(),
  })
  .merge(timestampsSchema);
export type Contact = z.infer<typeof contactSchema>;

export const createContactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  companyId: idSchema.optional(),
  ownerId: idSchema.optional(),
  tags: tagsSchema.optional(),
  customFields: customFieldsSchema.optional(),
});
export type CreateContactInput = z.infer<typeof createContactSchema>;

export const updateContactSchema = createContactSchema.partial().extend({
  optedOut: z.boolean().optional(),
});
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

export const contactListQuerySchema = paginationQuerySchema.extend({
  ownerId: idSchema.optional(),
  companyId: idSchema.optional(),
  tag: z.string().optional(),
});
export type ContactListQuery = z.infer<typeof contactListQuerySchema>;

export const opportunitySchema = z
  .object({
    id: idSchema,
    workspaceId: idSchema,
    title: z.string(),
    contactId: idSchema,
    companyId: idSchema.nullable(),
    pipelineId: idSchema,
    stageId: idSchema,
    value: z.number().nonnegative().nullable(),
    valueHidden: z.boolean(),
    currency: z.string().length(3),
    ownerId: idSchema.nullable(),
    source: leadSourceSchema,
    tags: tagsSchema,
    customFields: customFieldsSchema,
    assignedAt: z.string().nullable(),
    acknowledgedAt: z.string().nullable(),
    ackDeadlineAt: z.string().nullable(),
    escalationCount: z.number().int().min(0),
    stageEnteredAt: z.string().nullable(),
    lastActionAt: z.string().nullable(),
  })
  .merge(timestampsSchema);
export type Opportunity = z.infer<typeof opportunitySchema>;

export const createOpportunitySchema = z.object({
  title: z.string().trim().min(1).max(200),
  contactId: idSchema,
  companyId: idSchema.optional(),
  pipelineId: idSchema.optional(),
  stageId: idSchema.optional(),
  value: z.number().nonnegative().max(100000000).optional(),
  currency: z.string().length(3).toLowerCase().default("usd"),
  ownerId: idSchema.optional(),
  source: leadSourceSchema.default("manual"),
  tags: tagsSchema.optional(),
  customFields: customFieldsSchema.optional(),
});
export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;

export const updateOpportunitySchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  companyId: idSchema.nullable().optional(),
  value: z.number().nonnegative().max(100000000).nullable().optional(),
  currency: z.string().length(3).toLowerCase().optional(),
  ownerId: idSchema.nullable().optional(),
  tags: tagsSchema.optional(),
  customFields: customFieldsSchema.optional(),
});
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;

export const moveStageSchema = z.object({
  stageId: idSchema,
});
export type MoveStageInput = z.infer<typeof moveStageSchema>;

export const opportunityFilterSchema = paginationQuerySchema.extend({
  pipelineId: idSchema.optional(),
  stageId: idSchema.optional(),
  ownerId: idSchema.optional(),
  tag: z.string().optional(),
  source: leadSourceSchema.optional(),
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
  cf: z.record(z.string()).optional(),
});
export type OpportunityFilter = z.infer<typeof opportunityFilterSchema>;

export const activitySchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  entityType: z.enum(["contact", "company", "opportunity"]),
  entityId: idSchema,
  type: activityTypeSchema,
  actorId: idSchema.nullable(),
  actorName: z.string(),
  summary: z.string(),
  meta: z.record(z.unknown()),
  at: z.string(),
});
export type Activity = z.infer<typeof activitySchema>;

export const createNoteSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const savedListSchema = z
  .object({
    id: idSchema,
    workspaceId: idSchema,
    name: z.string(),
    entity: z.enum(["contact", "opportunity"]),
    filter: z.record(z.unknown()),
    createdBy: idSchema,
  })
  .merge(timestampsSchema);
export type SavedList = z.infer<typeof savedListSchema>;

export const createSavedListSchema = z.object({
  name: z.string().trim().min(1).max(120),
  entity: z.enum(["contact", "opportunity"]),
  filter: z.record(z.unknown()),
});
export type CreateSavedListInput = z.infer<typeof createSavedListSchema>;

export const contactFullViewSchema = z.object({
  contact: contactSchema,
  company: companySchema.nullable(),
  owner: publicUserSchema.nullable(),
  opportunities: z.array(opportunitySchema),
  conversations: z.array(conversationSchema),
  paymentRequests: z.array(paymentRequestSchema),
  payments: z.array(paymentSchema),
  appointments: z.array(appointmentSchema),
  activity: z.array(activitySchema),
});
export type ContactFullView = z.infer<typeof contactFullViewSchema>;

export const contactPageSchema = pageSchema(contactSchema);
export const companyPageSchema = pageSchema(companySchema);
export const opportunityPageSchema = pageSchema(opportunitySchema);
export const activityPageSchema = pageSchema(activitySchema);
