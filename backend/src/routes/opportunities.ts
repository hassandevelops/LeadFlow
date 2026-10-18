import {
  createNoteSchema,
  createOpportunitySchema,
  moveStageSchema,
  opportunityFilterSchema,
  updateOpportunitySchema,
  type OpportunityFilter,
} from "@leadflow/shared";
import type { Prisma } from "@prisma/client";
import type { User } from "@prisma/client";
import { Router, type Request } from "express";
import { canViewValue, actorOf } from "../lib/access";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { parseSort } from "../lib/query";
import { toActivity, toOpportunity } from "../lib/serialize";
import { parseBody, parseIdParam, parseQuery } from "../lib/validation";
import { authOf, requirePermission } from "../middleware/auth";
import { writeAudit } from "../services/audit";
import { assignLeadOwner, getAssignmentRules, touchLead } from "../services/assignment";
import { definitionsFor, mergeCustomFieldValues, missingRequiredKeys, validateCustomFieldValues } from "../services/custom-fields";
import { createLeadOpportunity } from "../services/lead-intake";

export const opportunitiesRouter = Router();

const SORT_FIELDS = [
  "createdAt",
  "updatedAt",
  "title",
  "value",
  "stageEnteredAt",
  "lastActionAt",
  "assignedAt",
  "acknowledgedAt",
] as const;

function cfFiltersFromQuery(req: Request): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.query)) {
    if (key.startsWith("cf.") && typeof value === "string") {
      result[key.slice(3)] = value;
    }
  }
  return result;
}

function coerceCfValue(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value.trim() !== "" && value.trim() !== "0" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  if (value === "0") return 0;
  return value;
}

function parseDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw ApiError.validationFailed(`${field} must be an ISO date`);
  }
  return date;
}

