import type { EscalationLevel, RecoveryQueueItem } from "@leadflow/shared";
import type { AssignmentRules, Opportunity, Stage, User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { cancelAckTimeout, enqueueOutbound, scheduleAckTimeout } from "../lib/queues";
import { emitToUser, emitToWorkspace } from "../realtime/io";
import { userPermissions } from "../lib/serialize";
import { openLeadCountByUser } from "./leads";
import { recordOpportunityActivity, SYSTEM_ACTOR, type ActivityActor } from "./activity";
import { writeAudit } from "./audit";
import { ApiError } from "../lib/errors";

export type OpportunityWithStage = Opportunity & { stage: Stage };

export async function getAssignmentRules(workspaceId: string): Promise<AssignmentRules> {
  const existing = await prisma.assignmentRules.findUnique({ where: { workspaceId } });
  if (existing) {
    return existing;
  }
  return prisma.assignmentRules.create({ data: { workspaceId } });
}

function escalationLevelsOf(rules: AssignmentRules): EscalationLevel[] {
  const raw = rules.escalationLevels;
  return Array.isArray(raw) ? (raw as unknown as EscalationLevel[]) : [];
}

async function lastAssignmentByUser(
  workspaceId: string,
  userIds: string[],
): Promise<Map<string, Date>> {
  const result = new Map<string, Date>();
  if (userIds.length === 0) {
    return result;
  }
  const rows = await prisma.opportunity.groupBy({
    by: ["ownerId"],
    where: { workspaceId, ownerId: { in: userIds }, assignedAt: { not: null } },
    _max: { assignedAt: true },
  });
  for (const row of rows) {
    if (row.ownerId && row._max.assignedAt) {
      result.set(row.ownerId, row._max.assignedAt);
    }
  }
  return result;
}

export async function pickNextOwner(
  workspaceId: string,
  rules: AssignmentRules,
  exclude: string[] = [],
): Promise<User | null> {
  const candidates = await prisma.user.findMany({
    where: {
      workspaceId,
      employeeStatus: "available",
      id: { notIn: exclude },
    },
  });

  const withLeadsView = candidates.filter((user) => userPermissions(user).includes("leads.view"));
  if (withLeadsView.length === 0) {
    return null;
  }

  const counts = await openLeadCountByUser(
    workspaceId,
    withLeadsView.map((user) => user.id),
  );
  const eligible = withLeadsView.filter(
    (user) => (counts.get(user.id) ?? 0) < rules.maxOpenLeadsPerUser,
  );
  if (eligible.length === 0) {
    return null;
  }

  const lastAssigned = await lastAssignmentByUser(
    workspaceId,
    eligible.map((user) => user.id),
  );

  const epoch = new Date(0);
  eligible.sort((a, b) => {
    const lastA = lastAssigned.get(a.id) ?? epoch;
    const lastB = lastAssigned.get(b.id) ?? epoch;
    if (lastA.getTime() !== lastB.getTime()) {
      return lastA.getTime() - lastB.getTime();
    }
    const countA = counts.get(a.id) ?? 0;
    const countB = counts.get(b.id) ?? 0;
    if (countA !== countB) {
      return countA - countB;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return eligible[0] ?? null;
}

export type AssignmentKind = "initial" | "manual" | "escalation" | "absence";

export async function assignLeadOwner(params: {
  leadId: string;
  rules: AssignmentRules;
  owner: User | null;
  actor: ActivityActor | null;
  kind: AssignmentKind;
  summary?: string;
  level?: number;
  ackWindowSeconds?: number;
}): Promise<Opportunity | null> {
  const { leadId, owner, kind, actor } = params;
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Opportunity" WHERE id = ${leadId}::uuid FOR UPDATE
    `;
    if (rows.length === 0) {
      return null;
    }
    const current = await tx.opportunity.findUnique({ where: { id: leadId } });
    if (!current) {
      return null;
    }

    const acknowledgedAt = kind === "manual" ? null : current.acknowledgedAt;
    const ackWindowSeconds = params.ackWindowSeconds ?? params.rules.ackWindowSeconds;
    const ackDeadlineAt =
      owner && !acknowledgedAt ? new Date(now.getTime() + ackWindowSeconds * 1000) : null;

    return tx.opportunity.update({
      where: { id: leadId },
      data: {
        ownerId: owner?.id ?? null,
        assignedAt: owner ? now : current.assignedAt,
        ackDeadlineAt,
        acknowledgedAt,
        ...(kind === "manual" ? { escalationCount: 0 } : {}),
        ...(kind === "escalation" ? { escalationCount: { increment: 1 } } : {}),
      },
    });
  });

  if (!updated) {
    return null;
  }

  await cancelAckTimeout(updated.id);
  if (updated.ownerId && updated.ackDeadlineAt && !updated.acknowledgedAt) {
    await scheduleAckTimeout(
      { workspaceId: updated.workspaceId, leadId: updated.id },
      updated.ackDeadlineAt,
    );
  }

  const ownerName = owner?.name ?? null;
  const activityType = kind === "escalation" ? "escalation" : kind === "initial" ? "assignment" : "reassignment";
  const defaultSummary =
    kind === "initial"
      ? `Assigned to ${ownerName ?? "nobody"} by round-robin`
      : kind === "escalation"
        ? `Escalated to ${ownerName ?? "the recovery queue"}`
        : kind === "absence"
          ? `Reassigned (owner away) to ${ownerName ?? "the recovery queue"}`
          : `Reassigned to ${ownerName ?? "nobody"}`;

  await recordOpportunityActivity({
    workspaceId: updated.workspaceId,
    opportunityId: updated.id,
    type: activityType,
    actor: actor ?? SYSTEM_ACTOR,
    summary: params.summary ?? defaultSummary,
  });

  await writeAudit({
    workspaceId: updated.workspaceId,
    actor: actor && actor.id ? { id: actor.id, name: actor.name } : null,
    eventType: kind === "initial" ? "assignment" : kind === "escalation" ? "escalation" : "reassignment",
    targetType: "opportunity",
    targetId: updated.id,
    summary: params.summary ?? defaultSummary,
  });

  if (updated.ownerId && updated.ackDeadlineAt) {
    emitToWorkspace(updated.workspaceId, "lead.assigned", {
      workspaceId: updated.workspaceId,
      at: new Date().toISOString(),
      leadId: updated.id,
      ownerId: updated.ownerId,
      ackDeadlineAt: updated.ackDeadlineAt.toISOString(),
    });
  }

  if (kind === "escalation") {
    emitToWorkspace(updated.workspaceId, "lead.escalated", {
      workspaceId: updated.workspaceId,
      at: new Date().toISOString(),
      leadId: updated.id,
      newOwnerId: updated.ownerId,
      reason: params.summary ?? defaultSummary,
      level: params.level ?? updated.escalationCount,
    });
  }

  return updated;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }
  if (seconds < 3600) {
    const minutes = Math.round(seconds / 60);
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const hours = Math.round(seconds / 3600);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

export async function handleAckTimeout(job: { workspaceId: string; leadId: string }): Promise<void> {
  const lead = await prisma.opportunity.findUnique({
    where: { id: job.leadId },
    include: { stage: true },
  });
  if (!lead || lead.workspaceId !== job.workspaceId) {
    return;
  }
  if (lead.acknowledgedAt || lead.stage.isWon || lead.stage.isLost) {
    return;
  }
  if (!lead.ackDeadlineAt) {
    return;
  }
  if (lead.ackDeadlineAt.getTime() > Date.now()) {
    await scheduleAckTimeout(job, lead.ackDeadlineAt);
    return;
  }
  await escalateLead(lead);
}

export async function escalateLead(lead: OpportunityWithStage): Promise<void> {
  const workspaceId = lead.workspaceId;
  const rules = await getAssignmentRules(workspaceId);
  const levels = escalationLevelsOf(rules);
  const levelNumber = lead.escalationCount + 1;
  const configured = levels[levelNumber - 1];
  const previousWindow =
    levelNumber === 1 ? rules.ackWindowSeconds : (levels[levelNumber - 2]?.timeoutSeconds ?? rules.ackWindowSeconds);
  const reason = `Not acknowledged within ${formatDuration(previousWindow)}`;

  const exclude = lead.ownerId ? [lead.ownerId] : [];

  let target: User | null = null;
  let ackWindowSeconds = rules.ackWindowSeconds;

  if (configured) {
    ackWindowSeconds = configured.timeoutSeconds ?? rules.ackWindowSeconds;
    if (configured.targetUserId) {
      target = await prisma.user.findFirst({
        where: { id: configured.targetUserId, workspaceId },
      });
      if (!target || target.id === lead.ownerId) {
        target = await pickNextOwner(workspaceId, rules, exclude);
      }
    } else {
      target = await pickNextOwner(workspaceId, rules, exclude);
    }
  } else {
    target = await pickNextOwner(workspaceId, rules, exclude);
    if (!target && rules.backupUserId) {
      target = await prisma.user.findFirst({
        where: { id: rules.backupUserId, workspaceId },
      });
    }
    if (!target && rules.managerUserId) {
      target = await prisma.user.findFirst({
        where: { id: rules.managerUserId, workspaceId },
      });
    }
  }

  const updated = await assignLeadOwner({
    leadId: lead.id,
    rules,
    owner: target,
    actor: null,
    kind: "escalation",
    summary: target ? `${reason} — escalated to ${target.name}` : `${reason} — returned to the recovery queue`,
    level: levelNumber,
    ackWindowSeconds,
  });

  if (updated && target) {
    const escalatedTo = target;
    emitToUser(escalatedTo.id, "notification.created", {
      workspaceId,
      at: new Date().toISOString(),
      notificationId: updated.id,
      title: `Lead escalated to you: ${updated.title}`,
      link: `/opportunities/${updated.id}`,
    });

    await enqueueOutbound({
      kind: "escalation_email",
      workspaceId,
      leadId: updated.id,
      ownerId: escalatedTo.id,
      reason,
      level: levelNumber,
    }).catch((error) => {
      console.error("[assignment] failed to enqueue escalation email", error);
    });
  }
}

export async function acknowledgeLead(params: {
  workspaceId: string;
  leadId: string;
  actor: { id: string; name: string; permissions: string[] };
}): Promise<Opportunity> {
  const lead = await prisma.opportunity.findFirst({
    where: { id: params.leadId, workspaceId: params.workspaceId },
  });
  if (!lead) {
    throw ApiError.notFound("Lead not found");
  }
  const isAssignee = lead.ownerId === params.actor.id;
  if (!isAssignee && !params.actor.permissions.includes("leads.view")) {
    throw ApiError.forbidden("Only the assignee can acknowledge this lead");
  }
  if (lead.acknowledgedAt) {
    throw ApiError.conflict("Lead already acknowledged");
  }

  const now = new Date();
  const updated = await prisma.opportunity.update({
    where: { id: lead.id },
    data: { acknowledgedAt: now, lastActionAt: now },
  });

  const actor: ActivityActor = { id: params.actor.id, name: params.actor.name };
  await recordOpportunityActivity({
    workspaceId: params.workspaceId,
    opportunityId: lead.id,
    type: "acknowledgement",
    actor,
    summary: "Lead acknowledged",
  });

  await writeAudit({
    workspaceId: params.workspaceId,
    actor: { id: params.actor.id, name: params.actor.name },
    eventType: "acknowledgement",
    targetType: "opportunity",
    targetId: lead.id,
    summary: `Lead “${lead.title}” acknowledged`,
  });

  emitToWorkspace(params.workspaceId, "lead.acknowledged", {
    workspaceId: params.workspaceId,
    at: now.toISOString(),
    leadId: lead.id,
    ownerId: params.actor.id,
  });

  return updated;
}

export async function touchLead(workspaceId: string, leadId: string): Promise<void> {
  const lead = await prisma.opportunity.findFirst({
    where: { id: leadId, workspaceId },
    select: { id: true, acknowledgedAt: true },
  });
  if (!lead) {
    return;
  }
  await prisma.opportunity.update({
    where: { id: lead.id },
    data: {
      lastActionAt: new Date(),
      ...(lead.acknowledgedAt ? {} : { acknowledgedAt: new Date() }),
    },
  });
}

export async function reassignAbsentUserLeads(
  workspaceId: string,
  absentUserId: string,
  handling: "reassign_unacknowledged" | "reassign_all",
): Promise<number> {
  const rules = await getAssignmentRules(workspaceId);
  const absent = await prisma.user.findFirst({ where: { id: absentUserId, workspaceId } });
  if (!absent) {
    return 0;
  }

  const leads = await prisma.opportunity.findMany({
    where: {
      workspaceId,
      ownerId: absentUserId,
      stage: { isWon: false, isLost: false },
      ...(handling === "reassign_unacknowledged" ? { acknowledgedAt: null } : {}),
    },
  });

  let moved = 0;
  for (const lead of leads) {
    let target = await pickNextOwner(workspaceId, rules, [absentUserId]);
    if (!target && rules.backupUserId) {
      target = await prisma.user.findFirst({ where: { id: rules.backupUserId, workspaceId } });
    }
    if (!target && rules.managerUserId) {
      target = await prisma.user.findFirst({ where: { id: rules.managerUserId, workspaceId } });
    }
    await assignLeadOwner({
      leadId: lead.id,
      rules,
      owner: target,
      actor: null,
      kind: "absence",
      summary: target
        ? `Reassigned to ${target.name} because ${absent.name} is away`
        : `Returned to the recovery queue because ${absent.name} is away`,
    });
    moved += 1;
  }
  return moved;
}

function recoveryReasonFor(
  lead: OpportunityWithStage,
  rules: AssignmentRules,
  now: Date,
): RecoveryQueueItem["reason"] | null {
  if (lead.stage.isWon || lead.stage.isLost) {
    return null;
  }
  if (lead.ackDeadlineAt && !lead.acknowledgedAt && lead.ackDeadlineAt.getTime() < now.getTime()) {
    return "unacknowledged";
  }
  if (lead.escalationCount >= 2) {
    return "escalated_twice";
  }
  const baseline = lead.lastActionAt ?? lead.assignedAt ?? lead.createdAt;
  if (now.getTime() - baseline.getTime() > rules.idleThresholdSeconds * 1000) {
    return "idle";
  }
  return null;
}

export async function recoveryQueueItems(
  workspaceId: string,
): Promise<{ items: RecoveryQueueItem[]; total: number }> {
  const rules = await getAssignmentRules(workspaceId);
  const now = new Date();
  const leads = await prisma.opportunity.findMany({
    where: { workspaceId, stage: { isWon: false, isLost: false } },
    include: { stage: true, owner: { select: { name: true } } },
  });

  const items: RecoveryQueueItem[] = [];
  for (const lead of leads) {
    const reason = recoveryReasonFor(lead, rules, now);
    if (!reason) {
      continue;
    }
    items.push({
      leadId: lead.id,
      title: lead.title,
      source: lead.source,
      ownerId: lead.ownerId,
      ownerName: lead.owner?.name ?? null,
      reason,
      ackDeadlineAt: lead.ackDeadlineAt?.toISOString() ?? null,
      escalationCount: lead.escalationCount,
      assignedAt: lead.assignedAt?.toISOString() ?? null,
      lastActionAt: lead.lastActionAt?.toISOString() ?? null,
    });
  }

  items.sort((a, b) => {
    const deadlineA = a.ackDeadlineAt ? new Date(a.ackDeadlineAt).getTime() : Number.MAX_SAFE_INTEGER;
    const deadlineB = b.ackDeadlineAt ? new Date(b.ackDeadlineAt).getTime() : Number.MAX_SAFE_INTEGER;
    if (deadlineA !== deadlineB) {
      return deadlineA - deadlineB;
    }
    return (a.assignedAt ?? "").localeCompare(b.assignedAt ?? "");
  });

  return { items, total: items.length };
}

export async function rearmAckTimers(): Promise<void> {
  const leads = await prisma.opportunity.findMany({
    where: {
      acknowledgedAt: null,
      ownerId: { not: null },
      ackDeadlineAt: { not: null },
      stage: { isWon: false, isLost: false },
    },
    select: { id: true, workspaceId: true, ackDeadlineAt: true },
    take: 2000,
  });
  for (const lead of leads) {
    if (lead.ackDeadlineAt) {
      await scheduleAckTimeout(
        { workspaceId: lead.workspaceId, leadId: lead.id },
        lead.ackDeadlineAt,
      );
    }
  }
  if (leads.length > 0) {
    console.log(`[timers] re-armed ${leads.length} acknowledgement timers`);
  }
}
