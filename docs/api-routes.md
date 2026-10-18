# API routes

Single index of every endpoint. **Update this table in the same PR that adds or changes an endpoint.** Schema names refer to exports from `@leadflow/shared`.

Conventions: `/api/v1` prefix, cookie session, CSRF header on non-GET, error envelope per `docs/conventions.md`. Permission column = server-enforced.

## Auth

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| POST | `/auth/signup` | public | `signupSchema` | `sessionUserSchema` (creates workspace, user becomes Owner) |
| POST | `/auth/login` | public, rate-limited | `loginSchema` | `sessionUserSchema` |
| POST | `/auth/logout` | session | — | 204 |
| GET | `/auth/me` | session | — | `sessionUserSchema` |
| GET | `/time` | public | — | `{ serverTime }` |

## Users, roles, availability

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/users` | `users.manage` or `leads.view` | `paginationQuerySchema` | `pageSchema(publicUserSchema)` |
| POST | `/users/invite` | `users.manage` | `inviteUserSchema` | `publicUserSchema` |
| PATCH | `/users/:id/role` | `users.manage` (Admin cannot modify Owner, F1.2) | `updateUserRoleSchema` | `publicUserSchema` |
| PATCH | `/users/:id/permissions` | `users.manage` | `updateUserPermissionsSchema` | `publicUserSchema` |
| PATCH | `/users/me/status` | session (self) | `updateEmployeeStatusSchema` | `publicUserSchema` |
| GET | `/availability` | `leads.view` | — | `availabilitySchema[]` |

## CRM — companies, contacts, opportunities

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/companies` | `crm.view` | `paginationQuerySchema` | `pageSchema(companySchema)` |
| POST | `/companies` | `crm.create` | `createCompanySchema` | `companySchema` |
| GET/PATCH/DELETE | `/companies/:id` | `crm.view` / `crm.edit` / `crm.delete` | `updateCompanySchema` | `companySchema` / 204 |
| GET | `/contacts` | `crm.view` | `contactListQuerySchema` | `pageSchema(contactSchema)` |
| POST | `/contacts` | `crm.create` | `createContactSchema` | `contactSchema` |
| GET/PATCH/DELETE | `/contacts/:id` | `crm.view` / `crm.edit` / `crm.delete` | `updateContactSchema` | `contactSchema` / 204 |
| GET | `/contacts/:id/full` | `crm.view` | — | `contactFullViewSchema` (F2.8: conversations, opportunities, payments, appointments, activity) |
| GET | `/contacts/:id/timeline` | `crm.view` | `paginationQuerySchema` | `pageSchema(activitySchema)` |
| GET | `/opportunities` | `crm.view` | `opportunityFilterSchema` | `pageSchema(opportunitySchema)` |
| POST | `/opportunities` | `crm.create` | `createOpportunitySchema` | `opportunitySchema` |
| GET/PATCH/DELETE | `/opportunities/:id` | `crm.view` / `crm.edit` / `crm.delete` | `updateOpportunitySchema` | `opportunitySchema` / 204 |
| PATCH | `/opportunities/:id/stage` | `crm.edit` | `moveStageSchema` (blocked if stage-required fields missing, F2.4) | `opportunitySchema` |
| POST | `/opportunities/:id/notes` | `crm.edit` | `createNoteSchema` | `activitySchema` |
| GET | `/opportunities/export` | `crm.export` | `opportunityFilterSchema` | CSV (value column only with `crm.view_value`) |
| GET/POST | `/saved-lists` | `crm.view` | `createSavedListSchema` | `savedListSchema` |

