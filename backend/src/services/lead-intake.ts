import type { CreateLeadInput, LeadSource } from "@leadflow/shared";
import type { Opportunity, Opportunity as OpportunityRow, Prisma, User } from "@prisma/client";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { emitToWorkspace } from "../realtime/io";
import { assignLeadOwner, getAssignmentRules, pickNextOwner } from "./assignment";
import { definitionsFor, validateCustomFieldValues } from "./custom-fields";
import { phoneDigits } from "../lib/phone";

export interface ResolvedPipeline {
  pipelineId: string;
  stageId: string;
}

export async function resolvePipelineAndStage(
  workspaceId: string,
  pipelineId?: string | null,
  stageId?: string | null,
): Promise<ResolvedPipeline> {
  let pipeline = pipelineId
    ? await prisma.pipeline.findFirst({
        where: { id: pipelineId, workspaceId },
        include: { stages: true },
      })
    : null;

  if (!pipeline) {
    pipeline = await prisma.pipeline.findFirst({
      where: { workspaceId, isDefault: true },
      include: { stages: true },
    });
  }
  if (!pipeline) {
    pipeline = await prisma.pipeline.findFirst({
      where: { workspaceId },
      include: { stages: true },
      orderBy: { createdAt: "asc" },
    });
  }
  if (!pipeline) {
    throw ApiError.conflict("No pipeline available", { reason: "no_pipeline" });
  }

  const stages = [...pipeline.stages].sort((a, b) => a.order - b.order);
  const stage = stageId ? stages.find((candidate) => candidate.id === stageId) : stages[0];
  if (!stage) {
    throw ApiError.conflict("Pipeline has no stages", { reason: "no_stages" });
  }

  return { pipelineId: pipeline.id, stageId: stage.id };
}

export async function findContactByEmailOrPhone(
  workspaceId: string,
  email?: string | null,
  phone?: string | null,
): Promise<{ id: string; ownerId: string | null } | null> {
  if (email) {
    const byEmail = await prisma.contact.findFirst({
      where: { workspaceId, email },
      select: { id: true, ownerId: true },
    });
    if (byEmail) {
      return byEmail;
    }
  }
  if (phone) {
    const digits = phoneDigits(phone);
    if (digits.length >= 7) {
      const rows = await prisma.$queryRaw<{ id: string; ownerId: string | null }[]>`
        SELECT id, "ownerId" FROM "Contact"
        WHERE "workspaceId" = ${workspaceId}::uuid
          AND phone IS NOT NULL
          AND regexp_replace(phone, '[^0-9]', '', 'g') = ${digits}
        LIMIT 1
      `;
      const byPhone = rows[0];
      if (byPhone) {
        return byPhone;
      }
    }
  }
  return null;
}

export async function createLeadOpportunity(params: {
  workspaceId: string;
  actor: { id: string; name: string } | null;
  contactId: string;
  companyId?: string | null;
  title: string;
  value?: number | null;
  currency?: string;
  source: LeadSource;
  pipelineId?: string | null;
  stageId?: string | null;
  ownerId?: string | null;
  tags?: string[];
  customFields?: Record<string, unknown>;
  note?: string;
}): Promise<OpportunityRow> {
  const { pipelineId, stageId } = await resolvePipelineAndStage(
    params.workspaceId,
    params.pipelineId,
    params.stageId,
  );

  const definitions = await definitionsFor(params.workspaceId, "opportunity", pipelineId);
  const customFields = params.customFields
    ? validateCustomFieldValues(definitions, params.customFields, { partial: false })
    : {};

  const rules = await getAssignmentRules(params.workspaceId);
  let owner: User | null = null;
  if (params.ownerId) {
    owner = await prisma.user.findFirst({
      where: { id: params.ownerId, workspaceId: params.workspaceId },
    });
    if (!owner) {
      throw ApiError.validationFailed("Owner not found in this workspace", [
        { path: "ownerId", message: "Unknown user" },
      ]);
    }
  } else {
    owner = await pickNextOwner(params.workspaceId, rules);
  }

  const opportunity = await prisma.opportunity.create({
    data: {
      workspaceId: params.workspaceId,
      title: params.title,
      contactId: params.contactId,
      companyId: params.companyId ?? null,
      pipelineId,
      stageId,
      value: params.value ?? null,
      currency: params.currency ?? "usd",
      ownerId: null,
      source: params.source,
      tags: params.tags ?? [],
      customFields: customFields as Prisma.InputJsonValue,
      stageEnteredAt: new Date(),
    },
  });

  emitToWorkspace(params.workspaceId, "lead.created", {
    workspaceId: params.workspaceId,
    at: new Date().toISOString(),
    leadId: opportunity.id,
    source: opportunity.source,
  });

  await prisma.activity.create({
    data: {
      workspaceId: params.workspaceId,
      entityType: "opportunity",
      entityId: opportunity.id,
      type: "created",
      actorId: params.actor?.id ?? null,
      actorName: params.actor?.name ?? "System",
      summary: "Lead created",
    },
  });

  if (owner) {
    await assignLeadOwner({
      leadId: opportunity.id,
      rules,
      owner,
      actor: null,
      kind: "initial",
    });
  }

  if (params.note) {
    await prisma.activity.create({
      data: {
        workspaceId: params.workspaceId,
        entityType: "opportunity",
        entityId: opportunity.id,
        type: "note",
        actorId: params.actor?.id ?? null,
        actorName: params.actor?.name ?? "System",
        summary: params.note,
      },
    });
  }

  const final = await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunity.id } });
  return final;
}

export async function intakeLeadFromInput(params: {
  workspaceId: string;
  actor: { id: string; name: string } | null;
  input: Pick<CreateLeadInput, "name" | "email" | "phone" | "title" | "value" | "source" | "pipelineId" | "ownerId" | "customFields" | "note">;
}): Promise<{ opportunity: Opportunity; contactId: string }> {
  const { input } = params;
  const existing = await findContactByEmailOrPhone(params.workspaceId, input.email ?? null, input.phone ?? null);

  let contactId: string;
  if (existing) {
    contactId = existing.id;
    const updates: Record<string, unknown> = {};
    if (input.email) updates.email = input.email;
    if (input.phone) updates.phone = input.phone;
    if (Object.keys(updates).length > 0) {
      await prisma.contact.update({ where: { id: existing.id }, data: updates });
    }
  } else {
    const definitions = await definitionsFor(params.workspaceId, "contact");
    const contactCustomFields = input.customFields
      ? validateCustomFieldValues(definitions, input.customFields, { partial: false })
      : {};
    const created = await prisma.contact.create({
      data: {
        workspaceId: params.workspaceId,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        ownerId: params.actor?.id ?? null,
        customFields: contactCustomFields as Prisma.InputJsonValue,
      },
    });
    contactId = created.id;
  }

  const opportunity = await createLeadOpportunity({
    workspaceId: params.workspaceId,
    actor: params.actor,
    contactId,
    title: input.title ?? input.name,
    value: input.value ?? null,
    source: input.source,
    pipelineId: input.pipelineId ?? null,
    ownerId: input.ownerId ?? null,
    customFields: input.customFields,
    note: input.note,
  });

  return { opportunity, contactId };
}
