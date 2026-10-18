import { createServer } from "node:http";
import { createApp } from "./app";
import { env } from "./config/env";
import { startWorkers } from "./jobs/workers";
import { prisma } from "./lib/prisma";
import { connectRedis, redis } from "./lib/redis";
import { createSessionMiddleware } from "./middleware/session";
import { createRealtimeServer } from "./realtime/socket";
import { rearmAckTimers } from "./services/assignment";

async function main(): Promise<void> {
  await connectRedis();

  const sessionMiddleware = createSessionMiddleware();
  const app = createApp(sessionMiddleware);
  const httpServer = createServer(app);
  const io = createRealtimeServer(httpServer, sessionMiddleware);
  const workers = startWorkers();
  await rearmAckTimers().catch((error) => {
    console.error("[server] failed to re-arm ack timers", error);
  });

  httpServer.listen(env.PORT, () => {
    console.log(`[server] LeadFlow API listening on http://localhost:${env.PORT}`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] ${signal} received, shutting down`);

    io.close();
    httpServer.close();
    await workers.close().catch(() => undefined);
    await prisma.$disconnect();
    await redis.quit().catch(() => undefined);
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch((error) => {
  console.error("[server] failed to start", error);
  process.exit(1);
});
