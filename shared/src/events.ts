import { z } from "zod";
import { leadSourceSchema } from "./enums";
import { idSchema, isoDateSchema } from "./schemas/common";

export const workspaceRoom = (workspaceId: string) => `workspace:${workspaceId}`;
export const userRoom = (userId: string) => `user:${userId}`;

export const SOCKET_EVENTS = {
  leadCreated: "lead.created",
  leadAssigned: "lead.assigned",
  leadEscalated: "lead.escalated",
  leadAcknowledged: "lead.acknowledged",
  messageReceived: "message.received",
  messageStatusUpdated: "message.status_updated",
  paymentUpdated: "payment.updated",
  appointmentUpdated: "appointment.updated",
  notificationCreated: "notification.created",
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

const base = {
  workspaceId: idSchema,
  at: isoDateSchema,
};

export const leadCreatedEventSchema = z.object({
  ...base,
  leadId: idSchema,
  source: leadSourceSchema,
});

export const leadAssignedEventSchema = z.object({
  ...base,
  leadId: idSchema,
  ownerId: idSchema,
  ackDeadlineAt: isoDateSchema,
});

export const leadEscalatedEventSchema = z.object({
  ...base,
  leadId: idSchema,
  newOwnerId: idSchema.nullable(),
  reason: z.string(),
  level: z.number().int().min(1),
});

export const leadAcknowledgedEventSchema = z.object({
  ...base,
  leadId: idSchema,
  ownerId: idSchema,
});

export const messageReceivedEventSchema = z.object({
  ...base,
  conversationId: idSchema,
  messageId: idSchema,
  contactId: idSchema,
});

export const messageStatusUpdatedEventSchema = z.object({
  ...base,
  messageId: idSchema,
  status: z.string(),
});

export const paymentUpdatedEventSchema = z.object({
  ...base,
  paymentRequestId: idSchema,
  status: z.string(),
});

export const appointmentUpdatedEventSchema = z.object({
  ...base,
  appointmentId: idSchema,
  status: z.string(),
});

export const notificationCreatedEventSchema = z.object({
  ...base,
  notificationId: idSchema,
  title: z.string(),
  link: z.string(),
});

export const serverEventSchemas = {
  [SOCKET_EVENTS.leadCreated]: leadCreatedEventSchema,
  [SOCKET_EVENTS.leadAssigned]: leadAssignedEventSchema,
  [SOCKET_EVENTS.leadEscalated]: leadEscalatedEventSchema,
  [SOCKET_EVENTS.leadAcknowledged]: leadAcknowledgedEventSchema,
  [SOCKET_EVENTS.messageReceived]: messageReceivedEventSchema,
  [SOCKET_EVENTS.messageStatusUpdated]: messageStatusUpdatedEventSchema,
  [SOCKET_EVENTS.paymentUpdated]: paymentUpdatedEventSchema,
  [SOCKET_EVENTS.appointmentUpdated]: appointmentUpdatedEventSchema,
  [SOCKET_EVENTS.notificationCreated]: notificationCreatedEventSchema,
} as const;

export type ServerEventPayloads = {
  [K in keyof typeof serverEventSchemas]: z.infer<(typeof serverEventSchemas)[K]>;
};

export type ServerEvent = {
  [K in keyof ServerEventPayloads]: {
    event: K;
    payload: ServerEventPayloads[K];
  };
}[keyof ServerEventPayloads];
