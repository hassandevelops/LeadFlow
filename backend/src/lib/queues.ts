import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "../config/env";

export const bullConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export interface AckTimeoutJob {
  workspaceId: string;
  leadId: string;
}

export type OutboundJob =
  | { kind: "whatsapp_send"; workspaceId: string; messageId: string }
  | {
      kind: "escalation_email";
      workspaceId: string;
      leadId: string;
      ownerId: string;
      reason: string;
      level: number;
    }
  | {
      kind: "calendar_sync";
      workspaceId: string;
      appointmentId: string;
      action: "create" | "update" | "delete";
      userId?: string;
      googleEventId?: string | null;
    };

export const leadTimersQueue = new Queue<AckTimeoutJob>("lead-timers", {
  connection: bullConnection,
});

export const outboundQueue = new Queue<OutboundJob>("outbound", {
  connection: bullConnection,
});

export async function scheduleAckTimeout(job: AckTimeoutJob, runAt: Date): Promise<void> {
  const jobId = `lead-ack-${job.leadId}`;
  const existing = await leadTimersQueue.getJob(jobId);
  if (existing) {
    await existing.remove().catch(() => undefined);
  }
  await leadTimersQueue.add("ack-timeout", job, {
    jobId,
    delay: Math.max(0, runAt.getTime() - Date.now()),
    removeOnComplete: true,
    removeOnFail: true,
  });
}

export async function cancelAckTimeout(leadId: string): Promise<void> {
  const existing = await leadTimersQueue.getJob(`lead-ack-${leadId}`);
  if (existing) {
    await existing.remove().catch(() => undefined);
  }
}

export async function enqueueOutbound(
  job: OutboundJob,
  options?: { delayMs?: number },
): Promise<void> {
  await outboundQueue.add(job.kind, job, {
    delay: options?.delayMs ?? 0,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  });
}
