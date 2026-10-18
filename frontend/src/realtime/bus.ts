import { SOCKET_EVENTS, serverEventSchemas, type ServerEvent } from "@leadflow/shared";
import { env } from "../lib/env";
import { getSocket } from "../lib/socket";

export type ServerEventListener = (event: string, payload: unknown) => void;

export function subscribeServerEvents(listener: ServerEventListener): () => void {
  if (env.enableMocks) {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void import("../mocks/realtime").then((module) => {
      if (cancelled) return;
      unsubscribe = module.subscribeServerEvents(listener);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }

  const socket = getSocket();
  const bound = Object.values(SOCKET_EVENTS).map((event) => {
    const handler = (payload: unknown) => listener(event, payload);
    socket.on(event, handler);
    return { event, handler };
  });
  return () => {
    for (const { event, handler } of bound) socket.off(event, handler);
  };
}

export function parseServerEvent(event: string, payload: unknown): ServerEvent | null {
  const schema = serverEventSchemas[event as keyof typeof serverEventSchemas];
  if (!schema) return null;
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return null;
  return { event, payload: parsed.data } as ServerEvent;
}
