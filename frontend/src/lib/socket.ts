import { io, type Socket } from "socket.io-client";
import { env } from "./env";

let socket: Socket | null = null;

export function getSocket(): Socket {
  socket ??= io(env.wsUrl, {
    path: env.wsPath,
    withCredentials: true,
    autoConnect: false,
  });
  return socket;
}

export function connectSocket(): Socket {
  const instance = getSocket();
  if (!instance.connected) instance.connect();
  return instance;
}

export function disconnectSocket(): void {
  socket?.disconnect();
}