function buildWhere(
  workspaceId: string,
  filter: OpportunityFilter,
  req: Request,
): Prisma.OpportunityWhereInput {
  const customFilters: Prisma.OpportunityWhereInput[] = [];
  for (const [key, value] of Object.entries(cfFiltersFromQuery(req))) {
    if (value === "") continue;
    customFilters.push({ customFields: { path: [key], equals: coerceCfValue(value) as Prisma.InputJsonValue } });
  }

  return {
    workspaceId,
    ...(filter.pipelineId ? { pipelineId: filter.pipelineId } : {}),
    ...(filter.stageId ? { stageId: filter.stageId } : {}),
    ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
    ...(filter.tag ? { tags: { array_contains: filter.tag } } : {}),
    ...(filter.source ? { source: filter.source } : {}),
    ...(filter.createdFrom || filter.createdTo
      ? {
          createdAt: {
            ...(filter.createdFrom ? { gte: parseDate(filter.createdFrom, "createdFrom") } : {}),
            ...(filter.createdTo ? { lte: parseDate(filter.createdTo, "createdTo") } : {}),
          },
        }
      : {}),
    ...(filter.q
      ? {
          OR: [
            { title: { contains: filter.q, mode: "insensitive" as const } },
            { contact: { name: { contains: filter.q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
    ...(customFilters.length ? { AND: customFilters } : {}),
  };
}

async function findOpportunity(workspaceId: string, id: string) {
  const opportunity = await prisma.opportunity.findFirst({ where: { id, workspaceId } });
  if (!opportunity) {
    throw ApiError.notFound("Opportunity not found");
  }
  return opportunity;
}

opportunitiesRouter.get("/opportunities/export", requirePermission("crm.export"), async (req, res) => {
  const auth = authOf(req);
  const { workspaceId } = auth;
  const filter = parseQuery(opportunityFilterSchema, req);
  const where = buildWhere(workspaceId, filter, req);
  const canSeeValue = canViewValue(auth);

  const opportunities = await prisma.opportunity.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      contact: { select: { name: true } },
      company: { select: { name: true } },
      pipeline: { select: { name: true } },
      stage: { select: { name: true } },
      owner: { select: { name: true } },
    },
  });

  const csvCell = (value: string): string =>
    value.includes(",") || value.includes('"') || value.includes("\n")
      ? `"${value.replaceAll('"', '""')}"`
      : value;

  const header = [
    "id",
    "title",
    "contact",
    "company",
    "pipeline",
    "stage",
    "owner",
    "source",
    "tags",
    "currency",
    ...(canSeeValue ? ["value"] : []),
    "createdAt",
  ].join(",");

  const rows = opportunities.map((opportunity) => {
    const cells = [
      opportunity.id,
      csvCell(opportunity.title),
      csvCell(opportunity.contact?.name ?? ""),
      csvCell(opportunity.company?.name ?? ""),
      csvCell(opportunity.pipeline?.name ?? ""),
      csvCell(opportunity.stage?.name ?? ""),
      csvCell(opportunity.owner?.name ?? ""),
      opportunity.source,
      csvCell(((opportunity.tags as string[]) ?? []).join(";")),
      opportunity.currency,
      ...(canSeeValue ? [String(opportunity.value === null ? "" : Number(opportunity.value))] : []),
      opportunity.createdAt.toISOString(),
    ];
    return cells.join(",");
  });

  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", 'attachment; filename="opportunities.csv"');
  res.send([header, ...rows].join("\n"));
});

opportunitiesRouter.get("/opportunities", requirePermission("crm.view"), async (req, res) => {
  const auth = authOf(req);
  const { workspaceId } = auth;
  const filter = parseQuery(opportunityFilterSchema, req);
  const orderBy = filter.sort
    ? parseSort(filter.sort, SORT_FIELDS, "createdAt")
    : { createdAt: "desc" as const };
  const where = buildWhere(workspaceId, filter, req);

  const [rows, total] = await prisma.$transaction([
    prisma.opportunity.findMany({
      where,
      orderBy,
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
    }),
    prisma.opportunity.count({ where }),
  ]);

  res.json({
    data: rows.map((row) => toOpportunity(row, canViewValue(auth))),
    page: filter.page,
    pageSize: filter.pageSize,
    total,
  });
});

opportunitiesRouter.post("/opportunities", requirePermission("crm.create"), async (req, res) => {
  const auth = authOf(req);
  const { workspaceId } = auth;
  const input = parseBody(createOpportunitySchema, req);

  const contact = await prisma.contact.findFirst({
    where: { id: input.contactId, workspaceId },
  });
  if (!contact) {
    throw ApiError.notFound("Contact not found");
  }

  if (input.companyId) {
    const company = await prisma.company.findFirst({ where: { id: input.companyId, workspaceId } });
    if (!company) {
      throw ApiError.validationFailed("Company not found in this workspace", [
        { path: "companyId", message: "Unknown company" },
      ]);
    }
  }

  const opportunity = await createLeadOpportunity({
    workspaceId,
    actor: actorOf(auth),
    contactId: contact.id,
    companyId: input.companyId ?? contact.companyId,
    title: input.title,
    value: input.value ?? null,
    currency: input.currency,
    source: input.source,
    pipelineId: input.pipelineId ?? null,
    stageId: input.stageId ?? null,
    ownerId: input.ownerId ?? null,
    tags: input.tags,
    customFields: input.customFields,
  });

  res.status(201).json(toOpportunity(opportunity, canViewValue(auth)));
});

opportunitiesRouter.get("/opportunities/:id", requirePermission("crm.view"), async (req, res) => {
  const auth = authOf(req);
  const opportunity = await findOpportunity(auth.workspaceId, parseIdParam(req));
  res.json(toOpportunity(opportunity, canViewValue(auth)));
});

opportunitiesRouter.patch("/opportunities/:id", requirePermission("crm.edit"), async (req, res) => {
  const auth = authOf(req);
  const { workspaceId } = auth;
  const opportunity = await findOpportunity(workspaceId, parseIdParam(req));
  const input = parseBody(updateOpportunitySchema, req);

  if (input.companyId) {
    const company = await prisma.company.findFirst({ where: { id: input.companyId, workspaceId } });
    if (!company) {
      throw ApiError.validationFailed("Company not found in this workspace", [
        { path: "companyId", message: "Unknown company" },
      ]);
    }
  }

  const changes: string[] = [];
  let customFields: Record<string, unknown> | undefined;
  if (input.customFields) {
    const definitions = await definitionsFor(workspaceId, "opportunity", opportunity.pipelineId);
    const validated = validateCustomFieldValues(definitions, input.customFields, { partial: true });
    customFields = mergeCustomFieldValues(
      (opportunity.customFields as Record<string, unknown>) ?? {},
      validated,
    );
    changes.push("customFields");
  }
  if (input.title !== undefined) changes.push("title");
  if (input.value !== undefined) changes.push("value");
  if (input.currency !== undefined) changes.push("currency");
  if (input.companyId !== undefined) changes.push("companyId");
  if (input.tags !== undefined) changes.push("tags");

  const updateData: Prisma.OpportunityUncheckedUpdateInput = {
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.companyId === undefined ? {} : { companyId: input.companyId ?? null }),
    ...(input.value === undefined ? {} : { value: input.value }),
    ...(input.currency === undefined ? {} : { currency: input.currency }),
    ...(input.tags === undefined ? {} : { tags: input.tags }),
    ...(customFields === undefined ? {} : { customFields: customFields as Prisma.InputJsonValue }),
  };

  let updated = await prisma.opportunity.update({
    where: { id: opportunity.id },
    data: updateData,
  });

  if (input.ownerId !== undefined && input.ownerId !== opportunity.ownerId) {
    const rules = await getAssignmentRules(workspaceId);
    let target: User | null = null;
    if (input.ownerId) {
      target = await prisma.user.findFirst({ where: { id: input.ownerId, workspaceId } });
      if (!target) {
        throw ApiError.validationFailed("Owner not found in this workspace", [
          { path: "ownerId", message: "Unknown user" },
        ]);
      }
    }
    const assigned = await assignLeadOwner({
      leadId: opportunity.id,
      rules,
      owner: target,
      actor: actorOf(auth),
      kind: "manual",
    });
    if (assigned) {
      updated = assigned;
    }
  }

  if (changes.length > 0) {
    await prisma.activity.create({
      data: {
        workspaceId,
        entityType: "opportunity",
        entityId: opportunity.id,
        type: "field_edit",
        actorId: auth.user.id,
        actorName: auth.user.name,
        summary: `Updated: ${changes.join(", ")}`,
        meta: { changed: changes },
      },
    });
    await touchLead(workspaceId, opportunity.id);
    updated = await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunity.id } });
  }

  res.json(toOpportunity(updated, canViewValue(auth)));
});

