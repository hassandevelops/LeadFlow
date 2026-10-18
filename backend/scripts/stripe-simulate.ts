import { randomBytes } from "node:crypto";
import Stripe from "stripe";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import { resolveCredentials } from "../src/services/integrations";

const USAGE = `Usage: npm run stripe:simulate -- <paymentRequestId> [completed|failed|expired|refunded]

Fires a signature-verified Stripe webhook at the local API so the whole payment
pipeline runs exactly as it would with the real provider (idempotency, Payment
rows, activities, socket events). Requires STRIPE_STUB=1 for checkout creation.`;

function ref(prefix: string): string {
  return `${prefix}_stub_${randomBytes(8).toString("hex")}`;
}

async function main(): Promise<void> {
  const [requestId, kind = "completed"] = process.argv.slice(2);
  if (!requestId) {
    console.error(USAGE);
    process.exit(1);
  }

  const request = await prisma.paymentRequest.findUnique({ where: { id: requestId } });
  if (!request) {
    console.error(`Payment request ${requestId} not found`);
    process.exit(1);
  }

  const resolved = await resolveCredentials(request.workspaceId, "stripe");
  if (!resolved || !resolved.credentials.webhookSecret) {
    console.error("No Stripe configuration with a webhook secret found. Connect Stripe in Integrations or set STRIPE_WEBHOOK_SECRET.");
    process.exit(1);
  }

  const amountMinor = Math.round(Number(request.amount) * 100);
  const metadata = { workspaceId: request.workspaceId, paymentRequestId: request.id };
  const base = { id: ref("evt"), object: "event", api_version: "2024-06-20" };

  let event: Record<string, unknown>;
  if (kind === "completed") {
    event = {
      ...base,
      type: "checkout.session.completed",
      data: {
        object: {
          id: request.providerRef ?? ref("cs"),
          object: "checkout.session",
          amount_total: amountMinor,
          currency: request.currency,
          payment_intent: ref("pi"),
          metadata,
        },
      },
    };
  } else if (kind === "failed") {
    event = {
      ...base,
      type: "payment_intent.payment_failed",
      data: { object: { id: ref("pi"), object: "payment_intent", metadata } },
    };
  } else if (kind === "expired") {
    event = {
      ...base,
      type: "checkout.session.expired",
      data: { object: { id: request.providerRef ?? ref("cs"), object: "checkout.session", metadata } },
    };
  } else if (kind === "refunded") {
    const payment = await prisma.payment.findFirst({ where: { paymentRequestId: request.id } });
    if (!payment) {
      console.error("No payment recorded for this request yet — run `completed` first.");
      process.exit(1);
    }
    event = {
      ...base,
      type: "charge.refunded",
      data: {
        object: {
          id: ref("ch"),
          object: "charge",
          payment_intent: payment.providerRef,
          amount: amountMinor,
          amount_refunded: amountMinor,
          metadata,
        },
      },
    };
  } else {
    console.error(`Unknown event kind "${kind}"\n\n${USAGE}`);
    process.exit(1);
  }

  const payload = JSON.stringify(event);
  const stripe = new Stripe(resolved.credentials.secretKey ?? "sk_test_stub");
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: resolved.credentials.webhookSecret,
  });

  const response = await fetch(`${env.API_URL}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": signature },
    body: payload,
  });
  const body = await response.text();
  console.log(`[stripe:simulate] ${kind} → HTTP ${response.status} ${body}`);
  console.log(`[stripe:simulate] event id ${String((event as { id: string }).id)}`);
}

main()
  .catch((error) => {
    console.error("[stripe:simulate] failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
