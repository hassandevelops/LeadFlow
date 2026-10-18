import { z } from "zod";
import { customFieldEntitySchema, customFieldTypeSchema } from "../enums";
import { idSchema, timestampsSchema } from "./common";

export const customFieldDefinitionSchema = z
  .object({
    id: idSchema,
    workspaceId: idSchema,
    entity: customFieldEntitySchema,
    pipelineId: idSchema.nullable(),
    key: z.string(),
    label: z.string(),
    type: customFieldTypeSchema,
    options: z.array(z.string()),
    required: z.boolean(),
    order: z.number().int().min(0),
  })
  .merge(timestampsSchema);
export type CustomFieldDefinition = z.infer<typeof customFieldDefinitionSchema>;

export const createCustomFieldSchema = z
  .object({
    entity: customFieldEntitySchema,
    pipelineId: idSchema.nullable().optional(),
    key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,40}$/),
    label: z.string().trim().min(1).max(120),
    type: customFieldTypeSchema,
    options: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
    required: z.boolean().default(false),
    order: z.number().int().min(0).default(0),
  })
  .superRefine((value, ctx) => {
    if (value.type === "dropdown" && value.options.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Dropdown fields need at least one option",
      });
    }
    if (value.type !== "dropdown" && value.options.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Options are only allowed for dropdown fields",
      });
    }
  });
export type CreateCustomFieldInput = z.infer<typeof createCustomFieldSchema>;

export const updateCustomFieldSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  options: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  required: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
});
export type UpdateCustomFieldInput = z.infer<typeof updateCustomFieldSchema>;

export const stageSchema = z
  .object({
    id: idSchema,
    pipelineId: idSchema,
    name: z.string(),
    order: z.number().int().min(0),
    isWon: z.boolean(),
    isLost: z.boolean(),
    color: z.string().nullable(),
    requiredFieldKeys: z.array(z.string()),
  })
  .merge(timestampsSchema);
export type Stage = z.infer<typeof stageSchema>;

export const pipelineSchema = z
  .object({
    id: idSchema,
    workspaceId: idSchema,
    name: z.string(),
    isDefault: z.boolean(),
    stages: z.array(stageSchema),
  })
  .merge(timestampsSchema);
export type Pipeline = z.infer<typeof pipelineSchema>;

export const createPipelineSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export type CreatePipelineInput = z.infer<typeof createPipelineSchema>;

export const updatePipelineSchema = createPipelineSchema.partial();
export type UpdatePipelineInput = z.infer<typeof updatePipelineSchema>;

export const createStageSchema = z.object({
  name: z.string().trim().min(1).max(120),
  isWon: z.boolean().default(false),
  isLost: z.boolean().default(false),
  color: z.string().trim().max(32).optional(),
  requiredFieldKeys: z.array(z.string()).default([]),
});
export type CreateStageInput = z.infer<typeof createStageSchema>;

export const updateStageSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional(),
  color: z.string().trim().max(32).nullable().optional(),
  requiredFieldKeys: z.array(z.string()).optional(),
});
export type UpdateStageInput = z.infer<typeof updateStageSchema>;

export const reorderStagesSchema = z.object({
  stageIds: z.array(idSchema).min(1),
});
export type ReorderStagesInput = z.infer<typeof reorderStagesSchema>;

export const deleteStageSchema = z.object({
  moveToStageId: idSchema.optional(),
});
export type DeleteStageInput = z.infer<typeof deleteStageSchema>;
