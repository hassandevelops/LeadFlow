# Plan — milestones and work split

Order matters: later milestones depend on the contract and auth from earlier ones. Each milestone ends with a working, demoable slice.

| # | Milestone | Backend | Frontend | Requirements |
|---|---|---|---|---|
| M0 | Contract + infra (done) | shared/ schemas, docs, docker-compose | read contract, set up Vite app skeleton | — |
| M1 | Auth + workspace + RBAC | signup/login/logout, sessions, CSRF, permission middleware, user invite/roles | auth screens, session guard, permission hooks (`can(permission)`) | F1.1–F1.6, Q1–Q3 |
| M2 | CRM core | companies, contacts, opportunities CRUD, pipelines/stages, custom fields API | list/detail screens, dynamic custom-field forms, pipeline board | F2.1–F2.5, Q4, Q9 |
| M3 | Leads: assignment + escalation | intake endpoints, assignment rules engine, ack window timers (BullMQ), escalation chain, absence reassignment, recovery queue, socket emits | lead inbox with live countdown, acknowledge button, recovery queue page, assignment rules settings | F3.1–F3.9, Q5, Q11 |
| M4 | Activity, filters, saved lists | activity writes on every important action, filter query params, saved lists | timeline component, filter builder, saved lists | F2.6–F2.8 |
| M5 | Messaging (Twilio) | webhook + signature verify + idempotency, send/retry, status callbacks, contact matching, opt-out | conversation view, send box, status ticks | I1.1–I1.9 |
| M6 | Payments (Stripe) | checkout session creation, webhook processing, statuses, refunds | payment request dialog, payment chips on opportunity/contact | I2.1–I2.8 |
| M7 | Calendar (Google) | OAuth connect/callback, token refresh, free/busy, event CRUD | connect button, booking dialog with conflict warning, appointment list | I3.1–I3.7 |
| M8 | Email alerts (Resend) + integrations page | escalation email, per-user routing, retries, integration status API | integrations page with status/errors/sync history | I4.1–I4.4, I5.1–I5.8 |
| M9 | Audit + dashboard | audit middleware/writes, audit API, dashboard metrics API | audit viewer (permission-gated), dashboard with drill-down + widget prefs | F4.x, F5.x |
| M10 | Hardening | rate limits, validation audit, seed data, README run-through from scratch | accessibility pass, responsive pass, loading/error states | Q1–Q14 |

## Sync points

- After M0, M1 and M3: sit together and verify the other person can run the full demo path end-to-end.
- Interface changes (new schemas) are merged via small PRs before implementation starts, so neither side blocks the other.
- Frontend can start a milestone's screens using MSW handlers built from `shared/` schemas while the backend endpoint is in progress.

## Demo script (end state)

1. Owner signs up → invites a sales user and an admin.
2. Admin customizes pipeline, adds a custom field, sets assignment rules with a 30-second acknowledgement window.
3. A lead arrives (web form / WhatsApp) → assigned round-robin to the available employee → notification + email.
4. Employee ignores it → visible countdown expires → escalation to backup → email alert → recovery queue entry.
5. Employee acknowledges → time to first response recorded → dashboard updates live for the manager.
6. Employee sends a WhatsApp reply, creates a Stripe payment link (customer pays), books a calendar appointment → all appear on one contact page with the full activity timeline.
7. Admin opens audit history → every change above is recorded with actor, time, before/after.
