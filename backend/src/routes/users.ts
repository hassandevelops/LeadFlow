import {
  availabilitySchema,
  inviteUserSchema,
  paginationQuerySchema,
  presetPermissions,
  updateEmployeeStatusSchema,
  updateUserPermissionsSchema,
  updateUserRoleSchema,
  type RolePreset,
} from "@leadflow/shared";
import { Router } from "express";
import { isProduction } from "../config/env";
import { ApiError } from "../lib/errors";
import { hashPassword } from "../lib/passwords";
import { prisma } from "../lib/prisma";
import { parseSort } from "../lib/query";
import { toPublicUser, userPermissions } from "../lib/serialize";
import { randomToken } from "../lib/strings";
import { parseBody, parseIdParam, parseQuery } from "../lib/validation";
import { authOf, requireAnyPermission, requireAuth, requirePermission } from "../middleware/auth";
import { writeAudit } from "../services/audit";
import { getAssignmentRules, reassignAbsentUserLeads } from "../services/assignment";
import { openLeadCountByUser, openLeadCountForUser } from "../services/leads";

export const usersRouter = Router();

const USER_SORT_FIELDS = ["name", "email", "role", "createdAt"] as const;

usersRouter.get("/users", requireAnyPermission(["users.manage", "leads.view"]), async (req, res) => {
  const { workspaceId } = authOf(req);
  const query = parseQuery(paginationQuerySchema, req);
  const orderBy = parseSort(query.sort, USER_SORT_FIELDS, "name");

  const where = query.q
    ? {
        workspaceId,
        OR: [
          { name: { contains: query.q, mode: "insensitive" as const } },
          { email: { contains: query.q, mode: "insensitive" as const } },
        ],
      }
    : { workspaceId };

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  const counts = await openLeadCountByUser(
    workspaceId,
    users.map((user) => user.id),
  );

  res.json({
    data: users.map((user) => toPublicUser(user, counts.get(user.id) ?? 0)),
    page: query.page,
    pageSize: query.pageSize,
    total,
  });
});

usersRouter.post("/users/invite", requirePermission("users.manage"), async (req, res) => {
  const { user: actor, workspaceId } = authOf(req);
  const input = parseBody(inviteUserSchema, req);

  if (input.role === "owner") {
    throw ApiError.conflict("A workspace can have only one Owner", { reason: "owner_exists" });
  }

  const existing = await prisma.user.findFirst({
    where: { workspaceId, email: input.email },
    select: { id: true },
  });
  if (existing) {
    throw ApiError.conflict("A user with this email already exists");
  }

  const temporaryPassword = randomToken(9);
  const passwordHash = await hashPassword(temporaryPassword);
  const permissions = input.permissions ?? presetPermissions(input.role as RolePreset);

  const created = await prisma.user.create({
    data: {
      workspaceId,
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      permissions,
      employeeStatus: "offline",
    },
  });

  await writeAudit({
    workspaceId,
    actor: { id: actor.id, name: actor.name },
    eventType: "role_change",
    targetType: "user",
    targetId: created.id,
    summary: `Invited ${created.name} as ${created.role}`,
    after: { role: created.role, permissions },
  });

  if (!isProduction) {
    console.log(`[invite] ${created.email} temporary password: ${temporaryPassword}`);
  }

  res.status(201).json(toPublicUser(created, 0));
});

usersRouter.patch("/users/:id/role", requirePermission("users.manage"), async (req, res) => {
  const { user: actor, workspaceId } = authOf(req);
  const targetId = parseIdParam(req);
  const input = parseBody(updateUserRoleSchema, req);

  const target = await prisma.user.findFirst({ where: { id: targetId, workspaceId } });
  if (!target) {
    throw ApiError.notFound("User not found");
  }

  if (target.role === "owner" && actor.role !== "owner") {
    throw ApiError.forbidden("Admins cannot modify the Owner", { reason: "cannot_modify_owner" });
  }
  if (target.id === actor.id) {
    throw ApiError.conflict("You cannot change your own role");
  }
  if (input.role === "owner") {
    throw ApiError.conflict("A workspace can have only one Owner", { reason: "owner_exists" });
  }

  const permissions = input.permissions ?? presetPermissions(input.role as RolePreset);
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { role: input.role, permissions },
  });

  await writeAudit({
    workspaceId,
    actor: { id: actor.id, name: actor.name },
    eventType: "role_change",
    targetType: "user",
    targetId: updated.id,
    summary: `Role changed for ${updated.name}: ${target.role} → ${updated.role}`,
    before: { role: target.role, permissions: userPermissions(target) },
    after: { role: updated.role, permissions },
  });

  res.json(toPublicUser(updated, await openLeadCountForUser(workspaceId, updated.id)));
});

usersRouter.patch("/users/:id/permissions", requirePermission("users.manage"), async (req, res) => {
  const { user: actor, workspaceId } = authOf(req);
  const targetId = parseIdParam(req);
  const input = parseBody(updateUserPermissionsSchema, req);

  const target = await prisma.user.findFirst({ where: { id: targetId, workspaceId } });
  if (!target) {
    throw ApiError.notFound("User not found");
  }

  if (target.role === "owner" && actor.role !== "owner") {
    throw ApiError.forbidden("Admins cannot modify the Owner", { reason: "cannot_modify_owner" });
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { permissions: input.permissions },
  });

  await writeAudit({
    workspaceId,
    actor: { id: actor.id, name: actor.name },
    eventType: "permission_change",
    targetType: "user",
    targetId: updated.id,
    summary: `Permissions updated for ${updated.name}`,
    before: { permissions: userPermissions(target) },
    after: { permissions: input.permissions },
  });

  res.json(toPublicUser(updated, await openLeadCountForUser(workspaceId, updated.id)));
});

usersRouter.patch("/users/me/status", requireAuth, async (req, res) => {
  const { user, workspaceId } = authOf(req);
  const input = parseBody(updateEmployeeStatusSchema, req);

  const previous = user.employeeStatus;
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { employeeStatus: input.status },
  });

  if (input.status !== "available" && previous === "available") {
    const rules = await getAssignmentRules(workspaceId);
    await reassignAbsentUserLeads(workspaceId, user.id, rules.absenceHandling);
  }

  res.json(toPublicUser(updated, await openLeadCountForUser(workspaceId, updated.id)));
});

usersRouter.get("/availability", requirePermission("leads.view"), async (req, res) => {
  const { workspaceId } = authOf(req);

  const [users, rules] = await Promise.all([
    prisma.user.findMany({ where: { workspaceId }, orderBy: { name: "asc" } }),
    prisma.assignmentRules.findUnique({ where: { workspaceId } }),
  ]);

  const maxOpenLeads = rules?.maxOpenLeadsPerUser ?? 10;
  const counts = await openLeadCountByUser(
    workspaceId,
    users.map((user) => user.id),
  );

  const availability = users.map((user) => {
    const openLeadCount = counts.get(user.id) ?? 0;
    return {
      userId: user.id,
      name: user.name,
      status: user.employeeStatus,
      openLeadCount,
      maxOpenLeads,
      isAvailable: user.employeeStatus === "available" && openLeadCount < maxOpenLeads,
    };
  });

  res.json(availabilitySchema.array().parse(availability));
});
