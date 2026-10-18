# Contributing

Two developers, one repo. These rules exist so we never guess what the other side built.

## Interface changes need both reviewers

A PR changes the interface if it touches:

- `shared/` (schemas, enums, permissions, events)
- `docs/api-routes.md`
- `backend/prisma/schema.prisma`
- `docs/conventions.md`

Interface PRs must be reviewed by both developers before merge. Everything else can merge with one reviewer.

## Branches

- `main` is protected; never push directly.
- Branch names: `feat/lead-escalation`, `fix/stripe-webhook-dup`, `chore/docker-healthcheck`, `docs/api-routes-audit`.

## Workflow

1. Pull `main`, branch.
2. If the change touches the interface: write/update the schema + doc row **first**, open a small PR, get it merged, then implement on both sides.
3. Implement, keep the branch rebased on `main`.
4. Run `npm run typecheck` before pushing.
5. PR description: what changed, which requirements (F/I/Q IDs) it covers, screenshots for UI, curl output for endpoints.
6. After merge, the other developer pulls and rebases their branch.

## Commits

Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`. Present tense, one logical change per commit.

## Definition of done

- [ ] Schema exists in `shared/` and is exported
- [ ] Row added/updated in `docs/api-routes.md`
- [ ] Server-side permission check enforced (not just hidden UI)
- [ ] Workspace scoping applied to every query
- [ ] Loading, success and error states handled in the UI with the shared error envelope
- [ ] Audit entry written for important actions (see F4.1)
- [ ] `npm run typecheck` passes
- [ ] No secrets in code, env examples updated if new variables were added

## Hard rules

- Secrets, API keys and tokens never enter the repo and never reach the browser (I5.3).
- The frontend never assumes it is authorized — every endpoint re-checks on the server (F1.5, Q2).
- Timers, thresholds and provider behavior are configurable per workspace (C1, F3.3).
- One workspace's data or integration credentials must never leak into another (F1.6, I5.2).
