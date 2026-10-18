import { createSavedListSchema } from "@leadflow/shared";
import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { toSavedList } from "../lib/serialize";
import { parseBody } from "../lib/validation";
import { authOf, requirePermission } from "../middleware/auth";

export const savedListsRouter = Router();

savedListsRouter.get("/saved-lists", requirePermission("crm.view"), async (req, res) => {
  const { workspaceId } = authOf(req);
  const rows = await prisma.savedList.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
  });
  res.json(rows.map(toSavedList));
});

savedListsRouter.post("/saved-lists", requirePermission("crm.view"), async (req, res) => {
  const { workspaceId, user } = authOf(req);
  const input = parseBody(createSavedListSchema, req);

  const savedList = await prisma.savedList.create({
    data: {
      workspaceId,
      name: input.name,
      entity: input.entity,
      filter: input.filter as Prisma.InputJsonValue,
      createdBy: user.id,
    },
  });

  res.status(201).json(toSavedList(savedList));
});
