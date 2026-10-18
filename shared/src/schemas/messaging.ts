import { z } from "zod";
import { conversationChannelSchema, messageDirectionSchema, messageStatusSchema } from "../enums";
import { idSchema, timestampsSchema } from "./common";

export const conversationSchema = z
  .object({
    id: idSchema,
    workspaceId: idSchema,
    contactId: idSchema,
    channel: conversationChannelSchema,
    assignedUserId: idSchema.nullable(),
    lastMessageAt: z.string().nullable(),
    unreadCount: z.number().int().min(0),
  })
  .merge(timestampsSchema);
export type Conversation = z.infer<typeof conversationSchema>;

export const messageSchema = z
  .object({
    id: idSchema,
    workspaceId: idSchema,
    conversationId: idSchema,
    direction: messageDirectionSchema,
    body: z.string(),
    status: messageStatusSchema,
    providerMessageId: z.string().nullable(),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
  })
  .merge(timestampsSchema);
export type Message = z.infer<typeof messageSchema>;

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(4096),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
