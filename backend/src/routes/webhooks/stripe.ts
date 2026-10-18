import type Stripe from "stripe";
import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { emitToWorkspace } from "../../realtime/io";
import { ProviderError } from "../../providers/errors";
import { constructWebhookEvent } from "../../providers/stripe";
import type { ProviderCredentials, ResolvedCredentials } from "../../services/integrations";
import {
  markIntegrationError,
  markIntegrationSuccess,
  resolveCredentials,
  recordProviderEvent,
} from "../../services/integrations";
import { recordOpportunityActivity, SYSTEM_ACTOR } from "../../services/activity";

export const stripeWebhooksRouter = Router();

async function verifiedEvent(
  rawBody: Buffer,
  signature: string,
): Promise<{ event: Stripe.Event; resolved: ResolvedCredentials; workspaceId: string }> {
  const rows = await prisma.integration.findMany({
    where: { provider: "stripe" },
  });
  const workspaceIds = [...new Set(rows.filter((row) => row.encryptedCredentials).map((row) => row.workspaceId))];

  for (const workspaceId of workspaceIds) {
    const resolved = await resolveCredentials(workspaceId, "stripe");
    if (!resolved) {
      continue;
    }
    try {
      const event = constructWebhookEvent(resolved.credentials, rawBody, signature);
      return { event, resolved, workspaceId };
    } catch {
      continue;
    }
  }

  if (workspaceIds.length === 0) {
    const anyWorkspace = await prisma.workspace.findFirst({ select: { id: true } });
    if (anyWorkspace) {
      const resolved = await resolveCredentials(anyWorkspace.id, "stripe");
      if (resolved) {
        const event = constructWebhookEvent(resolved.credentials, rawBody, signature);
        return { event, resolved, workspaceId: anyWorkspace.id };
      }
    }
  }

  throw new ProviderError("No Stripe configuration could verify this webhook", { permanent: true });
}

function minorToAmount(value: number | null | undefined): number {
  return Number(((value ?? 0) / 100).toFixed(2));
}

async function handleCheckoutCompleted(workspaceId: string, session: Stripe.Checkout.Session): Promise<void> {
  const paymentRequestId = session.metadata?.paymentRequestId;
  if (!paymentRequestId) {
    return;
  }
  const request = await prisma.paymentRequest.findFirst({
    where: { id: paymentRequestId, workspaceId },
  });
  if (!request) {
    return;
  }
  if (request.status === "paid") {
    return;
  }

  const amount = minorToAmount(session.amount_total);
  const currency = (session.currency ?? request.currency).toLowerCase();
  const providerRef =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? session.id);
  const paidAt = new Date();
  const now = new Date();

  await prisma.paymentRequest.update({
    where: { id: request.id },
    data: { status: "paid", providerRef, currency },
  });

  const existingPayment = await prisma.payment.findUnique({ where: { providerRef } });
  if (!existingPayment) {
    await prisma.payment.create({
      data: {
        workspaceId,
        paymentRequestId: request.id,
        amount,
        currency,
        status: "succeeded",
        providerRef,
        paidAt,
      },
    });
  }

  await recordOpportunityActivity({
    workspaceId,
    opportunityId: request.opportunityId,
    type: "payment",
    actor: SYSTEM_ACTOR,
    summary: `Payment received: ${amount} ${currency.toUpperCase()}`,
  });

  emitToWorkspace(workspaceId, "payment.updated", {
    workspaceId,
    at: now.toISOString(),
    paymentRequestId: request.id,
    status: "paid",
  });
  emitToWorkspace(workspaceId, "notification.created", {
    workspaceId,
    at: now.toISOString(),
    notificationId: request.id,
    title: `Payment received: ${amount} ${currency.toUpperCase()}`,
    link: "/payments",
  });
}

async function handleCheckoutExpired(workspaceId: string, session: Stripe.Checkout.Session): Promise<void> {
  const paymentRequestId = session.metadata?.paymentRequestId;
  if (!paymentRequestId) {
    return;
  }
  const request = await prisma.paymentRequest.findFirst({
    where: { id: paymentRequestId, workspaceId },
  });
  if (!request || request.status !== "pending") {
    return;
  }

  await prisma.paymentRequest.update({ where: { id: request.id }, data: { status: "expired" } });
  emitToWorkspace(workspaceId, "payment.updated", {
    workspaceId,
    at: new Date().toISOString(),
    paymentRequestId: request.id,
    status: "expired",
  });
}

