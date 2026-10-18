import {
  DASHBOARD_WIDGET_KEYS,
  dashboardQuerySchema,
  dashboardWidgetPreferencesSchema,
  type DashboardMetrics,
  type DashboardWidgetKey,
} from "@leadflow/shared";
import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { canViewValue } from "../lib/access";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { toAppointment } from "../lib/serialize";
import { parseBody, parseQuery } from "../lib/validation";
import { authOf, requireAuth } from "../middleware/auth";
import { recoveryQueueItems } from "../services/assignment";

export const dashboardRouter = Router();

function defaultWidgets(): Record<DashboardWidgetKey, boolean> {
  return Object.fromEntries(DASHBOARD_WIDGET_KEYS.map((key) => [key, true])) as Record<
    DashboardWidgetKey,
    boolean
  >;
}

dashboardRouter.get("/dashboard", requireAuth, async (req, res) => {
  const auth = authOf(req);
  const { workspaceId, user } = auth;
  const query = parseQuery(dashboardQuerySchema, req);

  const canCompany = auth.permissions.includes("dashboard.company_view");
  if (query.scope === "company" && !canCompany) {
    throw ApiError.forbidden("Missing permission: dashboard.company_view");
  }
  const scope = query.scope ?? (canCompany ? "company" : "personal");
  const personal = scope === "personal";
  const seesValue = canViewValue(auth);

  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const rangeStart = query.from ? new Date(query.from) : null;
  const rangeEnd = query.to ? new Date(query.to) : null;

  const opportunityWhere: Prisma.OpportunityWhereInput = {
    workspaceId,
    ...(personal ? { ownerId: user.id } : {}),
  };

  const [opportunities, allOwnership] = await Promise.all([
    prisma.opportunity.findMany({
      where: opportunityWhere,
      include: { stage: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.opportunity.findMany({
      where: { workspaceId },
      select: { ownerId: true, stage: { select: { isWon: true, isLost: true } } },
    }),
  ]);

  const openOwned = opportunities.filter((row) => !row.stage.isWon && !row.stage.isLost);

  const newLeadsToday = opportunities.filter((row) => row.createdAt >= todayStart).length;

  const stageRows = new Map<string, { stageId: string; stageName: string; value: number; count: number }>();
  for (const row of openOwned) {
    const entry = stageRows.get(row.stageId) ?? {
      stageId: row.stageId,
      stageName: row.stage.name,
      value: 0,
      count: 0,
    };
    entry.value += Number(row.value ?? 0);
    entry.count += 1;
    stageRows.set(row.stageId, entry);
  }
  const openPipelineValueByStage = [...stageRows.values()].map((row) => ({
    stageId: row.stageId,
    stageName: row.stageName,
    value: seesValue ? row.value : null,
    valueHidden: !seesValue,
    count: row.count,
  }));

  const opportunityIds = opportunities.map((row) => row.id);
  const activities =
    opportunityIds.length === 0
      ? []
      : await prisma.activity.findMany({
          where: {
            workspaceId,
            entityType: "opportunity",
            entityId: { in: opportunityIds },
            type: { in: ["assignment", "acknowledgement"] },
          },
          orderBy: { at: "asc" },
        });

  const responseTimes: number[] = [];
  for (const opportunity of opportunities) {
    if (rangeStart && opportunity.createdAt < rangeStart) continue;
    if (rangeEnd && opportunity.createdAt > rangeEnd) continue;
    const entries = activities.filter((entry) => entry.entityId === opportunity.id);
    const assignment = entries.find(
      (entry) =>
        entry.type === "assignment" &&
        opportunity.assignedAt !== null &&
        entry.at >= opportunity.assignedAt,
    );
    if (!assignment) continue;
    const acknowledgement = entries.find(
      (entry) => entry.type === "acknowledgement" && entry.at >= assignment.at,
    );
    if (!acknowledgement) continue;
    responseTimes.push((acknowledgement.at.getTime() - assignment.at.getTime()) / 1000);
  }
  const avgTimeToFirstResponseSeconds =
    responseTimes.length > 0
      ? responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length
      : null;

  const recovery = await recoveryQueueItems(workspaceId);
  const recoveryQueueCount = recovery.items.filter(
    (item) => !personal || item.ownerId === user.id,
  ).length;

  const escalationsLast24h = await prisma.auditEntry.count({
    where: {
      workspaceId,
      eventType: "escalation",
      targetType: "opportunity",
      at: { gte: new Date(now.getTime() - 86400000) },
      ...(personal ? { targetId: { in: opportunityIds } } : {}),
    },
  });

  const [users, rules] = await Promise.all([
    prisma.user.findMany({ where: { workspaceId }, orderBy: { name: "asc" } }),
    prisma.assignmentRules.findUnique({ where: { workspaceId } }),
  ]);
  const maxOpenLeads = rules?.maxOpenLeadsPerUser ?? 10;
  const openCounts = new Map<string, number>();
  for (const row of allOwnership) {
    if (!row.ownerId || row.stage.isWon || row.stage.isLost) continue;
    openCounts.set(row.ownerId, (openCounts.get(row.ownerId) ?? 0) + 1);
  }
  const employeeAvailability = users.map((member) => {
    const openLeadCount = openCounts.get(member.id) ?? 0;
    return {
      userId: member.id,
      name: member.name,
      status: member.employeeStatus,
      openLeadCount,
      maxOpenLeads,
      isAvailable: member.employeeStatus === "available" && openLeadCount < maxOpenLeads,
    };
  });

  const upcomingAppointments = await prisma.appointment.findMany({
    where: {
      workspaceId,
      status: "scheduled",
      startsAt: { gte: now },
      ...(personal ? { userId: user.id } : {}),
    },
    orderBy: { startsAt: "asc" },
    take: 5,
  });

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const payments = await prisma.payment.findMany({
    where: {
      workspaceId,
      status: { not: "failed" },
      paidAt: {
        gte: rangeStart ?? monthStart,
        ...(rangeEnd ? { lte: rangeEnd } : {}),
      },
    },
    include: { paymentRequest: { include: { opportunity: { select: { ownerId: true } } } } },
  });
  const collectedRevenue = payments
    .filter((payment) => !personal || payment.paymentRequest.opportunity.ownerId === user.id)
    .reduce((sum, payment) => sum + Number(payment.amount) - Number(payment.refundedAmount), 0);

  const pendingRequests = await prisma.paymentRequest.findMany({
    where: {
      workspaceId,
      status: "pending",
      ...(personal ? { opportunity: { ownerId: user.id } } : {}),
    },
    select: { amount: true },
  });
  const openOpportunityValue = openOwned.reduce((sum, row) => sum + Number(row.value ?? 0), 0);
  const projectedRevenue =
    openOpportunityValue + pendingRequests.reduce((sum, row) => sum + Number(row.amount), 0);

  const metrics: DashboardMetrics = {
    scope,
    generatedAt: now.toISOString(),
    serverTime: now.toISOString(),
    newLeadsToday,
    openPipelineValueByStage,
    avgTimeToFirstResponseSeconds,
    recoveryQueueCount,
    escalationsLast24h,
    employeeAvailability,
    upcomingAppointments: upcomingAppointments.map(toAppointment),
    collectedRevenueThisMonth: { amount: collectedRevenue, currency: "usd" },
    projectedRevenue: { amount: projectedRevenue, currency: "usd" },
  };

  res.json(metrics);
});

dashboardRouter.get("/dashboard/preferences", requireAuth, async (req, res) => {
  const { workspaceId, user } = authOf(req);
  const row = await prisma.dashboardPreference.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  const stored = (row?.widgets ?? {}) as Record<string, boolean>;
  res.json({ widgets: { ...defaultWidgets(), ...stored } });
});

dashboardRouter.patch("/dashboard/preferences", requireAuth, async (req, res) => {
  const { workspaceId, user } = authOf(req);
  const input = parseBody(dashboardWidgetPreferencesSchema, req);
  const existing = await prisma.dashboardPreference.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  const merged = { ...((existing?.widgets ?? {}) as Record<string, boolean>), ...input.widgets };

  await prisma.dashboardPreference.upsert({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    create: { workspaceId, userId: user.id, widgets: merged },
    update: { widgets: merged },
  });

  res.json({ widgets: { ...defaultWidgets(), ...merged } });
});
