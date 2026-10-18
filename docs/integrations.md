# Integrations

Providers must run in their real sandbox/test mode (no hard-coded stand-ins). Every inbound event and outbound call is recorded in `ProviderEvent` and visible on the Integrations page (I5.4, I5.1).

## Shared rules (I5.x)

- **Per-workspace credentials** stored encrypted (AES-256-GCM, key from `ENCRYPTION_KEY`), never returned to the browser, never logged (I5.2, I5.3).
- Adapter pattern: one module per provider behind a common interface (`send`, `verifyWebhook`, transform), so a provider can be swapped without touching business logic (Q14).
- Webhooks: verify signature **before** any effect; on failure respond `403`, record the rejected attempt (I1.2, I2.3).
- Idempotency: unique constraint on `(provider, externalId)`; replays return `200` without side effects (I1.8, I2.4).
- Retries: transient errors retried with backoff (3 attempts); permanent errors stored and shown with a plain-language reason (I5.5, I1.7, I4.4).
- Isolation: a provider outage must not break the rest of the platform; outbound calls go through a queue with timeouts (I5.8).
- Local dev needs a tunnel (`ngrok http 4000` or `cloudflared tunnel --url http://localhost:4000`); set `PUBLIC_WEBHOOK_URL` to the tunnel URL.

## I1 — Twilio WhatsApp Sandbox

| Item | Value |
|---|---|
| Env (dev fallback) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` |
| Inbound webhook | `POST {PUBLIC_WEBHOOK_URL}/api/webhooks/twilio/whatsapp` |
| Status callback | `POST {PUBLIC_WEBHOOK_URL}/api/webhooks/twilio/status` |
| Verification | `X-Twilio-Signature` HMAC-SHA1 over the full URL + sorted params, validated with the auth token |
| Idempotency key | `MessageSid` |
| Sending | REST API; store `status` transitions `queued → sent → delivered | failed` |
| Threading | Group by contact + channel into a `Conversation`; unknown number creates contact + lead (I1.5) |
| Limits to show in UI | Sandbox only messages phones that joined with the join phrase (I5.6) |

## I2 — Stripe (test mode)

| Item | Value |
|---|---|
| Env (dev fallback) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Webhook | `POST {PUBLIC_WEBHOOK_URL}/api/webhooks/stripe` |
| Verification | `Stripe-Signature` header, raw body, `constructEvent` |
| Events handled | `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`, `charge.refunded` |
| Idempotency key | `event.id` |
| Payment flow | `checkout.sessions.create` with `success_url`/`cancel_url`; send `checkoutUrl` to customer via WhatsApp or copy link |
| Never | Store/log card data; details are entered only on Stripe's hosted page (I2.8) |
| Statuses | `pending → paid | expired | abandoned | failed`, plus `refunded` reflected from dashboard refunds (I2.5) |

## I3 — Google Calendar (OAuth 2.0)

| Item | Value |
|---|---|
| Env | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (`http://localhost:4000/api/integrations/google/callback`) |
| Consent | Per employee; store refresh token encrypted server-side (I3.1, I3.2) |
| Token refresh | Refresh automatically before expiry; on `invalid_grant` set integration status `error` and show "needs reconnection" (I3.2) |
| Free/busy | `freebusy.query` with employee's calendar ID to prevent overlaps (I3.4) |
| Create/update/delete | `events.insert/patch/delete` with `sendUpdates: "all"`; store `googleEventId` on the appointment |
| Time zones | Store UTC; pass employee's IANA `timeZone` on create; always render in a stated time zone (I3.5) |
| Booking guard | Booking fails with a clear message if the employee has no connected calendar (I3.7) |
| Test-mode caveat | OAuth app in "testing" only accepts listed test users and may issue short-lived refresh tokens — reconnect flow must be smooth |

## I4 — Transactional email (Resend)

| Item | Value |
|---|---|
| Env (dev fallback) | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| Trigger | Lead escalation (F3.5) → email the new owner **and** in-app notification |
| Content | Lead name/title, source, escalation reason, deep link to the lead (I4.2) |
| Routing | Per-user `NotificationSetting` (email address) (I4.3) |
| Delivery | Within the same minute of escalation; failures recorded and retried up to 3 times, visible to Admins (I4.1, I4.4) |
| Alternative | SendGrid acceptable if Resend limits block; adapter interface keeps this swappable |

## Integrations page (I5.1)

Each provider row shows: status chip (`not_connected | connected | error`), account label, last success time, recent errors (last 5), connect/disconnect actions (gated by `integrations.manage`), and an expandable sync history from `ProviderEvent`.
