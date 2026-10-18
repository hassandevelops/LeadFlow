import {
  createLeadSchema,
  paginationQuerySchema,
  reassignLeadSchema,
  updateAssignmentRulesSchema,
} from "@leadflow/shared";
import type { AssignmentRules } from "@prisma/client";
import { Router } from "express";
import { canViewValue, actorOf } from "../lib/access";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { toOpportunity } from "../lib/serialize";
import { parseBody, parseIdParam, parseQuery } from "../lib/validation";
import { authOf, requireAuth, requirePermission } from "../middleware/auth";
import {
  acknowledgeLead,
  assignLeadOwner,
  getAssignmentRules,
  recoveryQueueItems,
} from "../services/assignment";
import { intakeLeadFromInput } from "../services/lead-intake";

export const leadsRouter = Router();

function serializeRules(rules: AssignmentRules) {
  return {
    mode: rules.mode,
    maxOpenLeadsPerUser: rules.maxOpenLeadsPerUser,
    ackWindowSeconds: rules.ackWindowSeconds,
    escalationLevels: Array.isArray(rules.escalationLevels) ? rules.escalationLevels : [],
    backupUserId: rules.backupUserId,
    managerUserId: rules.managerUserId,
    idleThresholdSeconds: rules.idleThresholdSeconds,
    absenceHandling: rules.absenceHandling,
  };
}

leadsRouter.post("/leads", requirePermission("crm.create"), async (req, res) => {
  const auth = authOf(req);
  const input = parseBody(createLeadSchema, req);

  const { opportunity } = await intakeLeadFromInput({
    workspaceId: auth.workspaceId,
    actor: actorOf(auth),
    input,
  });

  res.status(201).json(toOpportunity(opportunity, canViewValue(auth)));
});

leadsRouter.post("/leads/:id/acknowledge", requireAuth, async (req, res) => {
  const auth = authOf(req);
  const leadId = parseIdParam(req);

  const updated = await acknowledgeLead({
    workspaceId: auth.workspaceId,
    leadId,
    actor: { id: auth.user.id, name: auth.user.name, permissions: auth.permissions },
  });

  res.json(toOpportunity(updated, canViewValue(auth)));
});

leadsRouter.post("/leads/:id/reassign", requirePermission("leads.assign"), async (req, res) => {
  const auth = authOf(req);
  const { workspaceId } = auth;
  const leadId = parseIdParam(req);
  const input = parseBody(reassignLeadSchema, req);

  const lead = await prisma.opportunity.findFirst({ where: { id: leadId, workspaceId } });
  if (!lead) {
    throw ApiError.notFound("Lead not found");
  }

  const target = await prisma.user.findFirst({ where: { id: input.toUserId, workspaceId } });
  if (!target) {
    throw ApiError.validationFailed("Target user not found in this workspace", [
      { path: "toUserId", message: "Unknown user" },
    ]);
  }

  const rules = await getAssignmentRules(workspaceId);
  const updated = await assignLeadOwner({
    leadId: lead.id,
    rules,
    owner: target,
    actor: actorOf(auth),
    kind: "manual",
    summary: input.reason ? `Reassigned to ${target.name}: ${input.reason}` : `Reassigned to ${target.name}`,
  });

  res.json(toOpportunity(updated ?? lead, canViewValue(auth)));
});

leadsRouter.get("/recovery-queue", requirePermission("leads.view"), async (req, res) => {
  const { workspaceId } = authOf(req);
  const query = parseQuery(paginationQuerySchema, req);
  const { items, total } = await recoveryQueueItems(workspaceId);
  const start = (query.page - 1) * query.pageSize;

  res.json({
    data: items.slice(start, start + query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
    total,
  });
});

leadsRouter.get("/assignment-rules", requirePermission("assignment.manage_rules"), async (req, res) => {
  const { workspaceId } = authOf(req);
  const rules = await getAssignmentRules(workspaceId);
  res.json(serializeRules(rules));
});

leadsRouter.patch("/assignment-rules", requirePermission("assignment.manage_rules"), async (req, res) => {
  const { workspaceId, user } = authOf(req);
  const input = parseBody(updateAssignmentRulesSchema, req);
  const existing = await getAssignmentRules(workspaceId);

  const memberIds = [input.backupUserId, input.managerUserId]
    .concat((input.escalationLevels ?? []).map((level) => level.targetUserId ?? undefined))
    .filter((value): value is string => typeof value === "string");

  if (memberIds.length > 0) {
    const members = await prisma.user.count({
      where: { workspaceId, id: { in: memberIds } },
    });
    if (members !== new Set(memberIds).size) {
      throw ApiError.validationFailed("All referenced users must be members of this workspace", [
        { path: "backupUserId", message: "Unknown user referenced in assignment rules" },
      ]);
    }
  }

  const updated = await prisma.assignmentRules.update({
    where: { id: existing.id },
    data: {
      ...(input.mode === undefined ? {} : { mode: input.mode }),
      ...(input.maxOpenLeadsPerUser === undefined ? {} : { maxOpenLeadsPerUser: input.maxOpenLeadsPerUser }),
      ...(input.ackWindowSeconds === undefined ? {} : { ackWindowSeconds: input.ackWindowSeconds }),
      ...(input.escalationLevels === undefined ? {} : { escalationLevels: input.escalationLevels }),
      ...(input.backupUserId === undefined ? {} : { backupUserId: input.backupUserId }),
      ...(input.managerUserId === undefined ? {} : { managerUserId: input.managerUserId }),
      ...(input.idleThresholdSeconds === undefined ? {} : { idleThresholdSeconds: input.idleThresholdSeconds }),
      ...(input.absenceHandling === undefined ? {} : { absenceHandling: input.absenceHandling }),
    },
  });

  await prisma.auditEntry.create({
    data: {
      workspaceId,
      actorId: user.id,
      actorType: "user",
      actorName: user.name,
      eventType: "config_change",
      targetType: "assignment_rules",
      targetId: updated.id,
      summary: "Assignment rules updated",
      before: serializeRules(existing),
      after: serializeRules(updated),
    },
  });

  res.json(serializeRules(updated));
});