async function handlePaymentFailed(workspaceId: string, intent: Stripe.PaymentIntent): Promise<void> {
  const paymentRequestId = intent.metadata?.paymentRequestId;
  const request = paymentRequestId
    ? await prisma.paymentRequest.findFirst({ where: { id: paymentRequestId, workspaceId } })
    : await prisma.paymentRequest.findFirst({ where: { workspaceId, providerRef: intent.id } });
  if (!request || request.status !== "pending") {
    return;
  }

  await prisma.paymentRequest.update({ where: { id: request.id }, data: { status: "failed" } });
  emitToWorkspace(workspaceId, "payment.updated", {
    workspaceId,
    at: new Date().toISOString(),
    paymentRequestId: request.id,
    status: "failed",
  });
}

async function handleChargeRefunded(workspaceId: string, charge: Stripe.Charge): Promise<void> {
  const paymentIntentId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) {
    return;
  }
  const payment = await prisma.payment.findUnique({ where: { providerRef: paymentIntentId } });
  if (!payment || payment.workspaceId !== workspaceId) {
    return;
  }

  const refundedAmount = minorToAmount(charge.amount_refunded);
  const fullyRefunded = charge.amount_refunded >= charge.amount;
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      refundedAmount,
      status: fullyRefunded ? "refunded" : "partially_refunded",
    },
  });

  const request = await prisma.paymentRequest.findUnique({
    where: { id: updated.paymentRequestId },
    select: { opportunityId: true },
  });
  if (request) {
    await recordOpportunityActivity({
      workspaceId,
      opportunityId: request.opportunityId,
      type: "payment",
      actor: SYSTEM_ACTOR,
      summary: `Refund of ${refundedAmount} ${updated.currency.toUpperCase()}`,
    });
  }

  emitToWorkspace(workspaceId, "payment.updated", {
    workspaceId,
    at: new Date().toISOString(),
    paymentRequestId: updated.paymentRequestId,
    status: updated.status,
  });
}

stripeWebhooksRouter.post("/", async (req, res) => {
  const signature = String(req.get("stripe-signature") ?? "");
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ""));

  if (!signature) {
    res.status(400).json({ error: { code: "validation_failed", message: "Missing Stripe signature" } });
    return;
  }

  let event: Stripe.Event;
  let resolved: ResolvedCredentials;
  let workspaceId: string;
  try {
    ({ event, resolved, workspaceId } = await verifiedEvent(rawBody, signature));
  } catch {
    res.status(400).json({ error: { code: "provider_error", message: "Invalid Stripe signature" } });
    return;
  }

  const existing = await prisma.providerEvent.findUnique({
    where: { provider_externalId: { provider: "stripe", externalId: event.id } },
  });
  if (existing) {
    res.status(200).json({ status: "duplicate" });
    return;
  }

  const payload = event.data.object as unknown as Record<string, unknown>;
  const eventRow = {
    workspaceId,
    provider: "stripe" as const,
    externalId: event.id,
    direction: "inbound" as const,
    eventType: event.type,
    payload: { id: event.id, type: event.type, object: payload },
  };

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(workspaceId, event.data.object as Stripe.Checkout.Session);
        break;
      case "checkout.session.expired":
        await handleCheckoutExpired(workspaceId, event.data.object as Stripe.Checkout.Session);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentFailed(workspaceId, event.data.object as Stripe.PaymentIntent);
        break;
      case "charge.refunded":
        await handleChargeRefunded(workspaceId, event.data.object as Stripe.Charge);
        break;
      default:
        await recordProviderEvent({ ...eventRow, result: "rejected", errorMessage: "Unhandled event type" });
        res.status(200).json({ status: "ignored" });
        return;
    }

    if (resolved.row) {
      await markIntegrationSuccess(workspaceId, "stripe", resolved.row.userId);
    }
    await recordProviderEvent({ ...eventRow, result: "success" });
    res.status(200).json({ status: "ok" });
  } catch (error) {
    if (resolved.row) {
      await markIntegrationError(
        workspaceId,
        "stripe",
        resolved.row.userId,
        error instanceof Error ? error.message : "Stripe error",
      );
    }
    res.status(500).json({ error: { code: "internal", message: "Webhook handling failed" } });
  }
});
