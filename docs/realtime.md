# Realtime (Q11)

Transport: socket.io on path `/ws`, same origin behind the API. Canonical event names and payload schemas live in `shared/src/events.ts` — this doc explains usage.

## Handshake

- Client connects with the session cookie; server resolves user + workspace, rejects otherwise.
- Server joins the socket to rooms: `workspace:{workspaceId}` and `user:{userId}`.
- `workspaceRoom(id)` / `userRoom(id)` helpers are exported from `shared/src/events.ts`.

## Events (server → client)

Payloads carry **minimal IDs + timestamp**, never full records. Clients use them to invalidate queries or refetch the affected detail. Full shapes in `shared/src/events.ts`.

| Event | Room | Payload | UI reaction |
|---|---|---|---|
| `lead.created` | workspace | leadId, source | new-lead badge, list refresh |
| `lead.assigned` | workspace + user | leadId, ownerId, ackDeadlineAt | show countdown on lead |
| `lead.escalated` | workspace + user | leadId, newOwnerId, reason, level | alert + recovery queue refresh |
| `lead.acknowledged` | workspace | leadId, ownerId | stop countdown |
| `message.received` | workspace | conversationId, messageId, contactId | conversation bump, unread count |
| `message.status_updated` | workspace | messageId, status | tick state on message bubble |
| `payment.updated` | workspace | paymentRequestId, status | opportunity payment chip |
| `appointment.updated` | workspace + user | appointmentId, status | calendar view refresh |
| `notification.created` | user | notificationId, title, link | toast in app |

## Rules

- The client is a cache-invalidation layer, not a data source: on event, refetch the REST endpoint. This keeps Q12 (same figure everywhere) true.
- Countdowns use `ackDeadlineAt` + `GET /time` drift correction (see `docs/conventions.md`), not socket ticks.
- Reconnect: socket.io auto-reconnects; on reconnect the client refetches any open lists to close gaps.
- Backend emits only after the DB transaction commits, so a listener that refetches immediately sees the new state.
