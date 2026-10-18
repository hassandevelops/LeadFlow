import Stripe from "stripe";
import { withTimeout } from "../lib/async";
import type { ProviderCredentials } from "../services/integrations";
import { ProviderError } from "./errors";

export function stripeClient(credentials: ProviderCredentials): Stripe {
  if (!credentials.secretKey) {
    throw new ProviderError("Stripe secret key is missing", { permanent: true });
  }
  return new Stripe(credentials.secretKey);
}

export async function createCheckoutSession(
  credentials: ProviderCredentials,
  input: {
    amountMinor: number;
    currency: string;
    description: string;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
  },
): Promise<{ id: string; url: string | null }> {
  const stripe = stripeClient(credentials);
  try {
    const session = await withTimeout(
      stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: input.currency,
              unit_amount: input.amountMinor,
              product_data: { name: input.description },
            },
          },
        ],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: input.metadata,
      }),
      15000,
      "Stripe request timed out",
    );
    return { id: session.id, url: session.url };
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      throw new ProviderError(error.message, {
        permanent: error.type !== "StripeConnectionError",
        code: error.code ?? error.type,
      });
    }
    throw error;
  }
}

export function constructWebhookEvent(
  credentials: ProviderCredentials,
  rawBody: Buffer,
  signature: string,
): Stripe.Event {
  const stripe = stripeClient(credentials);
  if (!credentials.webhookSecret) {
    throw new ProviderError("Stripe webhook secret is not configured", { permanent: true });
  }
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, credentials.webhookSecret);
  } catch (error) {
    throw new ProviderError(
      error instanceof Error ? error.message : "Invalid Stripe signature",
      { permanent: true, code: "invalid_signature" },
    );
  }
}

export function verifiableEventTypes(): string[] {
  return [
    "checkout.session.completed",
    "checkout.session.expired",
    "payment_intent.payment_failed",
    "charge.refunded",
  ];
}
