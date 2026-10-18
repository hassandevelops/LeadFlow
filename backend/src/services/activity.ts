import type { Activity } from "@leadflow/shared";
import type { ActivityEntityType, ActivityType, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { toActivity } from "../lib/serialize";
import { emitToWorkspace } from "../realtime/io";

export type ActivityActor = { id: string | null; name: string };

export const SYSTEM_ACTOR: ActivityActor = { id: null, name: "System" };

export async function recordActivity(input: {
  workspaceId: string;
  entityType: ActivityEntityType;
  entityId: string;
  type: ActivityType;
  actor?: ActivityActor;
  summary: string;
  meta?: Record<string, unknown>;
}): Promise<Activity> {
  const actor = input.actor ?? SYSTEM_ACTOR;
  const row = await prisma.activity.create({
    data: {
      workspaceId: input.workspaceId,
      entityType: input.entityType,
      entityId: input.entityId,
      type: input.type,
      actorId: actor.id,
      actorName: actor.name,
      summary: input.summary,
      meta: (input.meta ?? {}) as Prisma.InputJsonValue,
    },
  });
  return toActivity(row);
}

export async function recordOpportunityActivity(input: {
  workspaceId: string;
  opportunityId: string;
  type: ActivityType;
  actor?: ActivityActor;
  summary: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await recordActivity({
    workspaceId: input.workspaceId,
    entityType: "opportunity",
    entityId: input.opportunityId,
    type: input.type,
    actor: input.actor,
    summary: input.summary,
    meta: input.meta,
  });
}

export function emitWorkspaceActivity(workspaceId: string, activity: Activity): void {
  void emitToWorkspace(workspaceId, "notification.created", {
    workspaceId,
    at: new Date().toISOString(),
    notificationId: activity.id,
    title: activity.summary,
    link: `/opportunities/${activity.entityId}`,
  });
}
