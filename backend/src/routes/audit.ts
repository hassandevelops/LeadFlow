import { auditQuerySchema } from "@leadflow/shared";
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { toAuditEntry } from "../lib/serialize";
import { parseQuery } from "../lib/validation";
import { authOf, requirePermission } from "../middleware/auth";

export const auditRouter = Router();

auditRouter.get("/audit", requirePermission("audit.view"), async (req, res) => {
  const { workspaceId } = authOf(req);
  const query = parseQuery(auditQuerySchema, req);

  const where = {
    workspaceId,
    ...(query.eventType ? { eventType: query.eventType } : {}),
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.from || query.to
      ? {
          at: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.auditEntry.count({ where }),
    prisma.auditEntry.findMany({
      where,
      orderBy: { at: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  res.json({ data: rows.map(toAuditEntry), page: query.page, pageSize: query.pageSize, total });
});
