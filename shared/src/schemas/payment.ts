import { z } from "zod";
import { paymentRequestStatusSchema, paymentStatusSchema } from "../enums";
import { idSchema, timestampsSchema } from "./common";

export const paymentRequestSchema = z
  .object({
    id: idSchema,
    workspaceId: idSchema,
    opportunityId: idSchema,
    contactId: idSchema,
    amount: z.number().nonnegative(),
    currency: z.string().length(3),
    status: paymentRequestStatusSchema,
    provider: z.literal("stripe"),
    providerRef: z.string().nullable(),
    checkoutUrl: z.string().nullable(),
    requestedByUserId: idSchema,
  })
  .merge(timestampsSchema);
export type PaymentRequest = z.infer<typeof paymentRequestSchema>;

export const paymentSchema = z
  .object({
    id: idSchema,
    workspaceId: idSchema,
    paymentRequestId: idSchema,
    amount: z.number().nonnegative(),
    currency: z.string().length(3),
    status: paymentStatusSchema,
    providerRef: z.string(),
    paidAt: z.string().nullable(),
    refundedAmount: z.number().nonnegative(),
  })
  .merge(timestampsSchema);
export type Payment = z.infer<typeof paymentSchema>;

export const createPaymentRequestSchema = z.object({
  amount: z.number().positive().max(1000000),
  currency: z.string().length(3).toLowerCase().default("usd"),
  description: z.string().trim().max(500).optional(),
});
export type CreatePaymentRequestInput = z.infer<typeof createPaymentRequestSchema>;
