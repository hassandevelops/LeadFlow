import { z } from "zod";

export const ROLES = ["owner", "admin", "user"] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const EMPLOYEE_STATUSES = ["available", "busy", "on_leave", "offline"] as const;
export const employeeStatusSchema = z.enum(EMPLOYEE_STATUSES);
export type EmployeeStatus = z.infer<typeof employeeStatusSchema>;

export const LEAD_SOURCES = ["web_form", "whatsapp", "manual"] as const;
export const leadSourceSchema = z.enum(LEAD_SOURCES);
export type LeadSource = z.infer<typeof leadSourceSchema>;

export const CUSTOM_FIELD_TYPES = ["text", "number", "date", "dropdown", "checkbox"] as const;
export const customFieldTypeSchema = z.enum(CUSTOM_FIELD_TYPES);
export type CustomFieldType = z.infer<typeof customFieldTypeSchema>;

export const CUSTOM_FIELD_ENTITIES = ["contact", "opportunity"] as const;
export const customFieldEntitySchema = z.enum(CUSTOM_FIELD_ENTITIES);
export type CustomFieldEntity = z.infer<typeof customFieldEntitySchema>;

export const MESSAGE_DIRECTIONS = ["inbound", "outbound"] as const;
export const messageDirectionSchema = z.enum(MESSAGE_DIRECTIONS);
export type MessageDirection = z.infer<typeof messageDirectionSchema>;

export const MESSAGE_STATUSES = ["queued", "sent", "delivered", "failed", "received"] as const;
export const messageStatusSchema = z.enum(MESSAGE_STATUSES);
export type MessageStatus = z.infer<typeof messageStatusSchema>;

export const PAYMENT_REQUEST_STATUSES = [
  "pending",
  "paid",
  "expired",
  "abandoned",
  "failed",
] as const;
export const paymentRequestStatusSchema = z.enum(PAYMENT_REQUEST_STATUSES);
export type PaymentRequestStatus = z.infer<typeof paymentRequestStatusSchema>;

export const PAYMENT_STATUSES = ["succeeded", "refunded", "partially_refunded", "failed"] as const;
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const APPOINTMENT_STATUSES = ["scheduled", "cancelled"] as const;
export const appointmentStatusSchema = z.enum(APPOINTMENT_STATUSES);
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

export const APPOINTMENT_SYNC_STATES = ["pending", "synced", "failed", "needs_reconnect"] as const;
export const appointmentSyncStateSchema = z.enum(APPOINTMENT_SYNC_STATES);
export type AppointmentSyncState = z.infer<typeof appointmentSyncStateSchema>;

export const INTEGRATION_PROVIDERS = [
  "twilio_whatsapp",
  "stripe",
  "google_calendar",
  "resend",
] as const;
export const integrationProviderSchema = z.enum(INTEGRATION_PROVIDERS);
export type IntegrationProvider = z.infer<typeof integrationProviderSchema>;

export const INTEGRATION_STATUSES = ["not_connected", "connected", "error"] as const;
export const integrationStatusSchema = z.enum(INTEGRATION_STATUSES);
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;

export const RECOVERY_REASONS = ["unacknowledged", "escalated_twice", "idle"] as const;
export const recoveryReasonSchema = z.enum(RECOVERY_REASONS);
export type RecoveryReason = z.infer<typeof recoveryReasonSchema>;

export const ACTIVITY_TYPES = [
  "created",
  "note",
  "call",
  "stage_change",
  "assignment",
  "acknowledgement",
  "escalation",
  "reassignment",
  "field_edit",
  "message",
  "payment",
  "appointment",
  "deletion",
] as const;
export const activityTypeSchema = z.enum(ACTIVITY_TYPES);
export type ActivityType = z.infer<typeof activityTypeSchema>;

export const AUDIT_EVENT_TYPES = [
  "assignment",
  "acknowledgement",
  "escalation",
  "reassignment",
  "role_change",
  "permission_change",
  "config_change",
  "integration_change",
  "deletion",
] as const;
export const auditEventTypeSchema = z.enum(AUDIT_EVENT_TYPES);
export type AuditEventType = z.infer<typeof auditEventTypeSchema>;

export const ACTOR_TYPES = ["user", "system"] as const;
export const actorTypeSchema = z.enum(ACTOR_TYPES);
export type ActorType = z.infer<typeof actorTypeSchema>;

export const ASSIGNMENT_MODES = ["round_robin"] as const;
export const assignmentModeSchema = z.enum(ASSIGNMENT_MODES);
export type AssignmentMode = z.infer<typeof assignmentModeSchema>;

export const CONVERSATION_CHANNELS = ["whatsapp"] as const;
export const conversationChannelSchema = z.enum(CONVERSATION_CHANNELS);
export type ConversationChannel = z.infer<typeof conversationChannelSchema>;

export const DASHBOARD_SCOPES = ["personal", "company"] as const;
export const dashboardScopeSchema = z.enum(DASHBOARD_SCOPES);
export type DashboardScope = z.infer<typeof dashboardScopeSchema>;

export const DASHBOARD_WIDGET_KEYS = [
  "new_leads_today",
  "open_pipeline_value",
  "avg_time_to_first_response",
  "recovery_queue",
  "escalations_24h",
  "employee_availability",
  "upcoming_appointments",
  "collected_revenue",
] as const;
export const dashboardWidgetKeySchema = z.enum(DASHBOARD_WIDGET_KEYS);
export type DashboardWidgetKey = z.infer<typeof dashboardWidgetKeySchema>;
