import { z } from "zod";
import { integrationProviderSchema, integrationStatusSchema } from "../enums";
import { emailSchema, idSchema, isoDateSchema } from "./common";

export const integrationErrorSchema = z.object({
  at: isoDateSchema,
  message: z.string(),
});
export type IntegrationError = z.infer<typeof integrationErrorSchema>;

export const integrationStateSchema = z.object({
  provider: integrationProviderSchema,
  status: integrationStatusSchema,
  accountLabel: z.string().nullable(),
  lastSuccessAt: isoDateSchema.nullable(),
  lastErrorAt: isoDateSchema.nullable(),
  recentErrors: z.array(integrationErrorSchema).max(5),
  capabilities: z.array(z.string()),
  limitsNote: z.string(),
  updatedAt: isoDateSchema,
});
export type IntegrationState = z.infer<typeof integrationStateSchema>;

export const connectTwilioSchema = z.object({
  accountSid: z.string().trim().min(10).max(64),
  authToken: z.string().trim().min(10).max(64),
  whatsappFrom: z.string().trim().min(6).max(32),
});
export type ConnectTwilioInput = z.infer<typeof connectTwilioSchema>;

export const connectStripeSchema = z.object({
  secretKey: z.string().trim().min(10).max(200),
  webhookSecret: z.string().trim().min(10).max(200),
});
export type ConnectStripeInput = z.infer<typeof connectStripeSchema>;

export const connectResendSchema = z.object({
  apiKey: z.string().trim().min(8).max(200),
  fromEmail: emailSchema,
});
export type ConnectResendInput = z.infer<typeof connectResendSchema>;

export const INTEGRATION_EVENT_RESULTS = ["success", "failure", "rejected"] as const;
export const integrationEventResultSchema = z.enum(INTEGRATION_EVENT_RESULTS);
export type IntegrationEventResult = z.infer<typeof integrationEventResultSchema>;

export const integrationEventSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  provider: integrationProviderSchema,
  direction: z.enum(["inbound", "outbound"]),
  eventType: z.string(),
  reference: z.string().nullable(),
  result: integrationEventResultSchema,
  errorMessage: z.string().nullable(),
  createdAt: isoDateSchema,
});
export type IntegrationEvent = z.infer<typeof integrationEventSchema>;
