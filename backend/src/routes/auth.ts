import {
  loginSchema,
  presetPermissions,
  signupSchema,
} from "@leadflow/shared";
import type { User } from "@prisma/client";
import { Router } from "express";
import { ApiError } from "../lib/errors";
import { equalizeVerifyTiming, hashPassword, verifyPassword } from "../lib/passwords";
import { prisma } from "../lib/prisma";
import { toSessionUser } from "../lib/serialize";
import { parseBody } from "../lib/validation";
import { requireAuth, authOf } from "../middleware/auth";
import { loginRateLimit, signupRateLimit } from "../middleware/rate-limit";
import { endSession, startSession } from "../middleware/session";
import { uniqueWorkspaceSlug } from "../services/workspaces";

export const authRouter = Router();

authRouter.post("/auth/signup", signupRateLimit, async (req, res) => {
  const input = parseBody(signupSchema, req);

  const existing = await prisma.user.findFirst({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) {
    throw ApiError.conflict("An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);

  const { user, workspace } = await prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        name: input.companyName,
        slug: await uniqueWorkspaceSlug(tx, input.companyName),
      },
    });

    const user = await tx.user.create({
      data: {
        workspaceId: workspace.id,
        name: input.name,
        email: input.email,
        passwordHash,
        role: "owner",
        permissions: presetPermissions("owner"),
        employeeStatus: "available",
      },
    });

    await tx.assignmentRules.create({
      data: {
        workspaceId: workspace.id,
        backupUserId: user.id,
        managerUserId: user.id,
        idleThresholdSeconds: 604800,
      },
    });

    const pipeline = await tx.pipeline.create({
      data: { workspaceId: workspace.id, name: "Sales Pipeline", isDefault: true },
    });

    await tx.stage.createMany({
      data: [
        { pipelineId: pipeline.id, name: "New Lead", order: 0 },
        { pipelineId: pipeline.id, name: "Qualified", order: 1 },
        { pipelineId: pipeline.id, name: "Won", order: 2, isWon: true },
        { pipelineId: pipeline.id, name: "Lost", order: 3, isLost: true },
      ],
    });

    return { user, workspace };
  });

  await startSession(req, user.id);
  res.status(201).json(toSessionUser(user, workspace));
});

authRouter.post("/auth/login", loginRateLimit, async (req, res) => {
  const input = parseBody(loginSchema, req);

  const candidates = await prisma.user.findMany({
    where: { email: input.email },
    take: 5,
  });

  let user: User | null = null;
  if (candidates.length === 0) {
    await equalizeVerifyTiming(input.password);
  } else {
    for (const candidate of candidates) {
      if (await verifyPassword(candidate.passwordHash, input.password)) {
        user = candidate;
        break;
      }
    }
  }

  if (!user) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: user.workspaceId } });
  await startSession(req, user.id);
  res.json(toSessionUser(user, workspace));
});

authRouter.post("/auth/logout", async (req, res) => {
  await endSession(req, res);
  res.status(204).end();
});

authRouter.get("/auth/me", requireAuth, (req, res) => {
  const { user, workspace } = authOf(req);
  res.json(toSessionUser(user, workspace));
});
