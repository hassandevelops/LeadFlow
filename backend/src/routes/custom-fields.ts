import {
  createCustomFieldSchema,
  customFieldEntitySchema,
  updateCustomFieldSchema,
} from "@leadflow/shared";
import { Router } from "express";
import { z } from "zod";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { toCustomField } from "../lib/serialize";
import { parseBody, parseIdParam, parseQuery } from "../lib/validation";
import { authOf, requirePermission } from "../middleware/auth";
import { writeAudit } from "../services/audit";

export const customFieldsRouter = Router();

const entityQuerySchema = z.object({ entity: customFieldEntitySchema.optional() });

customFieldsRouter.get("/custom-fields", requirePermission("crm.view"), async (req, res) => {
  const { workspaceId } = authOf(req);
  const query = parseQuery(entityQuerySchema, req);
  const rows = await prisma.customFieldDefinition.findMany({
    where: { workspaceId, ...(query.entity ? { entity: query.entity } : {}) },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  res.json(rows.map(toCustomField));
});

customFieldsRouter.post("/custom-fields", requirePermission("crm.edit"), async (req, res) => {
  const { workspaceId, user } = authOf(req);
  const input = parseBody(createCustomFieldSchema, req);

  if (input.pipelineId) {
    const pipeline = await prisma.pipeline.findFirst({
      where: { id: input.pipelineId, workspaceId },
    });
    if (!pipeline) {
      throw ApiError.validationFailed("Pipeline not found in this workspace", [
        { path: "pipelineId", message: "Unknown pipeline" },
      ]);
    }
  }

  const duplicate = await prisma.customFieldDefinition.findFirst({
    where: {
      workspaceId,
      entity: input.entity,
      pipelineId: input.pipelineId ?? null,
      key: input.key,
    },
  });
  if (duplicate) {
    throw ApiError.conflict("A field with this key already exists for this entity");
  }

  const field = await prisma.customFieldDefinition.create({
    data: {
      workspaceId,
      entity: input.entity,
      pipelineId: input.pipelineId ?? null,
      key: input.key,
      label: input.label,
      type: input.type,
      options: input.options,
      required: input.required,
      order: input.order,
    },
  });

  await writeAudit({
    workspaceId,
    actor: { id: user.id, name: user.name },
    eventType: "config_change",
    targetType: "custom_field",
    targetId: field.id,
    summary: `Custom field “${field.label}” created`,
  });

  res.status(201).json(toCustomField(field));
});

customFieldsRouter.patch("/custom-fields/:id", requirePermission("crm.edit"), async (req, res) => {
  const { workspaceId } = authOf(req);
  const id = parseIdParam(req);
  const existing = await prisma.customFieldDefinition.findFirst({ where: { id, workspaceId } });
  if (!existing) {
    throw ApiError.notFound("Custom field not found");
  }
  const input = parseBody(updateCustomFieldSchema, req);

  if (input.options !== undefined) {
    if (existing.type === "dropdown" && input.options.length === 0) {
      throw ApiError.validationFailed("Dropdown fields need at least one option");
    }
    if (existing.type !== "dropdown" && input.options.length > 0) {
      throw ApiError.validationFailed("Options are only allowed for dropdown fields");
    }
  }

  const updated = await prisma.customFieldDefinition.update({
    where: { id: existing.id },
    data: {
      ...(input.label === undefined ? {} : { label: input.label }),
      ...(input.options === undefined ? {} : { options: input.options }),
      ...(input.required === undefined ? {} : { required: input.required }),
      ...(input.order === undefined ? {} : { order: input.order }),
    },
  });

  res.json(toCustomField(updated));
});

customFieldsRouter.delete("/custom-fields/:id", requirePermission("crm.edit"), async (req, res) => {
  const { workspaceId, user } = authOf(req);
  const id = parseIdParam(req);
  const field = await prisma.customFieldDefinition.findFirst({ where: { id, workspaceId } });
  if (!field) {
    throw ApiError.notFound("Custom field not found");
  }

  await prisma.customFieldDefinition.delete({ where: { id: field.id } });

  await writeAudit({
    workspaceId,
    actor: { id: user.id, name: user.name },
    eventType: "config_change",
    targetType: "custom_field",
    targetId: field.id,
    summary: `Custom field “${field.label}” deleted`,
  });

  res.status(204).end();
});
