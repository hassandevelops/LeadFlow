import {
  serverEventSchemas,
  userRoom,
  workspaceRoom,
  type ServerEventPayloads,
} from "@leadflow/shared";
import type { Server } from "socket.io";

let io: Server | null = null;

export function setRealtimeServer(server: Server): void {
  io = server;
}

type EventName = keyof ServerEventPayloads;

function emit<K extends EventName>(room: string, event: K, payload: ServerEventPayloads[K]): void {
  if (!io) {
    return;
  }
  const parsed = serverEventSchemas[event].safeParse(payload);
  if (!parsed.success) {
    console.error(`[realtime] refusing to emit invalid ${event} payload`, parsed.error.issues);
    return;
  }
  io.to(room).emit(event, parsed.data);
}

export function emitToWorkspace<K extends EventName>(
  workspaceId: string,
  event: K,
  payload: ServerEventPayloads[K],
): void {
  emit(workspaceRoom(workspaceId), event, payload);
}

export function emitToUser<K extends EventName>(
  userId: string,
  event: K,
  payload: ServerEventPayloads[K],
): void {
  emit(userRoom(userId), event, payload);
}
