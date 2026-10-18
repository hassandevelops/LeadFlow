import { prisma } from "../lib/prisma";

export async function openLeadCountByUser(
  workspaceId: string,
  userIds: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (userIds.length === 0) {
    return counts;
  }

  const rows = await prisma.opportunity.groupBy({
    by: ["ownerId"],
    where: {
      workspaceId,
      ownerId: { in: [...userIds] },
      stage: { isWon: false, isLost: false },
    },
    _count: { _all: true },
  });

  for (const row of rows) {
    if (row.ownerId) {
      counts.set(row.ownerId, row._count._all);
    }
  }

  return counts;
}

export async function openLeadCountForUser(workspaceId: string, userId: string): Promise<number> {
  const counts = await openLeadCountByUser(workspaceId, [userId]);
  return counts.get(userId) ?? 0;
}
