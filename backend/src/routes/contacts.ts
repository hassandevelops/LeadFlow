import {
  contactListQuerySchema,
  createContactSchema,
  paginationQuerySchema,
  updateContactSchema,
} from "@leadflow/shared";
import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { parseSort } from "../lib/query";
import {
  toActivity,
  toAppointment,
  toCompany,
  toContact,
  toConversation,
  toOpportunity,
  toPayment,
  toPaymentRequest,
  toPublicUser,
} from "../lib/serialize";
import { parseBody, parseIdParam, parseQuery } from "../lib/validation";
import { authOf, requirePermission } from "../middleware/auth";
import { writeAudit } from "../services/audit";
import { definitionsFor, mergeCustomFieldValues, validateCustomFieldValues } from "../services/custom-fields";
import { openLeadCountForUser } from "../services/leads";
import { canViewValue } from "../lib/access";

export const contactsRouter = Router();

const optOutSchema = z.object({ optedOut: z.boolean() });

const SORT_FIELDS = ["name", "createdAt", "updatedAt"] as const;

async function findContact(workspaceId: string, id: string) {
  const contact = await prisma.contact.findFirst({ where: { id, workspaceId } });
  if (!contact) {
    throw ApiError.notFound("Contact not found");
  }
  return contact;
}

async function ensureCompanyAndOwner(
  workspaceId: string,
  companyId: string | null | undefined,
  ownerId: string | null | undefined,
): Promise<void> {
  if (companyId) {
    const company = await prisma.company.findFirst({ where: { id: companyId, workspaceId } });
    if (!company) {
      throw ApiError.validationFailed("Company not found in this workspace", [
        { path: "companyId", message: "Unknown company" },
      ]);
    }
  }
  if (ownerId) {
    const owner = await prisma.user.findFirst({ where: { id: ownerId, workspaceId } });
    if (!owner) {
      throw ApiError.validationFailed("Owner not found in this workspace", [
        { path: "ownerId", message: "Unknown user" },
      ]);
    }
  }
}

contactsRouter.get("/contacts", requirePermission("crm.view"), async (req, res) => {
  const { workspaceId } = authOf(req);
  const query = parseQuery(contactListQuerySchema, req);
  const orderBy = parseSort(query.sort, SORT_FIELDS, "name");

  const where = {
    workspaceId,
    ...(query.ownerId ? { ownerId: query.ownerId } : {}),
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.tag ? { tags: { array_contains: query.tag } } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" as const } },
            { email: { contains: query.q, mode: "insensitive" as const } },
            { phone: { contains: query.q } },
          ],
        }
      : {}),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.contact.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.contact.count({ where }),
  ]);

  res.json({
    data: rows.map(toContact),
    page: query.page,
    pageSize: query.pageSize,
    total,
  });
});

contactsRouter.post("/contacts", requirePermission("crm.create"), async (req, res) => {
  const { workspaceId, user } = authOf(req);
  const input = parseBody(createContactSchema, req);
  const ownerId = input.ownerId ?? user.id;
  await ensureCompanyAndOwner(workspaceId, input.companyId ?? null, ownerId);

  const definitions = await definitionsFor(workspaceId, "contact");
  const customFields = input.customFields
    ? validateCustomFieldValues(definitions, input.customFields, { partial: false })
    : {};

  const contact = await prisma.contact.create({
    data: {
      workspaceId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      companyId: input.companyId ?? null,
      ownerId,
      tags: input.tags ?? [],
      customFields: customFields as Prisma.InputJsonValue,
    },
  });

  await prisma.activity.create({
    data: {
      workspaceId,
      entityType: "contact",
      entityId: contact.id,
      type: "created",
      actorId: user.id,
      actorName: user.name,
      summary: "Contact created",
    },
  });

  res.status(201).json(toContact(contact));
});

