# LeadFlow — Unified Business Management Platform

Team workspace for the NASCON Web Dev problem statement: a multi-tenant CRM that protects every inbound lead, with real integrations for WhatsApp messaging (Green API), payments (Stripe), calendar (Google) and email alerts (Resend).

**This repo is the single source of truth shared by the frontend and backend developers.** The API contract lives in `shared/` as Zod schemas; every endpoint and payload must be defined there before either side implements it.

## Status

- [x] Contract package (`shared/`) with Zod schemas, enums, permissions, realtime events
- [x] Shared docs (`docs/`): conventions, data model, API routes, integrations, metrics
- [x] Local infrastructure (`docker-compose.yml`: Postgres + Redis)
- [x] Backend scaffold (Express + Prisma) + M1: auth, sessions, RBAC, socket handshake
- [x] Backend M2–M10: CRM routes, lead intake + assignment engine, conversations (WhatsApp via Green API), payments (Stripe), integrations + OAuth, calendar sync, dashboard, audit, BullMQ workers/webhooks
- [x] Frontend scaffold (Vite + React + Tailwind, TanStack Query, socket client, MSW mocks)
- [x] Frontend app: all PRD milestones M1–M10 implemented against the contract, demo mode via `VITE_ENABLE_MOCKS=true`
- [x] Seed data (`npm run prisma:seed --workspace backend`)

## Architecture

```
frontend (React + Vite, :5173)          backend (Express + TS, :4000)          providers
┌───────────────────────────┐  REST    ┌────────────────────────────┐  webhooks  ┌─────────────┐
│ screens, forms, socket.io │ ◄──────► │ REST API /api/v1           │ ◄────────► │ Green API   │
│ client, permission-gated  │  WS      │ Prisma → Postgres          │  OAuth     │ Stripe      │
│ UI (server still enforces)│ ◄──────► │ BullMQ timers → Redis      │            │ Google Cal  │
└───────────────────────────┘          │ integration adapters       │            │ Resend      │
        imports @leadflow/shared       └────────────────────────────┘            └─────────────┘
                                                imports @leadflow/shared
```

## Repo map

| Path | What | Owner |
|---|---|---|
| `shared/` | **The contract.** Zod schemas, enums, permissions, socket events, HTTP conventions | Both (review required) |
| `docs/` | Conventions, ERD, endpoint table, integration specs, metric definitions, work split | Both |
| `backend/` | Express API, Prisma, jobs/timers, webhook handlers | Backend dev |
| `frontend/` | React app, socket client, UI | Frontend dev |
| `docker-compose.yml` | Postgres + Redis for local development | Backend dev |

## Quickstart

```bash
npm install                 # installs all workspaces (zod, typescript)
docker compose up -d        # starts Postgres (:5432) and Redis (:6379)
cp backend/.env.example backend/.env
npm run prisma:migrate --workspace backend   # applies migrations
npm run prisma:seed --workspace backend      # demo workspace + users (password123)
npm run dev:backend         # API on http://localhost:4000
npm run typecheck           # validates the contract compiles
```

Invited users are created with a generated temporary password that the backend prints to its console in development (an invite email arrives with the Resend integration, M8).

The seed recreates the workspace `acme-sales` with 8 users sharing the password `password123` (owners: `olivia@leadflow.dev`, `noah@leadflow.dev`; manager: `maya@leadflow.dev`; agents: `emma@leadflow.dev`, `liam@leadflow.dev`, `adam@leadflow.dev`, `sofia@leadflow.dev`, `james@leadflow.dev`).

**Testing Stripe without an account:** set `STRIPE_STUB=1` in `backend/.env`, connect Stripe in the UI with placeholder keys, then create a payment request and drive the webhook with `npm run stripe:simulate -- <paymentRequestId> [completed|failed|expired|refunded]` — the event is signed and delivered to the real local webhook, so idempotency, Payment rows, activities and socket events all run as usual.

## The contract-first workflow (read this before writing code)

1. **Any new endpoint or payload starts in `shared/`.** Add the Zod schema, export it from `shared/src/index.ts`, and add a row to `docs/api-routes.md`.
2. Backend validates request/response with the schema; frontend imports the same schema for types and form validation.
3. PRs touching `shared/`, `docs/` or `backend/prisma/schema.prisma` are **interface changes** — both developers review them.
4. Never duplicate a type by hand on either side. If it is not in `shared/`, it is not agreed.

## Environment

Copy the example files and fill in values:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Webhooks (Twilio, Stripe, Google) need a public HTTPS URL pointing at your machine while developing — use `ngrok` or `cloudflared` and set `PUBLIC_WEBHOOK_URL` in `backend/.env`. Details per provider in `docs/integrations.md`.

## Docs index

| File | Contents |
|---|---|
| `docs/conventions.md` | Locked day-1 decisions: auth, IDs, dates, errors, pagination, custom fields, realtime |
| `docs/data-model.md` | ERD and entity responsibilities |
| `docs/api-routes.md` | Every endpoint: method, path, schema, permission |
| `docs/permissions.md` | Permission keys, role presets and enforcement rules |
| `docs/integrations.md` | Webhook URLs, signature verification, retries, provider limits |
| `docs/realtime.md` | Socket rooms and event catalog |
| `docs/metrics.md` | Glossary and metric definitions (must match on every screen) |
| `docs/plan.md` | Milestones and work split between backend and frontend |
| `CONTRIBUTING.md` | Branches, PR rules, definition of done |
