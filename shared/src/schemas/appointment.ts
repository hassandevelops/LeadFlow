import { z } from "zod";
import { appointmentStatusSchema, appointmentSyncStateSchema } from "../enums";
import { idSchema, isoDateSchema, timestampsSchema } from "./common";

export const busySlotSchema = z.object({
  startsAt: isoDateSchema,
  endsAt: isoDateSchema,
});
export type BusySlot = z.infer<typeof busySlotSchema>;

export const appointmentSchema = z
  .object({
    id: idSchema,
    workspaceId: idSchema,
    contactId: idSchema,
    opportunityId: idSchema.nullable(),
    userId: idSchema,
    title: z.string(),
    description: z.string().nullable(),
    startsAt: isoDateSchema,
    endsAt: isoDateSchema,
    timeZone: z.string(),
    status: appointmentStatusSchema,
    syncState: appointmentSyncStateSchema,
    googleEventId: z.string().nullable(),
    syncError: z.string().nullable(),
  })
  .merge(timestampsSchema);
export type Appointment = z.infer<typeof appointmentSchema>;

export const createAppointmentSchema = z
  .object({
    contactId: idSchema,
    opportunityId: idSchema.nullable().optional(),
    userId: idSchema,
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(1000).optional(),
    startsAt: isoDateSchema,
    endsAt: isoDateSchema,
    timeZone: z.string().trim().min(1).max(64),
  })
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const updateAppointmentSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  startsAt: isoDateSchema.optional(),
  endsAt: isoDateSchema.optional(),
  timeZone: z.string().trim().min(1).max(64).optional(),
  status: appointmentStatusSchema.optional(),
});
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