opportunitiesRouter.patch("/opportunities/:id/stage", requirePermission("crm.edit"), async (req, res) => {
  const auth = authOf(req);
  const { workspaceId } = auth;
  const opportunity = await findOpportunity(workspaceId, parseIdParam(req));
  const input = parseBody(moveStageSchema, req);

  const stage = await prisma.stage.findFirst({
    where: { id: input.stageId, pipelineId: opportunity.pipelineId },
  });
  if (!stage) {
    throw ApiError.validationFailed("Stage does not belong to this opportunity's pipeline", [
      { path: "stageId", message: "Unknown stage for this pipeline" },
    ]);
  }

  const requiredKeys = (stage.requiredFieldKeys as string[]) ?? [];
  const missing = missingRequiredKeys(
    opportunity,
    (opportunity.customFields as Record<string, unknown>) ?? {},
    requiredKeys,
  );
  if (missing.length > 0) {
    throw ApiError.conflict("Required fields must be filled before moving to this stage", {
      reason: "required_fields_missing",
      missingFields: missing,
    });
  }

  const updated = await prisma.opportunity.update({
    where: { id: opportunity.id },
    data: { stageId: stage.id, stageEnteredAt: new Date() },
  });

  await prisma.activity.create({
    data: {
      workspaceId,
      entityType: "opportunity",
      entityId: opportunity.id,
      type: "stage_change",
      actorId: auth.user.id,
      actorName: auth.user.name,
      summary: `Moved to ${stage.name}`,
    },
  });

  await touchLead(workspaceId, opportunity.id);

  const final = await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunity.id } });
  void updated;
  res.json(toOpportunity(final, canViewValue(auth)));
});

opportunitiesRouter.post("/opportunities/:id/notes", requirePermission("crm.edit"), async (req, res) => {
  const auth = authOf(req);
  const { workspaceId } = auth;
  const opportunity = await findOpportunity(workspaceId, parseIdParam(req));
  const input = parseBody(createNoteSchema, req);

  const activity = await prisma.activity.create({
    data: {
      workspaceId,
      entityType: "opportunity",
      entityId: opportunity.id,
      type: "note",
      actorId: auth.user.id,
      actorName: auth.user.name,
      summary: input.body,
    },
  });

  await touchLead(workspaceId, opportunity.id);

  res.status(201).json(toActivity(activity));
});

opportunitiesRouter.delete("/opportunities/:id", requirePermission("crm.delete"), async (req, res) => {
  const auth = authOf(req);
  const { workspaceId } = auth;
  const opportunity = await findOpportunity(workspaceId, parseIdParam(req));

  await prisma.opportunity.delete({ where: { id: opportunity.id } });

  await prisma.activity.create({
    data: {
      workspaceId,
      entityType: "opportunity",
      entityId: opportunity.id,
      type: "deletion",
      actorId: auth.user.id,
      actorName: auth.user.name,
      summary: `Lead “${opportunity.title}” deleted`,
    },
  });

  await writeAudit({
    workspaceId,
    actor: actorOf(auth),
    eventType: "deletion",
    targetType: "opportunity",
    targetId: opportunity.id,
    summary: `Lead “${opportunity.title}” deleted`,
    before: {
      title: opportunity.title,
      contactId: opportunity.contactId,
      stageId: opportunity.stageId,
      ownerId: opportunity.ownerId,
    },
  });

  res.status(204).end();
});
