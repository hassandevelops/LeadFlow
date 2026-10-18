import type { Prisma } from "@prisma/client";
import { randomToken, slugify } from "../lib/strings";

export async function uniqueWorkspaceSlug(tx: Prisma.TransactionClient, name: string): Promise<string> {
  const base = slugify(name);

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = await tx.workspace.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing) {
      return candidate;
    }
  }

  return `${base}-${randomToken(4).toLowerCase()}`;
}
