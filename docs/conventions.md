# Conventions — locked decisions

These are day-1 decisions both developers must follow. Changing any of them is an interface change (both review).

## API shape

- Base path: `/api/v1` (constant `API_PREFIX` in `shared/src/http.ts`). Provider webhooks live under `/api/webhooks/...` and are public but signature-verified.
- JSON everywhere, `camelCase` field names in JSON and database columns.
- IDs: UUID v4 strings (`idSchema` in `shared/src/schemas/common.ts`).
- Dates: ISO 8601 UTC with `Z` suffix (`isoDateSchema`). Always `timestamptz` in Postgres. Never send local times; appointment objects carry an IANA `timeZone` field separately.
- Money: decimal numbers in API (`1250.5`), `currency` as lowercase ISO 4217 (`"usd"`). Stripe adapters convert to minor units. Never floats in the DB — use Prisma `Decimal`.
- Empty values: optional fields are `null` when explicitly empty, omitted when not provided.

## Auth

- Session cookie `lf_session`: httpOnly, SameSite=Lax, Secure in production. No tokens in localStorage.
- CSRF: double-submit. Server sets readable cookie `lf_csrf`; the frontend fetch wrapper sends it back in header `x-csrf-token` on every non-GET request. Names exported from `shared/src/http.ts`.
- Rate limit login attempts (Q1). Sessions expire after a configurable idle period and can be ended from the UI.
- Permission checks happen on the server on **every** endpoint (F1.5, Q2). Hiding a button is never the enforcement.
- Every query is scoped by the caller's `workspaceId`; IDs from URLs are never trusted (F1.6).

## Error envelope

```json
{ "error": { "code": "validation_failed", "message": "Human readable", "details": {} } }
```

Codes (see `ERROR_CODES` in `shared/src/http.ts`): `unauthorized` 401, `forbidden` 403, `not_found` 404, `validation_failed` 400 (details = Zod issues), `conflict` 409, `too_many_requests` 429, `provider_error` 502, `internal` 500.

The frontend fetch wrapper maps `code` to UI behavior; it never parses `message` for logic.

## Pagination, filtering, sorting

- List endpoints accept `page`, `pageSize` (max 100, default 25), `sort` (`field:asc|desc`, whitelisted per endpoint), `q`.
- Responses: `{ "data": [...], "page": 1, "pageSize": 25, "total": 137 }` via `pageSchema()`.
- Filtering uses explicit query params per entity (`ownerId`, `stageId`, `tag`, `createdFrom`, `createdTo`, custom fields via `cf.<key>=value`). Saved lists (F2.6) persist these params as JSON.

## Custom fields (the hardest integration point)

- Definitions: `CustomFieldDefinition` per workspace, `entity: "contact" | "opportunity"`, optional `pipelineId` (opportunity fields can differ per pipeline — F2.3).
- Values: every contact/opportunity carries `customFields: { [fieldKey]: value }`. Missing key = empty.
- Server validates values on write against the definition types. Frontend renders forms from definitions.

## Field-level protection

- `value` on opportunities and payment amounts are governed by permission `crm.view_value`.
- Without it, the API returns `value: null` plus `valueHidden: true`; the UI shows a masked value. Exports omit the column (F1.4).

## Realtime

- socket.io on path `/ws`. Client joins `workspace:{id}` and `user:{id}` rooms after handshake auth. See `docs/realtime.md`.

## Server time and deadlines

- Every lead response includes absolute ISO deadlines (`ackDeadlineAt`). `GET /api/v1/time` returns server time; the frontend computes remaining time as `deadline - (serverTimeNow - drift)` so countdowns are consistent for all users.
- Timers are configurable in seconds (C1, F3.4) so escalation is demonstrable live.

## Concurrency and idempotency

- Assignment and escalation transitions use a DB transaction with a row lock on the lead; a lead's owner changes atomically and only once per timer expiry (F3.8, Q5).
- Webhook handlers are idempotent: store provider event IDs (`providerMessageId`, Stripe `event.id`) with a unique constraint before applying effects (I1.8, I2.4).
- Timers survive restarts: deadlines are stored in the DB and a BullMQ delayed job re-arms on boot (Q5).

## Validation

- Backend parses every request body/query with the matching `shared/` schema; on failure respond `validation_failed` with Zod issues.
- Frontend uses `z.input<typeof schema>` for form state and re-parses before submit for instant feedback.
