import { HttpResponse, http } from "msw";
import {
  INTEGRATION_PROVIDERS,
  auditQuerySchema,
  connectResendSchema,
  connectStripeSchema,
  connectTwilioSchema,
  dashboardQuerySchema,
  dashboardWidgetPreferencesSchema,
  paginationQuerySchema,
  type IntegrationProvider,
  type Opportunity,
} from "@leadflow/shared";
import { env } from "../../lib/env";
import {
  advanceWorld,
  errorResponse,
  getDb,
  latency,
  openLeadCountFor,
  paginate,
  pushAudit,
  readBody,
  readQuery,
  recoveryItems,
  requireAuth,
  saveDb,
} from "../store";

function nowIso(): string {
  return new Date().toISOString();
}

function startOfMonth(): number {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export const insightHandlers = [
  http.get(`${env.apiUrl}/audit`, async ({ request }) => {
    const auth = requireAuth("audit.view");
    if (auth.response) return auth.response;
    const query = readQuery(request, auditQuerySchema);
    if (!query.ok) return query.response;
    await latency();
    advanceWorld();
    let entries = [...getDb().audit];
    if (query.data.eventType) {
      entries = entries.filter((entry) => entry.eventType === query.data.eventType);
    }
    if (query.data.actorId) {
      entries = entries.filter((entry) => entry.actorId === query.data.actorId);
    }
    if (query.data.from) {
      entries = entries.filter((entry) => entry.at >= query.data.from!);
    }
    if (query.data.to) {
      entries = entries.filter((entry) => entry.at <= query.data.to!);
    }
    entries.sort((a, b) => b.at.localeCompare(a.at));
    return HttpResponse.json(paginate(entries, query.data.page, query.data.pageSize));
  }),

  http.get(`${env.apiUrl}/dashboard`, async ({ request }) => {
    const auth = requireAuth();
    if (auth.response) return auth.response;
    const query = readQuery(request, dashboardQuerySchema);
    if (!query.ok) return query.response;
    await latency(100, 160);
    advanceWorld();

    const me = auth.user;
    const db = getDb();
    const canCompany = me.permissions.includes("dashboard.company_view");
    if (query.data.scope === "company" && !canCompany) {
      return errorResponse("forbidden", "Missing permission: dashboard.company_view");
    }
    const scope = query.data.scope ?? (canCompany ? "company" : "personal");

    const opportunityInScope = (opportunity: Opportunity) =>
      scope === "company" || opportunity.ownerId === me.id;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const newLeadsToday = db.opportunities.filter(
      (opportunity) =>
        opportunityInScope(opportunity) && new Date(opportunity.createdAt).getTime() >= todayStart.getTime(),
    ).length;

    const stageRows = new Map<string, { stageId: string; stageName: string; value: number; count: number }>();
    for (const point of db.pipelines.flatMap((pipeline) => pipeline.stages)) {
      stageRows.set(point.id, { stageId: point.id, stageName: point.name, value: 0, count: 0 });
    }
    for (const opportunity of db.opportunities) {
      if (!opportunityInScope(opportunity)) continue;
      const stage = db.pipelines
        .flatMap((pipeline) => pipeline.stages)
        .find((candidate) => candidate.id === opportunity.stageId);
      if (!stage || stage.isWon || stage.isLost) continue;
      const row = stageRows.get(stage.id);
      if (!row) continue;
      row.value += opportunity.value ?? 0;
      row.count += 1;
    }
    const openPipelineValueByStage = [...stageRows.values()]
      .filter((row) => row.count > 0)
      .map((row) => ({
        stageId: row.stageId,
        stageName: row.stageName,
        value: row.value,
        valueHidden: false,
        count: row.count,
      }));

    const rangeStart = query.data.from ? new Date(query.data.from).getTime() : 0;
    const rangeEnd = query.data.to ? new Date(query.data.to).getTime() : Number.POSITIVE_INFINITY;
    const responseTimes: number[] = [];
    for (const opportunity of db.opportunities) {
      if (!opportunityInScope(opportunity)) continue;
      const created = new Date(opportunity.createdAt).getTime();
      if (created < rangeStart || created > rangeEnd) continue;
      const assignment = db.activities.find(
        (entry) =>
          entry.entityId === opportunity.id &&
          entry.type === "assignment" &&
          opportunity.assignedAt !== null &&
          entry.at >= opportunity.assignedAt,
      );
      const acknowledgement = db.activities.find(
        (entry) =>
          entry.entityId === opportunity.id &&
          entry.type === "acknowledgement" &&
          assignment !== undefined &&
          entry.at >= assignment.at,
      );
      if (assignment && acknowledgement) {
        responseTimes.push(
          (new Date(acknowledgement.at).getTime() - new Date(assignment.at).getTime()) / 1000,
        );
      }
    }
    const avgTimeToFirstResponseSeconds =
      responseTimes.length > 0
        ? responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length
        : null;

    const recovery = recoveryItems();
    const recoveryQueueCount = recovery.filter(
      (item) => scope === "company" || item.ownerId === me.id,
    ).length;

    const myOpportunityIds = new Set(
      db.opportunities
        .filter((opportunity) => opportunityInScope(opportunity))
        .map((opportunity) => opportunity.id),
    );
    const escalationsLast24h = db.audit.filter(
      (entry) =>
        entry.eventType === "escalation" &&
        new Date(entry.at).getTime() >= Date.now() - 86400000 &&
        myOpportunityIds.has(entry.targetId),
    ).length;

    const maxOpenLeads = db.assignmentRules.maxOpenLeadsPerUser;
    const employeeAvailability = db.users.map((user) => {
      const openLeadCount = openLeadCountFor(user.id);
      return {
        userId: user.id,
        name: user.name,
        status: user.employeeStatus,
        openLeadCount,
        maxOpenLeads,
        isAvailable: user.employeeStatus === "available" && openLeadCount < maxOpenLeads,
      };
    });

    const upcomingAppointments = db.appointments
      .filter(
        (appointment) =>
          appointment.status === "scheduled" &&
          new Date(appointment.startsAt).getTime() >= Date.now() &&
          (scope === "company" || appointment.userId === me.id),
      )
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 5);

    const revenueStart = query.data.from ? new Date(query.data.from).getTime() : startOfMonth();
    const revenueEnd = query.data.to ? new Date(query.data.to).getTime() : Number.POSITIVE_INFINITY;
    let collectedRevenue = 0;
    for (const payment of db.payments) {
      if (payment.status === "failed") continue;
      if (!payment.paidAt) continue;
      const paidAt = new Date(payment.paidAt).getTime();
      if (paidAt < revenueStart || paidAt > revenueEnd) continue;
      if (scope === "personal") {
        const request = db.paymentRequests.find((candidate) => candidate.id === payment.paymentRequestId);
        const opportunity = request
          ? db.opportunities.find((candidate) => candidate.id === request.opportunityId)
          : undefined;
        if (!opportunity || opportunity.ownerId !== me.id) continue;
      }
      collectedRevenue += payment.amount - payment.refundedAmount;
    }

    const projectedRevenue = db.opportunities
      .filter((opportunity) => {
        if (!opportunityInScope(opportunity)) return false;
        const stage = db.pipelines
          .flatMap((pipeline) => pipeline.stages)
          .find((candidate) => candidate.id === opportunity.stageId);
        return Boolean(stage && !stage.isWon && !stage.isLost);
      })
      .reduce((sum, opportunity) => sum + (opportunity.value ?? 0), 0);

    return HttpResponse.json({
      scope,
      generatedAt: nowIso(),
      serverTime: nowIso(),
      newLeadsToday,
      openPipelineValueByStage,
      avgTimeToFirstResponseSeconds,
      recoveryQueueCount,
      escalationsLast24h,
      employeeAvailability,
      upcomingAppointments,
      collectedRevenueThisMonth: { amount: collectedRevenue, currency: "usd" },
      projectedRevenue: { amount: projectedRevenue, currency: "usd" },
    });
  }),

  http.get(`${env.apiUrl}/dashboard/preferences`, async () => {
    const auth = requireAuth();
    if (auth.response) return auth.response;
    await latency(80, 120);
    return HttpResponse.json({ widgets: getDb().dashboardPrefs });
  }),

  http.patch(`${env.apiUrl}/dashboard/preferences`, async ({ request }) => {
    const auth = requireAuth();
    if (auth.response) return auth.response;
    const body = await readBody(request, dashboardWidgetPreferencesSchema);
    if (!body.ok) return body.response;
    await latency(80, 120);
    const db = getDb();
    db.dashboardPrefs = { ...db.dashboardPrefs, ...body.data.widgets };
    saveDb();
    return HttpResponse.json({ widgets: db.dashboardPrefs });
  }),

  http.get(`${env.apiUrl}/integrations`, async () => {
    const auth = requireAuth("integrations.manage");
    if (auth.response) return auth.response;
    await latency();
    return HttpResponse.json(getDb().integrations);
  }),

  http.post(`${env.apiUrl}/integrations/:provider/connect`, async ({ request, params }) => {
    const auth = requireAuth("integrations.manage");
    if (auth.response) return auth.response;
    const provider = String(params.provider) as IntegrationProvider;
    if (!INTEGRATION_PROVIDERS.includes(provider)) {
      return errorResponse("not_found", "Unknown integration provider");
    }
    if (provider === "google_calendar") {
      return errorResponse("validation_failed", "Use the Google OAuth connect flow");
    }
    let accountLabel: string;
    if (provider === "twilio_whatsapp") {
      const body = await readBody(request, connectTwilioSchema);
      if (!body.ok) return body.response;
      accountLabel = body.data.whatsappFrom;
    } else if (provider === "stripe") {
      const body = await readBody(request, connectStripeSchema);
      if (!body.ok) return body.response;
      accountLabel = `acct_${body.data.secretKey.slice(-6)}`;
    } else {
      const body = await readBody(request, connectResendSchema);
      if (!body.ok) return body.response;
      accountLabel = body.data.fromEmail;
    }
    await latency(250, 350);
    const db = getDb();
    const integration = db.integrations.find((candidate) => candidate.provider === provider);
    if (!integration) return errorResponse("internal", "Integration state missing");
    integration.status = "connected";
    integration.accountLabel = accountLabel;
    integration.lastSuccessAt = nowIso();
    integration.lastErrorAt = null;
    integration.recentErrors = [];
    integration.updatedAt = nowIso();
    pushAudit({
      actorId: auth.user.id,
      actorType: "user",
      actorName: auth.user.name,
      eventType: "integration_change",
      targetType: "integration",
      targetId: provider,
      summary: `${provider} connected`,
      after: { accountLabel },
    });
    saveDb();
    return HttpResponse.json(integration);
  }),

  http.delete(`${env.apiUrl}/integrations/:provider`, async ({ params }) => {
    const auth = requireAuth("integrations.manage");
    if (auth.response) return auth.response;
    const provider = String(params.provider) as IntegrationProvider;
    const integration = getDb().integrations.find((candidate) => candidate.provider === provider);
    if (!integration) return errorResponse("not_found", "Unknown integration provider");
    await latency(150, 200);
    integration.status = "not_connected";
    integration.accountLabel = null;
    integration.recentErrors = [];
    integration.updatedAt = nowIso();
    pushAudit({
      actorId: auth.user.id,
      actorType: "user",
      actorName: auth.user.name,
      eventType: "integration_change",
      targetType: "integration",
      targetId: provider,
      summary: `${provider} disconnected`,
    });
    saveDb();
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${env.apiUrl}/integrations/:provider/events`, async ({ request, params }) => {
    const auth = requireAuth("integrations.manage");
    if (auth.response) return auth.response;
    const query = readQuery(request, paginationQuerySchema);
    if (!query.ok) return query.response;
    await latency();
    const provider = String(params.provider);
    const events = getDb()
      .integrationEvents.filter((event) => event.provider === provider)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return HttpResponse.json(paginate(events, query.data.page, query.data.pageSize));
  }),
];
