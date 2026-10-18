import { z } from "zod";
import { dashboardScopeSchema, dashboardWidgetKeySchema } from "../enums";
import { appointmentSchema } from "./appointment";
import { isoDateSchema, moneySchema } from "./common";
import { availabilitySchema } from "./user";

export const dashboardQuerySchema = z.object({
  scope: dashboardScopeSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export const openPipelineValueRowSchema = z.object({
  stageId: z.string(),
  stageName: z.string(),
  value: z.number().nonnegative().nullable(),
  valueHidden: z.boolean(),
  count: z.number().int().min(0),
});
export type OpenPipelineValueRow = z.infer<typeof openPipelineValueRowSchema>;

export const dashboardMetricsSchema = z.object({
  scope: dashboardScopeSchema,
  generatedAt: isoDateSchema,
  serverTime: isoDateSchema,
  newLeadsToday: z.number().int().min(0),
  openPipelineValueByStage: z.array(openPipelineValueRowSchema),
  avgTimeToFirstResponseSeconds: z.number().nullable(),
  recoveryQueueCount: z.number().int().min(0),
  escalationsLast24h: z.number().int().min(0),
  employeeAvailability: z.array(availabilitySchema),
  upcomingAppointments: z.array(appointmentSchema),
  collectedRevenueThisMonth: moneySchema,
  projectedRevenue: moneySchema,
});
export type DashboardMetrics = z.infer<typeof dashboardMetricsSchema>;

export const dashboardWidgetPreferencesSchema = z.object({
  widgets: z.record(dashboardWidgetKeySchema, z.boolean()),
});
export type DashboardWidgetPreferences = z.infer<typeof dashboardWidgetPreferencesSchema>;
