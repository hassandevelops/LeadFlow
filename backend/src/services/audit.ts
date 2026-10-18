import type { AuditEventType } from "@leadflow/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export type AuditActor = {
  id: string;
  name: string;
} | null;

export type AuditInput = {
  workspaceId: string;
  actor: AuditActor;
  eventType: AuditEventType;
  targetType: string;
  targetId: string;
  summary: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
};

export async function writeAudit(input: AuditInput): Promise<void> {
  await prisma.auditEntry.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.actor?.id ?? null,
      actorType: input.actor ? "user" : "system",
      actorName: input.actor?.name ?? "System",
      eventType: input.eventType,
      targetType: input.targetType,
      targetId: input.targetId,
      summary: input.summary,
      before: input.before,
      after: input.after,
    },
  });
}
