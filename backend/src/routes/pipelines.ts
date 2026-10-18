import {
  createPipelineSchema,
  createStageSchema,
  deleteStageSchema,
  reorderStagesSchema,
  updatePipelineSchema,
  updateStageSchema,
} from "@leadflow/shared";
import { Router } from "express";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { toPipeline, toStage } from "../lib/serialize";
import { parseBody, parseIdParam, parseQuery } from "../lib/validation";
import { authOf, requirePermission } from "../middleware/auth";
import { writeAudit } from "../services/audit";

export const pipelinesRouter = Router();

pipelinesRouter.get("/pipelines", requirePermission("crm.view"), async (req, res) => {
  const { workspaceId } = authOf(req);
  const pipelines = await prisma.pipeline.findMany({
    where: { workspaceId },
    include: { stages: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  res.json(pipelines.map(toPipeline));
});

pipelinesRouter.post("/pipelines", requirePermission("crm.edit"), async (req, res) => {
  const { workspaceId, user } = authOf(req);
  const input = parseBody(createPipelineSchema, req);

  const existingCount = await prisma.pipeline.count({ where: { workspaceId } });
  const pipeline = await prisma.pipeline.create({
    data: {
      workspaceId,
      name: input.name,
      isDefault: existingCount === 0,
      stages: {
        create: [{ name: "New Lead", order: 0, isWon: false, isLost: false, requiredFieldKeys: [] }],
      },
    },
    include: { stages: true },
  });

  await writeAudit({
    workspaceId,
    actor: { id: user.id, name: user.name },
    eventType: "config_change",
    targetType: "pipeline",
    targetId: pipeline.id,
    summary: `Pipeline “${pipeline.name}” created`,
  });

  res.status(201).json(toPipeline(pipeline));
});

pipelinesRouter.patch("/pipelines/:id", requirePermission("crm.edit"), async (req, res) => {
  const { workspaceId } = authOf(req);
  const id = parseIdParam(req);
  const existing = await prisma.pipeline.findFirst({ where: { id, workspaceId } });
  if (!existing) {
    throw ApiError.notFound("Pipeline not found");
  }
  const input = parseBody(updatePipelineSchema, req);

  const pipeline = await prisma.pipeline.update({
    where: { id: existing.id },
    data: { ...(input.name === undefined ? {} : { name: input.name }) },
    include: { stages: true },
  });

  res.json(toPipeline(pipeline));
});

pipelinesRouter.delete("/pipelines/:id", requirePermission("crm.edit"), async (req, res) => {
  const { workspaceId, user } = authOf(req);
  const id = parseIdParam(req);
  const pipeline = await prisma.pipeline.findFirst({ where: { id, workspaceId } });
  if (!pipeline) {
    throw ApiError.notFound("Pipeline not found");
  }
  if (pipeline.isDefault) {
    throw ApiError.conflict("The default pipeline cannot be deleted");
  }
  const count = await prisma.opportunity.count({ where: { pipelineId: pipeline.id } });
  if (count > 0) {
    throw ApiError.conflict(`Move or delete the ${count} opportunities in this pipeline first`);
  }

  await prisma.pipeline.delete({ where: { id: pipeline.id } });

  await writeAudit({
    workspaceId,
    actor: { id: user.id, name: user.name },
    eventType: "config_change",
    targetType: "pipeline",
    targetId: pipeline.id,
    summary: `Pipeline “${pipeline.name}” deleted`,
  });

  res.status(204).end();
});

pipelinesRouter.post("/pipelines/:id/stages", requirePermission("crm.edit"), async (req, res) => {
  const { workspaceId, user } = authOf(req);
  const id = parseIdParam(req);
  const pipeline = await prisma.pipeline.findFirst({
    where: { id, workspaceId },
    include: { stages: true },
  });
  if (!pipeline) {
    throw ApiError.notFound("Pipeline not found");
  }
  const input = parseBody(createStageSchema, req);

  if (input.isWon && pipeline.stages.some((stage) => stage.isWon)) {
    throw ApiError.conflict("This pipeline already has a Won stage");
  }
  if (input.isLost && pipeline.stages.some((stage) => stage.isLost)) {
    throw ApiError.conflict("This pipeline already has a Lost stage");
  }

  const order = Math.max(-1, ...pipeline.stages.map((stage) => stage.order)) + 1;
  const stage = await prisma.stage.create({
    data: {
      pipelineId: pipeline.id,
      name: input.name,
      order,
      isWon: input.isWon,
      isLost: input.isLost,
      color: input.color ?? null,
      requiredFieldKeys: input.requiredFieldKeys,
    },
  });

  await writeAudit({
    workspaceId,
    actor: { id: user.id, name: user.name },
    eventType: "config_change",
    targetType: "pipeline",
    targetId: pipeline.id,
    summary: `Stage “${stage.name}” added to ${pipeline.name}`,
  });

  res.status(201).json(toStage(stage));
});

pipelinesRouter.patch("/pipelines/:id/stages/order", requirePermission("crm.edit"), async (req, res) => {
  const { workspaceId } = authOf(req);
  const id = parseIdParam(req);
  const pipeline = await prisma.pipeline.findFirst({
    where: { id, workspaceId },
    include: { stages: true },
  });
  if (!pipeline) {
    throw ApiError.notFound("Pipeline not found");
  }
  const input = parseBody(reorderStagesSchema, req);

  const known = new Set(pipeline.stages.map((stage) => stage.id));
  if (input.stageIds.length !== pipeline.stages.length) {
    throw ApiError.validationFailed("stageIds must include every stage exactly once");
  }
  for (const stageId of input.stageIds) {
    if (!known.has(stageId)) {
      throw ApiError.validationFailed("Unknown stage id in order");
    }
  }

  await prisma.$transaction(
    input.stageIds.map((stageId, index) =>
      prisma.stage.update({ where: { id: stageId }, data: { order: index } }),
    ),
  );

  const stages = await prisma.stage.findMany({
    where: { pipelineId: pipeline.id },
    orderBy: { order: "asc" },
  });
  res.json(stages.map(toStage));
});

pipelinesRouter.patch("/stages/:id", requirePermission("crm.edit"), async (req, res) => {
  const { workspaceId } = authOf(req);
  const id = parseIdParam(req);
  const stage = await prisma.stage.findFirst({
    where: { id, pipeline: { workspaceId } },
    include: { pipeline: { include: { stages: true } } },
  });
  if (!stage) {
    throw ApiError.notFound("Stage not found");
  }
  const input = parseBody(updateStageSchema, req);

  if (
    input.isWon &&
    stage.pipeline.stages.some((candidate) => candidate.isWon && candidate.id !== stage.id)
  ) {
    throw ApiError.conflict("This pipeline already has a Won stage");
  }
  if (
    input.isLost &&
    stage.pipeline.stages.some((candidate) => candidate.isLost && candidate.id !== stage.id)
  ) {
    throw ApiError.conflict("This pipeline already has a Lost stage");
  }

  const updated = await prisma.stage.update({
    where: { id: stage.id },
    data: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.isWon === undefined ? {} : { isWon: input.isWon }),
      ...(input.isLost === undefined ? {} : { isLost: input.isLost }),
      ...(input.color === undefined ? {} : { color: input.color }),
      ...(input.requiredFieldKeys === undefined ? {} : { requiredFieldKeys: input.requiredFieldKeys }),
    },
  });

  res.json(toStage(updated));
});

pipelinesRouter.delete("/stages/:id", requirePermission("crm.edit"), async (req, res) => {
  const { workspaceId, user } = authOf(req);
  const id = parseIdParam(req);
  const query = parseQuery(deleteStageSchema, req);
  const stage = await prisma.stage.findFirst({
    where: { id, pipeline: { workspaceId } },
    include: { pipeline: { include: { stages: true } } },
  });
  if (!stage) {
    throw ApiError.notFound("Stage not found");
  }
  if (stage.pipeline.stages.length <= 1) {
    throw ApiError.conflict("A pipeline needs at least one stage");
  }

  const affected = await prisma.opportunity.count({ where: { stageId: stage.id } });
  if (affected > 0) {
    if (!query.moveToStageId) {
      throw ApiError.conflict(
        `Stage has ${affected} opportunities. Provide moveToStageId to move them safely.`,
        { opportunityCount: affected },
      );
    }
    const target = await prisma.stage.findFirst({
      where: { id: query.moveToStageId, pipelineId: stage.pipelineId },
    });
    if (!target) {
      throw ApiError.validationFailed("moveToStageId must be a stage in the same pipeline");
    }
    await prisma.opportunity.updateMany({
      where: { stageId: stage.id },
      data: { stageId: target.id, stageEnteredAt: new Date() },
    });
  }

  await prisma.stage.delete({ where: { id: stage.id } });

  await writeAudit({
    workspaceId,
    actor: { id: user.id, name: user.name },
    eventType: "config_change",
    targetType: "pipeline",
    targetId: stage.pipelineId,
    summary: `Stage “${stage.name}” deleted${affected > 0 ? ` (${affected} opportunities moved)` : ""}`,
  });

  res.status(204).end();
});
