import { HttpResponse, http } from "msw";
import {
  CUSTOM_FIELD_ENTITIES,
  createCustomFieldSchema,
  createPipelineSchema,
  createStageSchema,
  deleteStageSchema,
  reorderStagesSchema,
  updateCustomFieldSchema,
  updatePipelineSchema,
  updateStageSchema,
} from "@leadflow/shared";
import { env } from "../../lib/env";
import {
  errorResponse,
  getDb,
  latency,
  pushAudit,
  readBody,
  readQuery,
  requireAuth,
  saveDb,
  stageById,
} from "../store";

function nowIso(): string {
  return new Date().toISOString();
}

export const pipelineHandlers = [
  http.get(`${env.apiUrl}/pipelines`, async () => {
    const auth = requireAuth("crm.view");
    if (auth.response) return auth.response;
    await latency();
    const pipelines = getDb().pipelines.map((pipeline) => ({
      ...pipeline,
      stages: [...pipeline.stages].sort((a, b) => a.order - b.order),
    }));
    return HttpResponse.json(pipelines);
  }),

  http.post(`${env.apiUrl}/pipelines`, async ({ request }) => {
    const auth = requireAuth("crm.edit");
    if (auth.response) return auth.response;
    const body = await readBody(request, createPipelineSchema);
    if (!body.ok) return body.response;
    await latency();
    const db = getDb();
    const pipelineId = crypto.randomUUID();
    const pipeline = {
      id: pipelineId,
      workspaceId: db.workspace.id,
      name: body.data.name,
      isDefault: false,
      stages: [
        {
          id: crypto.randomUUID(),
          pipelineId,
          name: "New Lead",
          order: 0,
          isWon: false,
          isLost: false,
          color: null,
          requiredFieldKeys: [],
          createdAt: nowIso(),
          updatedAt: nowIso(),
        },
      ],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.pipelines.push(pipeline);
    pushAudit({
      actorId: auth.user.id,
      actorType: "user",
      actorName: auth.user.name,
      eventType: "config_change",
      targetType: "pipeline",
      targetId: pipeline.id,
      summary: `Pipeline "${pipeline.name}" created`,
    });
    saveDb();
    return HttpResponse.json(pipeline, { status: 201 });
  }),

  http.patch(`${env.apiUrl}/pipelines/:id`, async ({ request, params }) => {
    const auth = requireAuth("crm.edit");
    if (auth.response) return auth.response;
    const body = await readBody(request, updatePipelineSchema);
    if (!body.ok) return body.response;
    await latency();
    const pipeline = getDb().pipelines.find((candidate) => candidate.id === params.id);
    if (!pipeline) return errorResponse("not_found", "Pipeline not found");
    if (body.data.name !== undefined) pipeline.name = body.data.name;
    pipeline.updatedAt = nowIso();
    saveDb();
    return HttpResponse.json(pipeline);
  }),

  http.delete(`${env.apiUrl}/pipelines/:id`, async ({ params }) => {
    const auth = requireAuth("crm.edit");
    if (auth.response) return auth.response;
    await latency();
    const db = getDb();
    const pipeline = db.pipelines.find((candidate) => candidate.id === params.id);
    if (!pipeline) return errorResponse("not_found", "Pipeline not found");
    if (pipeline.isDefault) {
      return errorResponse("conflict", "The default pipeline cannot be deleted");
    }
    const count = db.opportunities.filter(
      (opportunity) => opportunity.pipelineId === pipeline.id,
    ).length;
    if (count > 0) {
      return errorResponse("conflict", `Move or delete the ${count} opportunities in this pipeline first`);
    }
    db.pipelines = db.pipelines.filter((candidate) => candidate.id !== pipeline.id);
    pushAudit({
      actorId: auth.user.id,
      actorType: "user",
      actorName: auth.user.name,
      eventType: "config_change",
      targetType: "pipeline",
      targetId: pipeline.id,
      summary: `Pipeline "${pipeline.name}" deleted`,
    });
    saveDb();
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${env.apiUrl}/pipelines/:id/stages`, async ({ request, params }) => {
    const auth = requireAuth("crm.edit");
    if (auth.response) return auth.response;
    const body = await readBody(request, createStageSchema);
    if (!body.ok) return body.response;
    await latency();
    const pipeline = getDb().pipelines.find((candidate) => candidate.id === params.id);
    if (!pipeline) return errorResponse("not_found", "Pipeline not found");
    if (body.data.isWon && pipeline.stages.some((stage) => stage.isWon)) {
      return errorResponse("conflict", "This pipeline already has a Won stage");
    }
    if (body.data.isLost && pipeline.stages.some((stage) => stage.isLost)) {
      return errorResponse("conflict", "This pipeline already has a Lost stage");
    }
    const order = Math.max(-1, ...pipeline.stages.map((stage) => stage.order)) + 1;
    const stage = {
      id: crypto.randomUUID(),
      pipelineId: pipeline.id,
      name: body.data.name,
      order,
      isWon: body.data.isWon,
      isLost: body.data.isLost,
      color: body.data.color ?? null,
      requiredFieldKeys: body.data.requiredFieldKeys,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    pipeline.stages.push(stage);
    pushAudit({
      actorId: auth.user.id,
      actorType: "user",
      actorName: auth.user.name,
      eventType: "config_change",
      targetType: "pipeline",
      targetId: pipeline.id,
      summary: `Stage "${stage.name}" added to ${pipeline.name}`,
    });
    saveDb();
    return HttpResponse.json(stage, { status: 201 });
  }),

  http.patch(`${env.apiUrl}/pipelines/:id/stages/order`, async ({ request, params }) => {
    const auth = requireAuth("crm.edit");
    if (auth.response) return auth.response;
    const body = await readBody(request, reorderStagesSchema);
    if (!body.ok) return body.response;
    await latency();
    const pipeline = getDb().pipelines.find((candidate) => candidate.id === params.id);
    if (!pipeline) return errorResponse("not_found", "Pipeline not found");
    const stageIds = new Set(pipeline.stages.map((stage) => stage.id));
    if (body.data.stageIds.length !== pipeline.stages.length) {
      return errorResponse("validation_failed", "stageIds must include every stage exactly once");
    }
    for (const id of body.data.stageIds) {
      if (!stageIds.has(id)) return errorResponse("validation_failed", "Unknown stage id in order");
    }
    body.data.stageIds.forEach((id, index) => {
      const stage = pipeline.stages.find((candidate) => candidate.id === id);
      if (stage) {
        stage.order = index;
        stage.updatedAt = nowIso();
      }
    });
    saveDb();
    return HttpResponse.json([...pipeline.stages].sort((a, b) => a.order - b.order));
  }),

  http.patch(`${env.apiUrl}/stages/:id`, async ({ request, params }) => {
    const auth = requireAuth("crm.edit");
    if (auth.response) return auth.response;
    const body = await readBody(request, updateStageSchema);
    if (!body.ok) return body.response;
    await latency();
    const stage = stageById(String(params.id));
    if (!stage) return errorResponse("not_found", "Stage not found");
    const pipeline = getDb().pipelines.find((candidate) => candidate.id === stage.pipelineId);
    if (body.data.isWon && pipeline?.stages.some((candidate) => candidate.isWon && candidate.id !== stage.id)) {
      return errorResponse("conflict", "This pipeline already has a Won stage");
    }
    if (body.data.isLost && pipeline?.stages.some((candidate) => candidate.isLost && candidate.id !== stage.id)) {
      return errorResponse("conflict", "This pipeline already has a Lost stage");
    }
    if (body.data.name !== undefined) stage.name = body.data.name;
    if (body.data.isWon !== undefined) stage.isWon = body.data.isWon;
    if (body.data.isLost !== undefined) stage.isLost = body.data.isLost;
    if (body.data.color !== undefined) stage.color = body.data.color;
    if (body.data.requiredFieldKeys !== undefined) stage.requiredFieldKeys = body.data.requiredFieldKeys;
    stage.updatedAt = nowIso();
    saveDb();
    return HttpResponse.json(stage);
  }),

  http.delete(`${env.apiUrl}/stages/:id`, async ({ request, params }) => {
    const auth = requireAuth("crm.edit");
    if (auth.response) return auth.response;
    const query = readQuery(request, deleteStageSchema);
    if (!query.ok) return query.response;
    await latency();
    const db = getDb();
    const stage = stageById(String(params.id));
    if (!stage) return errorResponse("not_found", "Stage not found");
    const pipeline = db.pipelines.find((candidate) => candidate.id === stage.pipelineId);
    if (!pipeline) return errorResponse("not_found", "Pipeline not found");
    if (pipeline.stages.length <= 1) {
      return errorResponse("conflict", "A pipeline needs at least one stage");
    }
    const affected = db.opportunities.filter((opportunity) => opportunity.stageId === stage.id);
    if (affected.length > 0) {
      if (!query.data.moveToStageId) {
        return errorResponse(
          "conflict",
          `Stage has ${affected.length} opportunities. Provide moveToStageId to move them safely.`,
          { opportunityCount: affected.length },
        );
      }
      const target = stageById(query.data.moveToStageId);
      if (!target || target.pipelineId !== stage.pipelineId) {
        return errorResponse("validation_failed", "moveToStageId must be a stage in the same pipeline");
      }
      for (const opportunity of affected) {
        opportunity.stageId = target.id;
        opportunity.stageEnteredAt = nowIso();
        opportunity.updatedAt = nowIso();
      }
    }
    pipeline.stages = pipeline.stages.filter((candidate) => candidate.id !== stage.id);
    pushAudit({
      actorId: auth.user.id,
      actorType: "user",
      actorName: auth.user.name,
      eventType: "config_change",
      targetType: "pipeline",
      targetId: pipeline.id,
      summary: `Stage "${stage.name}" deleted${affected.length > 0 ? ` (${affected.length} opportunities moved)` : ""}`,
    });
    saveDb();
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${env.apiUrl}/custom-fields`, async ({ request }) => {
    const auth = requireAuth("crm.view");
    if (auth.response) return auth.response;
    const url = new URL(request.url);
    const entity = url.searchParams.get("entity");
    if (entity && !CUSTOM_FIELD_ENTITIES.includes(entity as (typeof CUSTOM_FIELD_ENTITIES)[number])) {
      return errorResponse("validation_failed", "Unknown entity filter");
    }
    await latency();
    const fields = getDb()
      .customFields.filter((field) => !entity || field.entity === entity)
      .sort((a, b) => a.order - b.order);
    return HttpResponse.json(fields);
  }),

  http.post(`${env.apiUrl}/custom-fields`, async ({ request }) => {
    const auth = requireAuth("crm.edit");
    if (auth.response) return auth.response;
    const body = await readBody(request, createCustomFieldSchema);
    if (!body.ok) return body.response;
    await latency();
    const db = getDb();
    const duplicate = db.customFields.find(
      (field) =>
        field.entity === body.data.entity &&
        field.key === body.data.key &&
        (field.pipelineId ?? null) === (body.data.pipelineId ?? null),
    );
    if (duplicate) return errorResponse("conflict", "A field with this key already exists for this entity");
    const field = {
      id: crypto.randomUUID(),
      workspaceId: db.workspace.id,
      entity: body.data.entity,
      pipelineId: body.data.pipelineId ?? null,
      key: body.data.key,
      label: body.data.label,
      type: body.data.type,
      options: body.data.options,
      required: body.data.required,
      order: body.data.order,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.customFields.push(field);
    pushAudit({
      actorId: auth.user.id,
      actorType: "user",
      actorName: auth.user.name,
      eventType: "config_change",
      targetType: "custom_field",
      targetId: field.id,
      summary: `Custom field "${field.label}" created`,
    });
    saveDb();
    return HttpResponse.json(field, { status: 201 });
  }),

  http.patch(`${env.apiUrl}/custom-fields/:id`, async ({ request, params }) => {
    const auth = requireAuth("crm.edit");
    if (auth.response) return auth.response;
    const body = await readBody(request, updateCustomFieldSchema);
    if (!body.ok) return body.response;
    await latency();
    const field = getDb().customFields.find((candidate) => candidate.id === params.id);
    if (!field) return errorResponse("not_found", "Custom field not found");
    if (field.type !== "dropdown" && body.data.options && body.data.options.length > 0) {
      return errorResponse("validation_failed", "Options are only allowed for dropdown fields");
    }
    if (field.type === "dropdown" && body.data.options && body.data.options.length === 0) {
      return errorResponse("validation_failed", "Dropdown fields need at least one option");
    }
    if (body.data.label !== undefined) field.label = body.data.label;
    if (body.data.options !== undefined) field.options = body.data.options;
    if (body.data.required !== undefined) field.required = body.data.required;
    if (body.data.order !== undefined) field.order = body.data.order;
    field.updatedAt = nowIso();
    saveDb();
    return HttpResponse.json(field);
  }),

  http.delete(`${env.apiUrl}/custom-fields/:id`, async ({ params }) => {
    const auth = requireAuth("crm.edit");
    if (auth.response) return auth.response;
    await latency();
    const db = getDb();
    const field = db.customFields.find((candidate) => candidate.id === params.id);
    if (!field) return errorResponse("not_found", "Custom field not found");
    db.customFields = db.customFields.filter((candidate) => candidate.id !== field.id);
    for (const contact of db.contacts) delete contact.customFields[field.key];
    for (const opportunity of db.opportunities) delete opportunity.customFields[field.key];
    for (const pipeline of db.pipelines) {
      for (const stage of pipeline.stages) {
        stage.requiredFieldKeys = stage.requiredFieldKeys.filter((key) => key !== field.key);
      }
    }
    pushAudit({
      actorId: auth.user.id,
      actorType: "user",
      actorName: auth.user.name,
      eventType: "config_change",
      targetType: "custom_field",
      targetId: field.id,
      summary: `Custom field "${field.label}" deleted`,
    });
    saveDb();
    return new HttpResponse(null, { status: 204 });
  }),
];
