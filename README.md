# LeadFlow — Unified Business Management Platform

Team workspace for the NASCON Web Dev problem statement: a multi-tenant CRM that protects every inbound lead, with real integrations for WhatsApp messaging (Twilio), payments (Stripe), calendar (Google) and email alerts (Resend).

**This repo is the single source of truth shared by the frontend and backend developers.** The API contract lives in `shared/` as Zod schemas; every endpoint and payload must be defined there before either side implements it.

## Status

- [x] Contract package (`shared/`) with Zod schemas, enums, permissions, realtime events
- [x] Shared docs (`docs/`): conventions, data model, API routes, integrations, metrics
- [x] Local infrastructure (`docker-compose.yml`: Postgres + Redis)
- [ ] Backend scaffold (Express + Prisma)
- [ ] Frontend scaffold (Vite + React)
- [ ] Seed data

## Architecture

```
frontend (React + Vite, :5173)          backend (Express + TS, :4000)          providers
┌───────────────────────────┐  REST    ┌────────────────────────────┐  webhooks  ┌─────────────┐
│ screens, forms, socket.io │ ◄──────► │ REST API /api/v1           │ ◄────────► │ Twilio WA   │
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
npm run typecheck           # validates the contract compiles
```

Backend and frontend apps are scaffolded next; see `docs/plan.md` for the milestone order and the split of work.

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
