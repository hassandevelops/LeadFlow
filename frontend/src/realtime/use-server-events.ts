import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { SOCKET_EVENTS } from "@leadflow/shared";
import { useAuth } from "../auth/use-auth";
import { useToast } from "../components/ui/toast";
import { parseServerEvent, subscribeServerEvents } from "./bus";

export function useServerEvents(): void {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { show } = useToast();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;

    const invalidate = (...keys: QueryKey[]) => {
      for (const key of keys) void queryClient.invalidateQueries({ queryKey: key });
    };

    return subscribeServerEvents((name, raw) => {
      const event = parseServerEvent(name, raw);
      if (!event) return;

      switch (event.event) {
        case SOCKET_EVENTS.leadCreated:
          invalidate(["opportunities"], ["leads"], ["dashboard"]);
          break;
        case SOCKET_EVENTS.leadAssigned: {
          invalidate(["opportunities"], ["leads"], ["dashboard"], ["audit"]);
          if (event.payload.ownerId === userId) {
            show({
              title: "New lead assigned to you",
              description: "Acknowledge it before the countdown expires.",
            });
          }
          break;
        }
        case SOCKET_EVENTS.leadEscalated: {
          invalidate(["opportunities"], ["leads"], ["dashboard"], ["audit"]);
          if (event.payload.newOwnerId === userId) {
            show({
              title: "Lead escalated to you",
              description: event.payload.reason,
              variant: "error",
            });
          }
          break;
        }
        case SOCKET_EVENTS.leadAcknowledged:
          invalidate(["opportunities"], ["leads"], ["dashboard"]);
          break;
        case SOCKET_EVENTS.messageReceived:
          invalidate(["conversations"], ["contacts"]);
          break;
        case SOCKET_EVENTS.messageStatusUpdated:
          invalidate(["conversations"]);
          break;
        case SOCKET_EVENTS.paymentUpdated:
          invalidate(
            ["payment-requests"],
            ["payments"],
            ["opportunities"],
            ["contacts"],
            ["dashboard"],
          );
          break;
        case SOCKET_EVENTS.appointmentUpdated:
          invalidate(["appointments"], ["contacts"]);
          break;
        case SOCKET_EVENTS.notificationCreated:
          invalidate(["dashboard"], ["leads"]);
          break;
      }
    });
  }, [userId, queryClient, show]);
}
