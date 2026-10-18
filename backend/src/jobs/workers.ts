import { UnrecoverableError, Worker } from "bullmq";
import { bullConnection, type AckTimeoutJob, type OutboundJob } from "../lib/queues";
import { handleAckTimeout, rearmAckTimers } from "../services/assignment";
import { handleOutboundFailure, handleOutboundJob } from "../services/outbound";
import { ProviderError } from "../providers/errors";

export function startWorkers(): { close: () => Promise<void> } {
  const timerWorker = new Worker<AckTimeoutJob>(
    "lead-timers",
    async (job) => {
      await handleAckTimeout(job.data);
    },
    { connection: bullConnection, concurrency: 5 },
  );

  timerWorker.on("failed", (job, error) => {
    console.error(`[timers] job ${job?.id ?? "?"} failed`, error);
  });

  const outboundWorker = new Worker<OutboundJob>(
    "outbound",
    async (job) => {
      try {
        await handleOutboundJob(job.data);
      } catch (error) {
        if (error instanceof ProviderError && error.permanent) {
          throw new UnrecoverableError(error.message);
        }
        throw error;
      }
    },
    { connection: bullConnection, concurrency: 5 },
  );

  outboundWorker.on("failed", (job, error) => {
    if (!job) {
      return;
    }
    const attempts = job.opts.attempts ?? 1;
    const exhausted = (job.attemptsMade ?? 0) >= attempts;
    const permanent = error instanceof UnrecoverableError;
    if (exhausted || permanent) {
      void handleOutboundFailure(job.data, error).catch((failureError) => {
        console.error(`[outbound] failed to finalize job ${job.id ?? "?"}`, failureError);
      });
    }
  });

  void rearmAckTimers().catch((error) => {
    console.error("[timers] failed to re-arm acknowledgement timers", error);
  });

  return {
    close: async () => {
      await Promise.all([timerWorker.close(), outboundWorker.close()]);
    },
  };
}
