import { WS_PATH, userRoom, workspaceRoom } from "@leadflow/shared";
import type { RequestHandler } from "express";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { setRealtimeServer } from "./io";

type SessionRequest = IncomingMessage & { session?: { userId?: string } };

type EngineMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void,
) => void;

export function createRealtimeServer(
  httpServer: HttpServer,
  sessionMiddleware: RequestHandler,
): Server {
  const io = new Server(httpServer, {
    path: WS_PATH,
    cors: { origin: env.APP_URL, credentials: true },
  });

  io.engine.use(sessionMiddleware as unknown as EngineMiddleware);

  io.use(async (socket, next) => {
    const request = socket.request as SessionRequest;
    const userId = request.session?.userId;

    if (!userId) {
      next(new Error("unauthorized"));
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, workspaceId: true },
    });

    if (!user) {
      next(new Error("unauthorized"));
      return;
    }

    await socket.join(workspaceRoom(user.workspaceId));
    await socket.join(userRoom(user.id));
    next();
  });

  setRealtimeServer(io);

  return io;
}
