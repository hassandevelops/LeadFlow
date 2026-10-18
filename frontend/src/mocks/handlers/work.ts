import { HttpResponse, http } from "msw";
import {
  SOCKET_EVENTS,
  createAppointmentSchema,
  createLeadSchema,
  createPaymentRequestSchema,
  paginationQuerySchema,
  reassignLeadSchema,
  sendMessageSchema,
  updateAppointmentSchema,
  updateAssignmentRulesSchema,
  type Message,
} from "@leadflow/shared";
import { env } from "../../lib/env";
import {
  advanceWorld,
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
  recoveryItems,
  requireAuth,
  saveDb,
  userById,
  withVisibility,
} from "../store";

function nowIso(): string {
  return new Date().toISOString();
}

function integrationConnected(provider: string): boolean {
  return getDb().integrations.some(
    (integration) => integration.provider === provider && integration.status === "connected",
  );
}

function scheduleOutboundProgression(conversationId: string, messageId: string, simulateReply: boolean): void {
  const resolveMessage = () =>
    getDb().messages.find((candidate) => candidate.id === messageId);
  window.setTimeout(() => {
    const message = resolveMessage();
    if (message && message.status === "queued") {
      message.status = "sent";
      message.updatedAt = nowIso();
      emit(SOCKET_EVENTS.messageStatusUpdated, { messageId, status: "sent" });
      saveDb();
    }
  }, 1200);
  window.setTimeout(() => {
    const message = resolveMessage();
    if (message && message.status === "sent") {
      message.status = "delivered";
      message.updatedAt = nowIso();
      emit(SOCKET_EVENTS.messageStatusUpdated, { messageId, status: "delivered" });
      saveDb();
    }
  }, 3400);
  if (!simulateReply) return;
  window.setTimeout(() => {
    const db = getDb();
    const message = resolveMessage();
    if (!message || message.status === "failed") return;
    const conversation = db.conversations.find((candidate) => candidate.id === conversationId);
    if (!conversation) return;
    const contact = contactById(conversation.contactId);
    if (contact?.optedOut) return;
    const replies = [
      "Thanks for the update!",
      "Got it — I'll take a look and get back to you.",
      "Sounds good. Can we hop on a quick call tomorrow?",
      "Perfect timing, we were just discussing this.",
    ];
    const reply = {
      id: crypto.randomUUID(),
      workspaceId: db.workspace.id,
      conversationId,
      direction: "inbound" as const,
      body: replies[Math.floor(Math.random() * replies.length)]!,
      status: "received" as const,
      providerMessageId: null,
      errorCode: null,
      errorMessage: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.messages.push(reply);
    conversation.lastMessageAt = reply.createdAt;
    conversation.unreadCount += 1;
    conversation.updatedAt = reply.createdAt;
    emit(SOCKET_EVENTS.messageReceived, {
      conversationId,
      messageId: reply.id,
      contactId: conversation.contactId,
    });
    emit(SOCKET_EVENTS.notificationCreated, {
      notificationId: crypto.randomUUID(),
      title: `New WhatsApp reply from ${contact?.name ?? "a contact"}`,
      link: "/conversations",
    });
    saveDb();
  }, 8000);
}

export const workHandlers = [
  http.post(`${env.apiUrl}/leads`, async ({ request }) => {
    const auth = requireAuth("crm.create");
    if (auth.response) return auth.response;
    const body = await readBody(request, createLeadSchema);
    if (!body.ok) return body.response;
    await latency(120, 160);
    const input = body.data;
    const db = getDb();

    let contact = db.contacts.find(
      (candidate) =>
        (input.email !== undefined && candidate.email === input.email) ||
        (input.phone !== undefined && candidate.phone === input.phone),
    );
    if (!contact) {
      contact = {
        id: crypto.randomUUID(),
        workspaceId: db.workspace.id,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        companyId: null,
        ownerId: input.ownerId ?? null,
        tags: [],
        customFields: {},
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
        summary: "Contact created from lead intake",
      });
    }

    const pipeline =
      db.pipelines.find((candidate) => candidate.id === input.pipelineId) ??
      db.pipelines.find((candidate) => candidate.isDefault) ??
      db.pipelines[0];
    if (!pipeline) return errorResponse("conflict", "No pipeline available");
    const stage = [...pipeline.stages].sort((a, b) => a.order - b.order)[0];
    if (!stage) return errorResponse("conflict", "Pipeline has no stages");

    const ownerId = input.ownerId ?? pickAssignee();
    const opportunity = {
      id: crypto.randomUUID(),
      workspaceId: db.workspace.id,
      title: input.title ?? `New lead — ${input.name}`,
      contactId: contact.id,
      companyId: contact.companyId,
      pipelineId: pipeline.id,
      stageId: stage.id,
      value: input.value ?? null,
      valueHidden: false,
      currency: "usd",
      ownerId,
      source: input.source,
      tags: [],
      customFields: input.customFields ?? {},
      assignedAt: ownerId ? nowIso() : null,
      acknowledgedAt: null,
      ackDeadlineAt: ownerId
        ? new Date(Date.now() + db.assignmentRules.ackWindowSeconds * 1000).toISOString()
        : null,
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
      summary: `Lead captured from ${input.source.replaceAll("_", " ")}`,
    });
    if (input.note) {
      pushActivity({
        entityType: "opportunity",
        entityId: opportunity.id,
        type: "note",
        actorId: auth.user.id,
        actorName: auth.user.name,
        summary: input.note,
      });
    }
    if (ownerId) {
      const owner = userById(ownerId);
      pushActivity({
        entityType: "opportunity",
        entityId: opportunity.id,
        type: "assignment",
        summary: `Assigned to ${owner?.name ?? "user"} by round-robin`,
      });
      pushAudit({
        actorId: auth.user.id,
        actorType: "user",
        actorName: auth.user.name,
        eventType: "assignment",
        targetType: "opportunity",
        targetId: opportunity.id,
        summary: `Lead "${opportunity.title}" assigned to ${owner?.name ?? "user"}`,
      });
    }
    emit(SOCKET_EVENTS.leadCreated, { leadId: opportunity.id, source: opportunity.source });
    if (ownerId) {
      emit(SOCKET_EVENTS.leadAssigned, {
        leadId: opportunity.id,
        ownerId,
        ackDeadlineAt: opportunity.ackDeadlineAt,
      });
    }
    saveDb();
    return HttpResponse.json(withVisibility(opportunity, auth.user), { status: 201 });
  }),

  http.post(`${env.apiUrl}/leads/:id/acknowledge`, async ({ params }) => {
    const auth = requireAuth();
    if (auth.response) return auth.response;
    await latency();
    const opportunity = getDb().opportunities.find((candidate) => candidate.id === params.id);
    if (!opportunity) return errorResponse("not_found", "Lead not found");
    const isAssignee = opportunity.ownerId === auth.user.id;
    if (!isAssignee && !auth.user.permissions.includes("leads.view")) {
      return errorResponse("forbidden", "Only the assignee can acknowledge this lead");
    }
    if (opportunity.acknowledgedAt) {
      return errorResponse("conflict", "Lead already acknowledged");
    }
    opportunity.acknowledgedAt = nowIso();
    opportunity.lastActionAt = nowIso();
    opportunity.updatedAt = nowIso();
    pushActivity({
      entityType: "opportunity",
      entityId: opportunity.id,
      type: "acknowledgement",
      actorId: auth.user.id,
      actorName: auth.user.name,
      summary: "Lead acknowledged",
    });
    pushAudit({
      actorId: auth.user.id,
      actorType: "user",
      actorName: auth.user.name,
      eventType: "acknowledgement",
      targetType: "opportunity",
      targetId: opportunity.id,
      summary: `Lead "${opportunity.title}" acknowledged`,
    });
    emit(SOCKET_EVENTS.leadAcknowledged, { leadId: opportunity.id, ownerId: auth.user.id });
    saveDb();
    return HttpResponse.json(withVisibility(opportunity, auth.user));
  }),

  http.post(`${env.apiUrl}/leads/:id/reassign`, async ({ request, params }) => {
    const auth = requireAuth("leads.assign");
    if (auth.response) return auth.response;
    const body = await readBody(request, reassignLeadSchema);
    if (!body.ok) return body.response;
    await latency();
    const db = getDb();
    const opportunity = db.opportunities.find((candidate) => candidate.id === params.id);
    if (!opportunity) return errorResponse("not_found", "Lead not found");
    const target = userById(body.data.toUserId);
    if (!target) return errorResponse("validation_failed", "Target user not found");
    const previousOwner = opportunity.ownerId ? userById(opportunity.ownerId)?.name : null;
    opportunity.ownerId = target.id;
    opportunity.assignedAt = nowIso();
    opportunity.ackDeadlineAt = new Date(Date.now() + db.assignmentRules.ackWindowSeconds * 1000).toISOString();
    opportunity.acknowledgedAt = null;
    opportunity.escalationCount = 0;
    opportunity.lastActionAt = nowIso();
    opportunity.updatedAt = nowIso();
    pushActivity({
      entityType: "opportunity",
      entityId: opportunity.id,
      type: "reassignment",
      actorId: auth.user.id,
      actorName: auth.user.name,
      summary: `Reassigned from ${previousOwner ?? "nobody"} to ${target.name}${body.data.reason ? ` — ${body.data.reason}` : ""}`,
    });
    pushAudit({
      actorId: auth.user.id,
      actorType: "user",
      actorName: auth.user.name,
      eventType: "reassignment",
      targetType: "opportunity",
      targetId: opportunity.id,
      summary: `Lead "${opportunity.title}" reassigned to ${target.name}`,
      before: { owner: previousOwner ?? null },
      after: { owner: target.name },
    });
    emit(SOCKET_EVENTS.leadAssigned, {
      leadId: opportunity.id,
      ownerId: target.id,
      ackDeadlineAt: opportunity.ackDeadlineAt,
    });
    saveDb();
    return HttpResponse.json(withVisibility(opportunity, auth.user));
  }),

  http.get(`${env.apiUrl}/recovery-queue`, async ({ request }) => {
    const auth = requireAuth("leads.view");
    if (auth.response) return auth.response;
    const query = readQuery(request, paginationQuerySchema);
    if (!query.ok) return query.response;
    await latency();
    advanceWorld();
    const rank: Record<string, number> = { unacknowledged: 0, escalated_twice: 1, idle: 2 };
    const items = recoveryItems().sort((a, b) => {
      const byRank = (rank[a.reason] ?? 3) - (rank[b.reason] ?? 3);
      if (byRank !== 0) return byRank;
      return (b.assignedAt ?? "").localeCompare(a.assignedAt ?? "");
    });
    return HttpResponse.json(paginate(items, query.data.page, query.data.pageSize));
  }),

  http.get(`${env.apiUrl}/assignment-rules`, async () => {
    const auth = requireAuth("assignment.manage_rules");
    if (auth.response) return auth.response;
    await latency();
    return HttpResponse.json(getDb().assignmentRules);
  }),

  http.patch(`${env.apiUrl}/assignment-rules`, async ({ request }) => {
    const auth = requireAuth("assignment.manage_rules");
    if (auth.response) return auth.response;
    const body = await readBody(request, updateAssignmentRulesSchema);
    if (!body.ok) return body.response;
    await latency(100, 150);
    const db = getDb();
    const before = { ...db.assignmentRules };
    db.assignmentRules = { ...db.assignmentRules, ...body.data };
    pushAudit({
      actorId: auth.user.id,
      actorType: "user",
      actorName: auth.user.name,
      eventType: "config_change",
      targetType: "assignment_rules",
      targetId: db.workspace.id,
      summary: "Assignment rules updated",
      before,
      after: { ...db.assignmentRules },
    });
    saveDb();
    return HttpResponse.json(db.assignmentRules);
  }),

  http.get(`${env.apiUrl}/conversations`, async ({ request }) => {
    const auth = requireAuth("crm.view");
    if (auth.response) return auth.response;
    const query = readQuery(request, paginationQuerySchema);
    if (!query.ok) return query.response;
    await latency();
    const conversations = [...getDb().conversations].sort((a, b) =>
      (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""),
    );
    return HttpResponse.json(paginate(conversations, query.data.page, query.data.pageSize));
  }),

  http.get(`${env.apiUrl}/conversations/:id/messages`, async ({ request, params }) => {
    const auth = requireAuth("crm.view");
    if (auth.response) return auth.response;
    const query = readQuery(request, paginationQuerySchema);
    if (!query.ok) return query.response;
    await latency();
    const db = getDb();
    const conversation = db.conversations.find((candidate) => candidate.id === params.id);
    if (!conversation) return errorResponse("not_found", "Conversation not found");
    conversation.unreadCount = 0;
    saveDb();
    const messages = db.messages
      .filter((message) => message.conversationId === conversation.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return HttpResponse.json(paginate(messages, query.data.page, query.data.pageSize));
  }),

  http.post(`${env.apiUrl}/conversations/:id/messages`, async ({ request, params }) => {
    const auth = requireAuth("crm.edit");
    if (auth.response) return auth.response;
    const body = await readBody(request, sendMessageSchema);
    if (!body.ok) return body.response;
    await latency(150, 200);
    const db = getDb();
    const conversation = db.conversations.find((candidate) => candidate.id === params.id);
    if (!conversation) return errorResponse("not_found", "Conversation not found");
    const contact = contactById(conversation.contactId);
    if (contact?.optedOut) {
      return errorResponse("conflict", "This contact has opted out of WhatsApp messages");
    }
    if (!integrationConnected("twilio_whatsapp")) {
      return errorResponse("provider_error", "WhatsApp is not connected. Connect Twilio in Integrations.");
    }
    const message: Message = {
      id: crypto.randomUUID(),
      workspaceId: db.workspace.id,
      conversationId: conversation.id,
      direction: "outbound",
      body: body.data.body,
      status: "queued",
      providerMessageId: `SM${crypto.randomUUID().slice(0, 20)}`,
      errorCode: null,
      errorMessage: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.messages.push(message);
    conversation.lastMessageAt = message.createdAt;
    conversation.updatedAt = message.createdAt;

    if (Math.random() < 0.1) {
      message.status = "failed";
      message.errorCode = "twilio_30006";
      message.errorMessage = "Carrier rejected the message (unreachable)";
      emit(SOCKET_EVENTS.messageStatusUpdated, { messageId: message.id, status: "failed" });
    } else {
      scheduleOutboundProgression(conversation.id, message.id, true);
    }
    saveDb();
    return HttpResponse.json(message, { status: 201 });
  }),

  http.post(`${env.apiUrl}/conversations/:id/messages/:messageId/retry`, async ({ params }) => {
    const auth = requireAuth("crm.edit");
    if (auth.response) return auth.response;
    await latency(120, 160);
    const db = getDb();
    const conversation = db.conversations.find((candidate) => candidate.id === params.id);
    if (!conversation) return errorResponse("not_found", "Conversation not found");
    const message = db.messages.find(
      (candidate) => candidate.id === params.messageId && candidate.conversationId === conversation.id,
    );
    if (!message) return errorResponse("not_found", "Message not found");
    if (message.status !== "failed") return errorResponse("conflict", "Only failed messages can be retried");
    if (contactById(conversation.contactId)?.optedOut) {
      return errorResponse("conflict", "This contact has opted out of WhatsApp messages");
    }
    message.status = "queued";
    message.errorCode = null;
    message.errorMessage = null;
    message.providerMessageId = `SM${crypto.randomUUID().slice(0, 20)}`;
    message.updatedAt = nowIso();
    conversation.lastMessageAt = message.updatedAt;
    scheduleOutboundProgression(conversation.id, message.id, false);
    saveDb();
    return HttpResponse.json(message);
  }),

  http.patch(`${env.apiUrl}/contacts/:id/opt-out`, async ({ request, params }) => {
    const auth = requireAuth("crm.edit");
    if (auth.response) return auth.response;
    const raw = (await request.json().catch(() => null)) as { optedOut?: unknown } | null;
    if (!raw || typeof raw.optedOut !== "boolean") {
      return errorResponse("validation_failed", "optedOut must be a boolean");
    }
    await latency(100, 140);
    const contact = contactById(String(params.id));
    if (!contact) return errorResponse("not_found", "Contact not found");
    contact.optedOut = raw.optedOut;
    contact.updatedAt = nowIso();
    pushActivity({
      entityType: "contact",
      entityId: contact.id,
      type: "field_edit",
      actorId: auth.user.id,
      actorName: auth.user.name,
      summary: raw.optedOut ? "Contact opted out of WhatsApp" : "Contact opted back in to WhatsApp",
    });
    saveDb();
    return HttpResponse.json(contact);
  }),

  http.post(`${env.apiUrl}/opportunities/:id/payment-requests`, async ({ request, params }) => {
    const auth = requireAuth("crm.edit");
    if (auth.response) return auth.response;
    const body = await readBody(request, createPaymentRequestSchema);
    if (!body.ok) return body.response;
    await latency(150, 200);
    const db = getDb();
    const opportunity = db.opportunities.find((candidate) => candidate.id === params.id);
    if (!opportunity) return errorResponse("not_found", "Opportunity not found");
    if (!integrationConnected("stripe")) {
      return errorResponse("provider_error", "Stripe is not connected. Connect Stripe in Integrations.");
    }
    const request_ = {
      id: crypto.randomUUID(),
      workspaceId: db.workspace.id,
      opportunityId: opportunity.id,
      contactId: opportunity.contactId,
      amount: body.data.amount,
      currency: body.data.currency,
      status: "pending" as const,
      provider: "stripe" as const,
      providerRef: null,
      checkoutUrl: `https://checkout.stripe.com/c/pay/${crypto.randomUUID().slice(0, 16)}`,
      requestedByUserId: auth.user.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.paymentRequests.push(request_);
    pushActivity({
      entityType: "opportunity",
      entityId: opportunity.id,
      type: "payment",
      actorId: auth.user.id,
      actorName: auth.user.name,
      summary: `Payment request created for ${body.data.amount} ${body.data.currency.toUpperCase()}`,
    });
    const requestId = request_.id;
    window.setTimeout(() => {
      const current = getDb();
      const pending = current.paymentRequests.find((candidate) => candidate.id === requestId);
      if (!pending || pending.status !== "pending") return;
      if (Math.random() < 0.85) {
        pending.status = "paid";
        pending.providerRef = `pi_${crypto.randomUUID().slice(0, 16)}`;
        pending.updatedAt = nowIso();
        const paidAt = nowIso();
        current.payments.push({
          id: crypto.randomUUID(),
          workspaceId: current.workspace.id,
          paymentRequestId: pending.id,
          amount: pending.amount,
          currency: pending.currency,
          status: "succeeded",
          providerRef: pending.providerRef,
          paidAt,
          refundedAmount: 0,
          createdAt: paidAt,
          updatedAt: paidAt,
        });
        emit(SOCKET_EVENTS.paymentUpdated, { paymentRequestId: pending.id, status: "paid" });
        emit(SOCKET_EVENTS.notificationCreated, {
          notificationId: crypto.randomUUID(),
          title: `Payment received: ${pending.amount} ${pending.currency.toUpperCase()}`,
          link: "/payments",
        });
      } else {
        pending.status = "failed";
        pending.updatedAt = nowIso();
        emit(SOCKET_EVENTS.paymentUpdated, { paymentRequestId: pending.id, status: "failed" });
      }
      saveDb();
    }, 12000);
    saveDb();
    return HttpResponse.json(request_, { status: 201 });
  }),

  http.get(`${env.apiUrl}/payment-requests`, async ({ request }) => {
    const auth = requireAuth("crm.view");
    if (auth.response) return auth.response;
    const query = readQuery(request, paginationQuerySchema);
    if (!query.ok) return query.response;
    await latency();
    const items = [...getDb().paymentRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return HttpResponse.json(paginate(items, query.data.page, query.data.pageSize));
  }),

  http.get(`${env.apiUrl}/payments`, async ({ request }) => {
    const auth = requireAuth("crm.view");
    if (auth.response) return auth.response;
    const query = readQuery(request, paginationQuerySchema);
    if (!query.ok) return query.response;
    await latency();
    const items = [...getDb().payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return HttpResponse.json(paginate(items, query.data.page, query.data.pageSize));
  }),

  http.get(`${env.apiUrl}/users/:id/busy`, async ({ request, params }) => {
    const auth = requireAuth("crm.view");
    if (auth.response) return auth.response;
    await latency();
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const user = userById(String(params.id));
    if (!user) return errorResponse("not_found", "User not found");
    if (!from || !to) return errorResponse("validation_failed", "from and to are required");
    const db = getDb();
    if (!db.googleConnected[user.id]) {
      return errorResponse("provider_error", `${user.name} has not connected Google Calendar`);
    }
    const busy = db.appointments
      .filter(
        (appointment) =>
          appointment.userId === user.id &&
          appointment.status === "scheduled" &&
          appointment.startsAt < to &&
          appointment.endsAt > from,
      )
      .map((appointment) => ({ startsAt: appointment.startsAt, endsAt: appointment.endsAt }));
    return HttpResponse.json(busy);
  }),

  http.get(`${env.apiUrl}/appointments`, async ({ request }) => {
    const auth = requireAuth("crm.view");
    if (auth.response) return auth.response;
    const query = readQuery(request, paginationQuerySchema);
    if (!query.ok) return query.response;
    await latency();
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    let appointments = [...getDb().appointments];
    if (userId) appointments = appointments.filter((appointment) => appointment.userId === userId);
    if (from) appointments = appointments.filter((appointment) => appointment.endsAt > from);
    if (to) appointments = appointments.filter((appointment) => appointment.startsAt < to);
    appointments.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return HttpResponse.json(paginate(appointments, query.data.page, query.data.pageSize));
  }),

  http.post(`${env.apiUrl}/appointments`, async ({ request }) => {
    const auth = requireAuth("crm.edit");
    if (auth.response) return auth.response;
    const body = await readBody(request, createAppointmentSchema);
    if (!body.ok) return body.response;
    await latency(140, 180);
    const db = getDb();
    const contact = contactById(body.data.contactId);
    if (!contact) return errorResponse("not_found", "Contact not found");
    const user = userById(body.data.userId);
    if (!user) return errorResponse("not_found", "User not found");
    if (!db.googleConnected[user.id]) {
      return errorResponse(
        "provider_error",
        `${user.name} has not connected Google Calendar, so the appointment cannot be synced`,
      );
    }
    const appointment = {
      id: crypto.randomUUID(),
      workspaceId: db.workspace.id,
      contactId: contact.id,
      opportunityId: body.data.opportunityId ?? null,
      userId: user.id,
      title: body.data.title,
      description: body.data.description ?? null,
      startsAt: body.data.startsAt,
      endsAt: body.data.endsAt,
      timeZone: body.data.timeZone,
      status: "scheduled" as const,
      syncState: "pending" as const,
      googleEventId: null,
      syncError: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.appointments.push(appointment);
    pushActivity({
      entityType: "contact",
      entityId: contact.id,
      type: "appointment",
      actorId: auth.user.id,
      actorName: auth.user.name,
      summary: `Appointment booked: ${appointment.title}`,
    });
    const appointmentId = appointment.id;
    window.setTimeout(() => {
      const current = getDb();
      const created = current.appointments.find((candidate) => candidate.id === appointmentId);
      if (!created || created.syncState !== "pending") return;
      if (Math.random() < 0.9) {
        created.syncState = "synced";
        created.googleEventId = `gcal_${crypto.randomUUID().slice(0, 10)}`;
      } else {
        created.syncState = "failed";
        created.syncError = "Google API rate limit (429) — will retry on next edit";
      }
      created.updatedAt = nowIso();
      emit(SOCKET_EVENTS.appointmentUpdated, { appointmentId, status: created.syncState });
      saveDb();
    }, 4000);
    saveDb();
    return HttpResponse.json(appointment, { status: 201 });
  }),

  http.patch(`${env.apiUrl}/appointments/:id`, async ({ request, params }) => {
    const auth = requireAuth("crm.edit");
    if (auth.response) return auth.response;
    const body = await readBody(request, updateAppointmentSchema);
    if (!body.ok) return body.response;
    await latency();
    const appointment = getDb().appointments.find((candidate) => candidate.id === params.id);
    if (!appointment) return errorResponse("not_found", "Appointment not found");
    const timesChanged =
      (body.data.startsAt !== undefined && body.data.startsAt !== appointment.startsAt) ||
      (body.data.endsAt !== undefined && body.data.endsAt !== appointment.endsAt);
    if (body.data.title !== undefined) appointment.title = body.data.title;
    if (body.data.description !== undefined) appointment.description = body.data.description;
    if (body.data.startsAt !== undefined) appointment.startsAt = body.data.startsAt;
    if (body.data.endsAt !== undefined) appointment.endsAt = body.data.endsAt;
    if (body.data.timeZone !== undefined) appointment.timeZone = body.data.timeZone;
    if (body.data.status !== undefined) appointment.status = body.data.status;
    if (timesChanged && appointment.status === "scheduled") {
      appointment.syncState = "pending";
      appointment.syncError = null;
      const appointmentId = appointment.id;
      window.setTimeout(() => {
        const current = getDb().appointments.find((candidate) => candidate.id === appointmentId);
        if (!current || current.syncState !== "pending") return;
        current.syncState = "synced";
        current.googleEventId = `gcal_${crypto.randomUUID().slice(0, 10)}`;
        current.updatedAt = nowIso();
        emit(SOCKET_EVENTS.appointmentUpdated, { appointmentId, status: "synced" });
        saveDb();
      }, 3000);
    }
    appointment.updatedAt = nowIso();
    emit(SOCKET_EVENTS.appointmentUpdated, { appointmentId: appointment.id, status: appointment.status });
    saveDb();
    return HttpResponse.json(appointment);
  }),

  http.delete(`${env.apiUrl}/appointments/:id`, async ({ params }) => {
    const auth = requireAuth("crm.edit");
    if (auth.response) return auth.response;
    await latency();
    const db = getDb();
    const appointment = db.appointments.find((candidate) => candidate.id === params.id);
    if (!appointment) return errorResponse("not_found", "Appointment not found");
    db.appointments = db.appointments.filter((candidate) => candidate.id !== appointment.id);
    saveDb();
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${env.googleIntegrationUrl}/connect`, async () => {
    const auth = requireAuth();
    if (auth.response) return auth.response;
    await latency(200, 300);
    const db = getDb();
    db.googleConnected[auth.user.id] = true;
    const integration = db.integrations.find((candidate) => candidate.provider === "google_calendar");
    if (integration) {
      integration.status = "connected";
      integration.accountLabel = auth.user.email;
      integration.lastSuccessAt = nowIso();
      integration.updatedAt = nowIso();
    }
    pushAudit({
      actorId: auth.user.id,
      actorType: "user",
      actorName: auth.user.name,
      eventType: "integration_change",
      targetType: "integration",
      targetId: "google_calendar",
      summary: `${auth.user.name} connected Google Calendar`,
    });
    saveDb();
    return integration
      ? HttpResponse.json(integration)
      : errorResponse("internal", "Integration state missing");
  }),

  http.delete(env.googleIntegrationUrl, async () => {
    const auth = requireAuth();
    if (auth.response) return auth.response;
    await latency(160, 200);
    const db = getDb();
    db.googleConnected[auth.user.id] = false;
    const integration = db.integrations.find((candidate) => candidate.provider === "google_calendar");
    if (integration) {
      integration.status = "not_connected";
      integration.accountLabel = null;
      integration.updatedAt = nowIso();
    }
    pushAudit({
      actorId: auth.user.id,
      actorType: "user",
      actorName: auth.user.name,
      eventType: "integration_change",
      targetType: "integration",
      targetId: "google_calendar",
      summary: `${auth.user.name} disconnected Google Calendar`,
    });
    saveDb();
    return new HttpResponse(null, { status: 204 });
  }),
];