## Pipelines and custom fields

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/pipelines` | `crm.view` | — | `pipelineSchema[]` (with stages) |
| POST | `/pipelines` | `crm.edit` | `createPipelineSchema` | `pipelineSchema` |
| PATCH/DELETE | `/pipelines/:id` | `crm.edit` | `updatePipelineSchema` | `pipelineSchema` / 204 |
| POST | `/pipelines/:id/stages` | `crm.edit` | `createStageSchema` | `stageSchema` |
| PATCH/DELETE | `/stages/:id` | `crm.edit` (delete must handle opportunities safely, F2.5) | `updateStageSchema` | `stageSchema` / 204 |
| PATCH | `/pipelines/:id/stages/order` | `crm.edit` | `reorderStagesSchema` | `stageSchema[]` |
| GET | `/custom-fields` | `crm.view` | `entity` query | `customFieldDefinitionSchema[]` |
| POST | `/custom-fields` | `crm.edit` | `createCustomFieldSchema` | `customFieldDefinitionSchema` |
| PATCH/DELETE | `/custom-fields/:id` | `crm.edit` | `updateCustomFieldSchema` | `customFieldDefinitionSchema` / 204 |

## Leads, assignment, escalation

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| POST | `/leads` | `crm.create` | `createLeadSchema` (manual entry, F3.1) | `opportunitySchema` |
| POST | `/public/forms/:workspaceSlug/leads` | public (rate-limited), F3.1 | `webFormLeadSchema` | 201 |
| POST | `/leads/:id/acknowledge` | assignee or `leads.view` | — | `opportunitySchema` |
| POST | `/leads/:id/reassign` | `leads.assign` | `reassignLeadSchema` | `opportunitySchema` |
| GET | `/recovery-queue` | `leads.view` | `paginationQuerySchema` | `pageSchema(recoveryQueueItemSchema)` (F3.7) |
| GET/PATCH | `/assignment-rules` | `assignment.manage_rules` | `assignmentRulesSchema` | `assignmentRulesSchema` (F3.3) |

## Messaging (Twilio WhatsApp)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/conversations` | `crm.view` | `paginationQuerySchema` | `pageSchema(conversationSchema)` |
| GET | `/conversations/:id/messages` | `crm.view` | `paginationQuerySchema` | `pageSchema(messageSchema)` |
| POST | `/conversations/:id/messages` | `crm.edit` | `sendMessageSchema` | `messageSchema` (status `queued` or `failed` with reason, I1.7) |
| POST | `/conversations/:id/messages/:messageId/retry` | `crm.edit` | — | `messageSchema` |
| PATCH | `/contacts/:id/opt-out` | `crm.edit` | `{ optedOut: boolean }` | `contactSchema` (I1.9) |

Provider webhooks (public, signature-verified, idempotent):

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/webhooks/twilio/whatsapp` | inbound messages (I1.1, I1.2, I1.5, I1.8) |
| POST | `/api/webhooks/twilio/status` | delivery status callbacks (I1.4) |

## Payments (Stripe)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| POST | `/opportunities/:id/payment-requests` | `crm.edit` | `createPaymentRequestSchema` | `paymentRequestSchema` (I2.1) |
| GET | `/payment-requests` | `crm.view` | `paginationQuerySchema` | `pageSchema(paymentRequestSchema)` |
| GET | `/payments` | `crm.view` | `paginationQuerySchema` | `pageSchema(paymentSchema)` |
| POST | `/api/webhooks/stripe` | public, signature-verified (I2.2–I2.5) | raw body | 200 |

## Calendar (Google OAuth 2.0)

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/api/integrations/google/connect` | `integrations.manage` or self | — | 302 to Google consent (I3.1) |
| GET | `/api/integrations/google/callback` | — | OAuth code | 302 back to app |
| DELETE | `/api/integrations/google` | self or `integrations.manage` | — | 204 (I3.1) |
| GET | `/users/:id/busy` | `crm.view` | `from`, `to` | `busySlotSchema[]` (I3.4) |
| GET | `/appointments` | `crm.view` | `paginationQuerySchema` + `userId`, `from`, `to` | `pageSchema(appointmentSchema)` |
| POST | `/appointments` | `crm.edit` (fails clearly if employee has no calendar, I3.7) | `createAppointmentSchema` | `appointmentSchema` |
| PATCH/DELETE | `/appointments/:id` | `crm.edit` | `updateAppointmentSchema` | `appointmentSchema` / 204 (I3.6) |

## Audit, dashboard, integrations

| Method | Path | Permission | Request | Response |
|---|---|---|---|---|
| GET | `/audit` | `audit.view` | `auditQuerySchema` | `pageSchema(auditEntrySchema)` (F4.2) |
| GET | `/dashboard` | session | `dashboardQuerySchema` (scope auto: personal for User, company for Owner/Admin/manager preset) | `dashboardMetricsSchema` (F5.4) |
| GET/PATCH | `/dashboard/preferences` | session | `dashboardWidgetPreferencesSchema` | same (F5.5) |
| GET | `/integrations` | `integrations.manage` | — | `integrationStateSchema[]` (I5.1) |
| POST | `/integrations/:provider/connect` | `integrations.manage` | provider-specific (`connectResendSchema`, Stripe/Twilio keys) | `integrationStateSchema` |
| DELETE | `/integrations/:provider` | `integrations.manage` | — | 204 |
| GET | `/integrations/:provider/events` | `integrations.manage` | `paginationQuerySchema` | `pageSchema(integrationEventSchema)` (I5.4) |
