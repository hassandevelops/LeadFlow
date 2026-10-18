import { HttpResponse, http } from "msw";
import {
  SOCKET_EVENTS,
  contactListQuerySchema,
  createCompanySchema,
  createContactSchema,
  createNoteSchema,
  createOpportunitySchema,
  createSavedListSchema,
  moveStageSchema,
  opportunityFilterSchema,
  paginationQuerySchema,
  updateCompanySchema,
  updateContactSchema,
  updateOpportunitySchema,
  type Opportunity,
  type OpportunityFilter,
} from "@leadflow/shared";
import { env } from "../../lib/env";
import {
  advanceWorld,
  companyById,
  contactById,
  emit,
  errorResponse,
  getDb,
  latency,
  paginate,
  pickAssignee,
  pushActivity,
  pushAudit,
  readBody,
  readQuery,
  requireAuth,
  saveDb,
  stageById,
  userById,
  withVisibility,
} from "../store";

function nowIso(): string {
  return new Date().toISOString();
}

export const crmHandlers = [
  http.get(`${env.apiUrl}/companies`, async ({ request }) => {
    const auth = requireAuth("crm.view");
    if (auth.response) return auth.response;
    const query = readQuery(request, paginationQuerySchema);
    if (!query.ok) return query.response;
    await latency();
    let companies = [...getDb().companies];
    const q = query.data.q?.toLowerCase();
    if (q) {
      companies = companies.filter(
        (company) =>
          company.name.toLowerCase().includes(q) || (company.domain ?? "").toLowerCase().includes(q),
      );
    }
    companies.sort((a, b) => a.name.localeCompare(b.name));
    return HttpResponse.json(paginate(companies, query.data.page, query.data.pageSize));
  }),

  http.post(`${env.apiUrl}/companies`, async ({ request }) => {
    const auth = requireAuth("crm.create");
    if (auth.response) return auth.response;
    const body = await readBody(request, createCompanySchema);
    if (!body.ok) return body.response;
    await latency();
    const db = getDb();
    const company = {
      id: crypto.randomUUID(),
      workspaceId: db.workspace.id,
      name: body.data.name,
      domain: body.data.domain ?? null,
      phone: body.data.phone ?? null,
      address: body.data.address ?? null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.companies.push(company);
    saveDb();
    return HttpResponse.json(company, { status: 201 });
  }),

  http.get(`${env.apiUrl}/companies/:id`, async ({ params }) => {
    const auth = requireAuth("crm.view");
    if (auth.response) return auth.response;
    await latency();
    const company = companyById(String(params.id));
    return company ? HttpResponse.json(company) : errorResponse("not_found", "Company not found");
  }),

  http.patch(`${env.apiUrl}/companies/:id`, async ({ request, params }) => {
    const auth = requireAuth("crm.edit");
    if (auth.response) return auth.response;
    const body = await readBody(request, updateCompanySchema);
    if (!body.ok) return body.response;
    await latency();
    const company = companyById(String(params.id));
    if (!company) return errorResponse("not_found", "Company not found");
    Object.assign(company, {
      ...(body.data.name === undefined ? {} : { name: body.data.name }),
      ...(body.data.domain === undefined ? {} : { domain: body.data.domain }),
      ...(body.data.phone === undefined ? {} : { phone: body.data.phone }),
      ...(body.data.address === undefined ? {} : { address: body.data.address }),
      updatedAt: nowIso(),
    });
    saveDb();
    return HttpResponse.json(company);
  }),

  http.delete(`${env.apiUrl}/companies/:id`, async ({ params }) => {
    const auth = requireAuth("crm.delete");
    if (auth.response) return auth.response;
    await latency();
    const db = getDb();
    const company = companyById(String(params.id));
    if (!company) return errorResponse("not_found", "Company not found");
    db.companies = db.companies.filter((candidate) => candidate.id !== company.id);
    for (const contact of db.contacts) {
      if (contact.companyId === company.id) contact.companyId = null;
    }
    for (const opportunity of db.opportunities) {
      if (opportunity.companyId === company.id) opportunity.companyId = null;
    }
    pushAudit({
      actorId: auth.user.id,
      actorType: "user",
      actorName: auth.user.name,
      eventType: "deletion",
      targetType: "company",
      targetId: company.id,
      summary: `Company "${company.name}" deleted`,
    });
    saveDb();
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${env.apiUrl}/contacts`, async ({ request }) => {
    const auth = requireAuth("crm.view");
    if (auth.response) return auth.response;
    const query = readQuery(request, contactListQuerySchema);
    if (!query.ok) return query.response;
    await latency();
    let contacts = [...getDb().contacts];
    const q = query.data.q?.toLowerCase();
    if (q) {
      contacts = contacts.filter(
        (contact) =>
          contact.name.toLowerCase().includes(q) ||
          (contact.email ?? "").toLowerCase().includes(q) ||
          (contact.phone ?? "").includes(q),
      );
    }
    if (query.data.ownerId) {
      contacts = contacts.filter((contact) => contact.ownerId === query.data.ownerId);
    }
    if (query.data.companyId) {
      contacts = contacts.filter((contact) => contact.companyId === query.data.companyId);
    }
    if (query.data.tag) {
      contacts = contacts.filter((contact) => contact.tags.includes(query.data.tag!));
    }
    contacts.sort((a, b) => a.name.localeCompare(b.name));
    return HttpResponse.json(paginate(contacts, query.data.page, query.data.pageSize));
  }),

  http.post(`${env.apiUrl}/contacts`, async ({ request }) => {
    const auth = requireAuth("crm.create");
    if (auth.response) return auth.response;
    const body = await readBody(request, createContactSchema);
    if (!body.ok) return body.response;
    await latency();
    const db = getDb();
    const contact = {
      id: crypto.randomUUID(),
      workspaceId: db.workspace.id,
      name: body.data.name,
      email: body.data.email ?? null,
      phone: body.data.phone ?? null,
      companyId: body.data.companyId ?? null,
      ownerId: body.data.ownerId ?? auth.user.id,
      tags: body.data.tags ?? [],
      customFields: body.data.customFields ?? {},
      optedOut: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.contacts.push(contact);
    pushActivity({
      entityType: "contact",
      entityId: contact.id,
      type: "created",
      actorId: auth.user.id,
      actorName: auth.user.name,
      summary: "Contact created",
    });
    saveDb();
    return HttpResponse.json(contact, { status: 201 });
  }),

  http.get(`${env.apiUrl}/contacts/:id/full`, async ({ params }) => {
    const auth = requireAuth("crm.view");
    if (auth.response) return auth.response;
    await latency(80, 160);
    const db = getDb();
    const contact = contactById(String(params.id));
    if (!contact) return errorResponse("not_found", "Contact not found");
    const opportunities = db.opportunities.filter(
      (opportunity) => opportunity.contactId === contact.id,
    );
    const opportunityIds = new Set(opportunities.map((opportunity) => opportunity.id));
    const conversations = db.conversations.filter(
      (conversation) => conversation.contactId === contact.id,
    );
    const paymentRequests = db.paymentRequests.filter((request) => request.contactId === contact.id);
    const requestIds = new Set(paymentRequests.map((request) => request.id));
    const payments = db.payments.filter((payment) => requestIds.has(payment.paymentRequestId));
    const appointments = db.appointments.filter((appointment) => appointment.contactId === contact.id);
    const activity = db.activities
      .filter(
        (entry) =>
          (entry.entityType === "contact" && entry.entityId === contact.id) ||
          (entry.entityType === "opportunity" && opportunityIds.has(entry.entityId)),
      )
      .slice(0, 50);
    return HttpResponse.json({
      contact,
      company: contact.companyId ? (companyById(contact.companyId) ?? null) : null,
      owner: contact.ownerId ? (userById(contact.ownerId) ?? null) : null,
      opportunities: opportunities.map((opportunity) => withVisibility(opportunity, auth.user)),
      conversations,
      paymentRequests,
      payments,
      appointments,
      activity,
    });
  }),

  http.get(`${env.apiUrl}/contacts/:id/timeline`, async ({ request, params }) => {
    const auth = requireAuth("crm.view");
    if (auth.response) return auth.response;
    const query = readQuery(request, paginationQuerySchema);
    if (!query.ok) return query.response;
    await latency();
    const db = getDb();
    const contact = contactById(String(params.id));
    if (!contact) return errorResponse("not_found", "Contact not found");
    const opportunityIds = new Set(
      db.opportunities
        .filter((opportunity) => opportunity.contactId === contact.id)
        .map((opportunity) => opportunity.id),
    );
    const entries = db.activities.filter(
      (entry) =>
        (entry.entityType === "contact" && entry.entityId === contact.id) ||
        (entry.entityType === "opportunity" && opportunityIds.has(entry.entityId)),
    );
    entries.sort((a, b) => b.at.localeCompare(a.at));
    return HttpResponse.json(paginate(entries, query.data.page, query.data.pageSize));
  }),

  http.get(`${env.apiUrl}/contacts/:id`, async ({ params }) => {
    const auth = requireAuth("crm.view");
    if (auth.response) return auth.response;
    await latency();
    const contact = contactById(String(params.id));
    return contact ? HttpResponse.json(contact) : errorResponse("not_found", "Contact not found");
  }),

  http.patch(`${env.apiUrl}/contacts/:id`, async ({ request, params }) => {
    const auth = requireAuth("crm.edit");
    if (auth.response) return auth.response;
    const body = await readBody(request, updateContactSchema);
    if (!body.ok) return body.response;
    await latency();
    const contact = contactById(String(params.id));
    if (!contact) return errorResponse("not_found", "Contact not found");
    if (body.data.customFields) {
      contact.customFields = { ...contact.customFields, ...body.data.customFields };
    }
    Object.assign(contact, {
      ...(body.data.name === undefined ? {} : { name: body.data.name }),
      ...(body.data.email === undefined ? {} : { email: body.data.email }),
      ...(body.data.phone === undefined ? {} : { phone: body.data.phone }),
      ...(body.data.companyId === undefined ? {} : { companyId: body.data.companyId }),
      ...(body.data.ownerId === undefined ? {} : { ownerId: body.data.ownerId }),
      ...(body.data.tags === undefined ? {} : { tags: body.data.tags }),
      ...(body.data.optedOut === undefined ? {} : { optedOut: body.data.optedOut }),
      updatedAt: nowIso(),
    });
    pushActivity({
      entityType: "contact",
      entityId: contact.id,
      type: "field_edit",
      actorId: auth.user.id,
      actorName: auth.user.name,
      summary: "Contact details updated",
    });
    saveDb();
    return HttpResponse.json(contact);
  }),

  http.delete(`${env.apiUrl}/contacts/:id`, async ({ params }) => {
    const auth = requireAuth("crm.delete");
    if (auth.response) return auth.response;
    await latency();
    const db = getDb();
    const contact = contactById(String(params.id));
    if (!contact) return errorResponse("not_found", "Contact not found");
    const conversationIds = new Set(
      db.conversations
        .filter((conversation) => conversation.contactId === contact.id)
        .map((conversation) => conversation.id),
    );
    db.contacts = db.contacts.filter((candidate) => candidate.id !== contact.id);
    db.conversations = db.conversations.filter(
      (conversation) => conversation.contactId !== contact.id,
    );
    db.messages = db.messages.filter((message) => !conversationIds.has(message.conversationId));
    db.appointments = db.appointments.filter((appointment) => appointment.contactId !== contact.id);
    db.paymentRequests = db.paymentRequests.filter((request) => request.contactId !== contact.id);
    pushAudit({
      actorId: auth.user.id,
      actorType: "user",
      actorName: auth.user.name,
      eventType: "deletion",
      targetType: "contact",
      targetId: contact.id,
      summary: `Contact "${contact.name}" deleted`,
      before: { name: contact.name, email: contact.email, phone: contact.phone },
    });
    saveDb();
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${env.apiUrl}/opportunities/export`, async ({ request }) => {
    const auth = requireAuth("crm.export");
    if (auth.response) return auth.response;
    await latency(120, 200);
    const query = readQuery(request, opportunityFilterSchema);
    if (!query.ok) return query.response;
    const db = getDb();
    const canSeeValue = auth.user.permissions.includes("crm.view_value");
    const filtered = applyOpportunityFilters(request, db.opportunities, query.data);
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
    const rows = filtered.map((opportunity) => {
      const contact = contactById(opportunity.contactId);
      const company = opportunity.companyId ? companyById(opportunity.companyId) : undefined;
      const pipeline = db.pipelines.find((candidate) => candidate.id === opportunity.pipelineId);
      const stage = stageById(opportunity.stageId);
      const owner = opportunity.ownerId ? userById(opportunity.ownerId) : undefined;
      const cells = [
        opportunity.id,
        csvCell(opportunity.title),
        csvCell(contact?.name ?? ""),
        csvCell(company?.name ?? ""),
        csvCell(pipeline?.name ?? ""),
        csvCell(stage?.name ?? ""),
        csvCell(owner?.name ?? ""),
        opportunity.source,
        csvCell(opportunity.tags.join(";")),
        opportunity.currency,
        ...(canSeeValue ? [String(opportunity.value ?? "")] : []),
        opportunity.createdAt,
      ];
      return cells.join(",");
    });
    const csv = [header, ...rows].join("\n");
    return new HttpResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="opportunities.csv"',
      },
    });
  }),

  http.get(`${env.apiUrl}/opportunities`, async ({ request }) => {
    const auth = requireAuth("crm.view");
    if (auth.response) return auth.response;
    const query = readQuery(request, opportunityFilterSchema);
    if (!query.ok) return query.response;
    await latency();
    advanceWorld();
    const db = getDb();
    let filtered = applyOpportunityFilters(request, db.opportunities, query.data);
    const q = query.data.q?.toLowerCase();
    if (q) {
      filtered = filtered.filter((opportunity) => {
        const contact = contactById(opportunity.contactId);
        return (
          opportunity.title.toLowerCase().includes(q) ||
          (contact?.name.toLowerCase().includes(q) ?? false)
        );
      });
    }
    filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const page = paginate(filtered, query.data.page, query.data.pageSize);
    return HttpResponse.json({
      ...page,
      data: page.data.map((opportunity) => withVisibility(opportunity, auth.user)),
    });
  }),

  http.post(`${env.apiUrl}/opportunities`, async ({ request }) => {
    const auth = requireAuth("crm.create");
    if (auth.response) return auth.response;
    const body = await readBody(request, createOpportunitySchema);
    if (!body.ok) return body.response;
    await latency();
    const db = getDb();
    const contact = contactById(body.data.contactId);
    if (!contact) return errorResponse("not_found", "Contact not found");
    const pipeline =
      db.pipelines.find((candidate) => candidate.id === body.data.pipelineId) ??
      db.pipelines.find((candidate) => candidate.isDefault);
    if (!pipeline) return errorResponse("conflict", "No pipeline available");
    const stage =
      pipeline.stages.find((candidate) => candidate.id === body.data.stageId) ??
      [...pipeline.stages].sort((a, b) => a.order - b.order)[0];
    if (!stage) return errorResponse("conflict", "Pipeline has no stages");
    const ownerId = body.data.ownerId ?? pickAssignee();
    const rules = db.assignmentRules;
    const opportunity = {
      id: crypto.randomUUID(),
      workspaceId: db.workspace.id,
      title: body.data.title,
      contactId: contact.id,
      companyId: body.data.companyId ?? contact.companyId,
      pipelineId: pipeline.id,
      stageId: stage.id,
      value: body.data.value ?? null,
      valueHidden: false,
      currency: body.data.currency,
      ownerId,
      source: body.data.source,
      tags: body.data.tags ?? [],
      customFields: body.data.customFields ?? {},
      assignedAt: ownerId ? nowIso() : null,
      acknowledgedAt: null,
      ackDeadlineAt: ownerId ? new Date(Date.now() + rules.ackWindowSeconds * 1000).toISOString() : null,
      escalationCount: 0,
      stageEnteredAt: nowIso(),
      lastActionAt: nowIso(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.opportunities.push(opportunity);
    pushActivity({
      entityType: "opportunity",
      entityId: opportunity.id,
      type: "created",
      actorId: auth.user.id,
      actorName: auth.user.name,
      summary: "Opportunity created",
    });
    emit(SOCKET_EVENTS.leadCreated, { leadId: opportunity.id, source: opportunity.source });
    if (ownerId) {
      const owner = userById(ownerId);
      pushActivity({
        entityType: "opportunity",
        entityId: opportunity.id,
        type: "assignment",
        summary: `Assigned to ${owner?.name ?? "user"}`,
      });
      emit(SOCKET_EVENTS.leadAssigned, {
        leadId: opportunity.id,
        ownerId,
        ackDeadlineAt: opportunity.ackDeadlineAt,
      });
    }
    saveDb();
    return HttpResponse.json(withVisibility(opportunity, auth.user), { status: 201 });
  }),

  http.get(`${env.apiUrl}/opportunities/:id`, async ({ params }) => {
    const auth = requireAuth("crm.view");
    if (auth.response) return auth.response;
    await latency();
    advanceWorld();
    const opportunity = getDb().opportunities.find((candidate) => candidate.id === params.id);
    return opportunity
      ? HttpResponse.json(withVisibility(opportunity, auth.user))
      : errorResponse("not_found", "Opportunity not found");
  }),

  http.patch(`${env.apiUrl}/opportunities/:id`, async ({ request, params }) => {
    const auth = requireAuth("crm.edit");
    if (auth.response) return auth.response;
    const body = await readBody(request, updateOpportunitySchema);
    if (!body.ok) return body.response;
    await latency();
    const db = getDb();
    const opportunity = db.opportunities.find((candidate) => candidate.id === params.id);
    if (!opportunity) return errorResponse("not_found", "Opportunity not found");

    const changes: string[] = [];
    if (body.data.customFields) {
      opportunity.customFields = { ...opportunity.customFields, ...body.data.customFields };
      changes.push("customFields");
    }
    if (body.data.title !== undefined) {
      opportunity.title = body.data.title;
      changes.push("title");
    }
    if (body.data.value !== undefined) {
      opportunity.value = body.data.value;
      changes.push("value");
    }
    if (body.data.currency !== undefined) {
      opportunity.currency = body.data.currency;
      changes.push("currency");
    }
    if (body.data.companyId !== undefined) {
      opportunity.companyId = body.data.companyId;
    }
    if (body.data.tags !== undefined) {
      opportunity.tags = body.data.tags;
    }
    if (body.data.ownerId !== undefined && body.data.ownerId !== opportunity.ownerId) {
      const rules = db.assignmentRules;
      opportunity.ownerId = body.data.ownerId;
      opportunity.assignedAt = nowIso();
      opportunity.ackDeadlineAt = new Date(Date.now() + rules.ackWindowSeconds * 1000).toISOString();
      opportunity.acknowledgedAt = null;
      opportunity.escalationCount = 0;
      const owner = body.data.ownerId ? userById(body.data.ownerId) : undefined;
      pushActivity({
        entityType: "opportunity",
        entityId: opportunity.id,
        type: "reassignment",
        actorId: auth.user.id,
        actorName: auth.user.name,
        summary: `Reassigned to ${owner?.name ?? "nobody"}`,
      });
      if (body.data.ownerId) {
        emit(SOCKET_EVENTS.leadAssigned, {
          leadId: opportunity.id,
          ownerId: body.data.ownerId,
          ackDeadlineAt: opportunity.ackDeadlineAt,
        });
      }
    }
    if (changes.length > 0) {
      pushActivity({
        entityType: "opportunity",
        entityId: opportunity.id,
        type: "field_edit",
        actorId: auth.user.id,
        actorName: auth.user.name,
        summary: `Updated ${changes.join(", ")}`,
      });
    }
    opportunity.lastActionAt = nowIso();
    opportunity.updatedAt = nowIso();
    saveDb();
    return HttpResponse.json(withVisibility(opportunity, auth.user));
  }),

  http.delete(`${env.apiUrl}/opportunities/:id`, async ({ params }) => {
    const auth = requireAuth("crm.delete");
    if (auth.response) return auth.response;
    await latency();
    const db = getDb();
    const opportunity = db.opportunities.find((candidate) => candidate.id === params.id);
    if (!opportunity) return errorResponse("not_found", "Opportunity not found");
    db.opportunities = db.opportunities.filter((candidate) => candidate.id !== opportunity.id);
    pushAudit({
      actorId: auth.user.id,
      actorType: "user",
      actorName: auth.user.name,
      eventType: "deletion",
      targetType: "opportunity",
      targetId: opportunity.id,
      summary: `Opportunity "${opportunity.title}" deleted`,
    });
    saveDb();
    return new HttpResponse(null, { status: 204 });
  }),

  http.patch(`${env.apiUrl}/opportunities/:id/stage`, async ({ request, params }) => {
    const auth = requireAuth("crm.edit");
    if (auth.response) return auth.response;
    const body = await readBody(request, moveStageSchema);
    if (!body.ok) return body.response;
    await latency();
    const opportunity = getDb().opportunities.find((candidate) => candidate.id === params.id);
    if (!opportunity) return errorResponse("not_found", "Opportunity not found");
    const stage = stageById(body.data.stageId);
    if (!stage) return errorResponse("not_found", "Stage not found");
    if (stage.pipelineId !== opportunity.pipelineId) {
      return errorResponse("validation_failed", "Stage does not belong to this opportunity's pipeline");
    }
    const missing = stage.requiredFieldKeys.filter((key) => {
      const value = opportunity.customFields[key];
      return value === undefined || value === null || value === "";
    });
    if (missing.length > 0) {
      const db = getDb();
      const labels = missing.map((key) => {
        const definition = db.customFields.find((field) => field.key === key);
        return { key, label: definition?.label ?? key };
      });
      return errorResponse(
        "validation_failed",
        `Complete required fields before moving to ${stage.name}`,
        { stageId: stage.id, stageName: stage.name, missingFields: labels },
      );
    }
    const previous = stageById(opportunity.stageId);
    opportunity.stageId = stage.id;
    opportunity.stageEnteredAt = nowIso();
    opportunity.lastActionAt = nowIso();
    opportunity.updatedAt = nowIso();
    if (stage.isWon || stage.isLost) {
      opportunity.ackDeadlineAt = null;
    }
    pushActivity({
      entityType: "opportunity",
      entityId: opportunity.id,
      type: "stage_change",
      actorId: auth.user.id,
      actorName: auth.user.name,
      summary: `Moved from ${previous?.name ?? "—"} to ${stage.name}`,
      meta: { fromStage: previous?.name ?? null, toStage: stage.name },
    });
    saveDb();
    return HttpResponse.json(withVisibility(opportunity, auth.user));
  }),

  http.post(`${env.apiUrl}/opportunities/:id/notes`, async ({ request, params }) => {
    const auth = requireAuth("crm.edit");
    if (auth.response) return auth.response;
    const body = await readBody(request, createNoteSchema);
    if (!body.ok) return body.response;
    await latency();
    const opportunity = getDb().opportunities.find((candidate) => candidate.id === params.id);
    if (!opportunity) return errorResponse("not_found", "Opportunity not found");
    const activity = pushActivity({
      entityType: "opportunity",
      entityId: opportunity.id,
      type: "note",
      actorId: auth.user.id,
      actorName: auth.user.name,
      summary: body.data.body,
    });
    opportunity.lastActionAt = nowIso();
    saveDb();
    return HttpResponse.json(activity, { status: 201 });
  }),

  http.get(`${env.apiUrl}/saved-lists`, async () => {
    const auth = requireAuth("crm.view");
    if (auth.response) return auth.response;
    await latency();
    return HttpResponse.json(getDb().savedLists);
  }),

  http.post(`${env.apiUrl}/saved-lists`, async ({ request }) => {
    const auth = requireAuth("crm.view");
    if (auth.response) return auth.response;
    const body = await readBody(request, createSavedListSchema);
    if (!body.ok) return body.response;
    await latency();
    const db = getDb();
    const savedList = {
      id: crypto.randomUUID(),
      workspaceId: db.workspace.id,
      name: body.data.name,
      entity: body.data.entity,
      filter: body.data.filter,
      createdBy: auth.user.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.savedLists.push(savedList);
    saveDb();
    return HttpResponse.json(savedList, { status: 201 });
  }),
];

function csvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function applyOpportunityFilters(
  request: Request,
  opportunities: Opportunity[],
  filter: OpportunityFilter,
): Opportunity[] {
  let filtered = opportunities.filter((opportunity) => {
    if (filter.pipelineId && opportunity.pipelineId !== filter.pipelineId) return false;
    if (filter.stageId && opportunity.stageId !== filter.stageId) return false;
    if (filter.ownerId && opportunity.ownerId !== filter.ownerId) return false;
    if (filter.tag && !opportunity.tags.includes(filter.tag)) return false;
    if (filter.source && opportunity.source !== filter.source) return false;
    if (filter.createdFrom && opportunity.createdAt < filter.createdFrom) return false;
    if (filter.createdTo && opportunity.createdAt > filter.createdTo) return false;
    return true;
  });

  const cfFilters: Record<string, string> = {};
  new URL(request.url).searchParams.forEach((value, key) => {
    if (key.startsWith("cf.")) cfFilters[key.slice(3)] = value;
  });
  const cfEntries = Object.entries(cfFilters);
  if (cfEntries.length > 0) {
    filtered = filtered.filter((opportunity) =>
      cfEntries.every(([key, value]) => String(opportunity.customFields[key] ?? "") === value),
    );
  }

  return filtered;
}
