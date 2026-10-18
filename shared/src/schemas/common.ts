import { z } from "zod";

export const idSchema = z.string().uuid();
export const isoDateSchema = z.string().datetime({ offset: true });

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const phoneSchema = z.string().trim().min(5).max(32);
export const tagSchema = z.string().trim().min(1).max(40);

export const timestampsSchema = z.object({
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type Timestamps = z.infer<typeof timestampsSchema>;

export const customFieldsSchema = z.record(z.unknown());
export type CustomFields = z.infer<typeof customFieldsSchema>;

export const tagsSchema = z.array(tagSchema).max(20);
export type Tags = z.infer<typeof tagsSchema>;

export const moneySchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().length(3).toLowerCase(),
});
export type Money = z.infer<typeof moneySchema>;