contactsRouter.get("/contacts/:id/full", requirePermission("crm.view"), async (req, res) => {
  const auth = authOf(req);
  const { workspaceId } = auth;
  const contact = await findContact(workspaceId, parseIdParam(req));

  const [company, owner, opportunities, conversations, paymentRequests, appointments] =
    await Promise.all([
      contact.companyId
        ? prisma.company.findFirst({ where: { id: contact.companyId, workspaceId } })
        : null,
      contact.ownerId
        ? prisma.user.findFirst({ where: { id: contact.ownerId, workspaceId } })
        : null,
      prisma.opportunity.findMany({
        where: { workspaceId, contactId: contact.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.conversation.findMany({ where: { workspaceId, contactId: contact.id } }),
      prisma.paymentRequest.findMany({ where: { workspaceId, contactId: contact.id } }),
      prisma.appointment.findMany({
        where: { workspaceId, contactId: contact.id },
        orderBy: { startsAt: "asc" },
      }),
    ]);

  const requestIds = paymentRequests.map((request) => request.id);
  const payments = requestIds.length
    ? await prisma.payment.findMany({ where: { workspaceId, paymentRequestId: { in: requestIds } } })
    : [];

  const opportunityIds = opportunities.map((opportunity) => opportunity.id);
  const activity = await prisma.activity.findMany({
    where: {
      workspaceId,
      OR: [
        { entityType: "contact", entityId: contact.id },
        ...(opportunityIds.length
          ? [{ entityType: "opportunity" as const, entityId: { in: opportunityIds } }]
          : []),
      ],
    },
    orderBy: { at: "desc" },
    take: 50,
  });

  const ownerOpenLeads = owner ? await openLeadCountForUser(workspaceId, owner.id) : 0;

  res.json({
    contact: toContact(contact),
    company: company ? toCompany(company) : null,
    owner: owner ? toPublicUser(owner, ownerOpenLeads) : null,
    opportunities: opportunities.map((opportunity) => toOpportunity(opportunity, canViewValue(auth))),
    conversations: conversations.map(toConversation),
    paymentRequests: paymentRequests.map(toPaymentRequest),
    payments: payments.map(toPayment),
    appointments: appointments.map(toAppointment),
    activity: activity.map(toActivity),
  });
});

contactsRouter.get("/contacts/:id/timeline", requirePermission("crm.view"), async (req, res) => {
  const { workspaceId } = authOf(req);
  const contact = await findContact(workspaceId, parseIdParam(req));
  const query = parseQuery(paginationQuerySchema, req);

  const opportunityIds = (
    await prisma.opportunity.findMany({
      where: { workspaceId, contactId: contact.id },
      select: { id: true },
    })
  ).map((row) => row.id);

  const where = {
    workspaceId,
    OR: [
      { entityType: "contact" as const, entityId: contact.id },
      ...(opportunityIds.length
        ? [{ entityType: "opportunity" as const, entityId: { in: opportunityIds } }]
        : []),
    ],
  };

  const [rows, total] = await prisma.$transaction([
    prisma.activity.findMany({
      where,
      orderBy: { at: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.activity.count({ where }),
  ]);

  res.json({
    data: rows.map(toActivity),
    page: query.page,
    pageSize: query.pageSize,
    total,
  });
});

contactsRouter.get("/contacts/:id", requirePermission("crm.view"), async (req, res) => {
  const { workspaceId } = authOf(req);
  const contact = await findContact(workspaceId, parseIdParam(req));
  res.json(toContact(contact));
});

contactsRouter.patch("/contacts/:id", requirePermission("crm.edit"), async (req, res) => {
  const { workspaceId, user } = authOf(req);
  const contact = await findContact(workspaceId, parseIdParam(req));
  const input = parseBody(updateContactSchema, req);
  await ensureCompanyAndOwner(
    workspaceId,
    input.companyId === undefined ? contact.companyId : input.companyId,
    input.ownerId ?? contact.ownerId,
  );

  let customFields: Record<string, unknown> | undefined;
  if (input.customFields) {
    const definitions = await definitionsFor(workspaceId, "contact");
    const validated = validateCustomFieldValues(definitions, input.customFields, { partial: true });
    customFields = mergeCustomFieldValues(
      (contact.customFields as Record<string, unknown>) ?? {},
      validated,
    );
  }

  const updateData: Prisma.ContactUncheckedUpdateInput = {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.email === undefined ? {} : { email: input.email ?? null }),
    ...(input.phone === undefined ? {} : { phone: input.phone ?? null }),
    ...(input.companyId === undefined ? {} : { companyId: input.companyId ?? null }),
    ...(input.ownerId === undefined ? {} : { ownerId: input.ownerId ?? null }),
    ...(input.tags === undefined ? {} : { tags: input.tags }),
    ...(input.optedOut === undefined ? {} : { optedOut: input.optedOut }),
    ...(customFields === undefined ? {} : { customFields: customFields as Prisma.InputJsonValue }),
  };

  const updated = await prisma.contact.update({
    where: { id: contact.id },
    data: updateData,
  });

  await prisma.activity.create({
    data: {
      workspaceId,
      entityType: "contact",
      entityId: contact.id,
      type: "field_edit",
      actorId: user.id,
      actorName: user.name,
      summary: "Contact details updated",
    },
  });

  res.json(toContact(updated));
});

contactsRouter.patch("/contacts/:id/opt-out", requirePermission("crm.edit"), async (req, res) => {
  const { workspaceId, user } = authOf(req);
  const contact = await findContact(workspaceId, parseIdParam(req));
  const input = parseBody(optOutSchema, req);

  const updated = await prisma.contact.update({
    where: { id: contact.id },
    data: { optedOut: input.optedOut },
  });

  await prisma.activity.create({
    data: {
      workspaceId,
      entityType: "contact",
      entityId: contact.id,
      type: "field_edit",
      actorId: user.id,
      actorName: user.name,
      summary: input.optedOut ? "Contact opted out of WhatsApp" : "Contact opted back in to WhatsApp",
    },
  });

  res.json(toContact(updated));
});

contactsRouter.delete("/contacts/:id", requirePermission("crm.delete"), async (req, res) => {
  const { workspaceId, user } = authOf(req);
  const contact = await findContact(workspaceId, parseIdParam(req));

  await prisma.contact.delete({ where: { id: contact.id } });

  await writeAudit({
    workspaceId,
    actor: { id: user.id, name: user.name },
    eventType: "deletion",
    targetType: "contact",
    targetId: contact.id,
    summary: `Contact “${contact.name}” deleted`,
    before: { name: contact.name, email: contact.email, phone: contact.phone },
  });

  res.status(204).end();
});
