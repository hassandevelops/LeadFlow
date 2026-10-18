import { createPaymentRequestSchema, paginationQuerySchema } from "@leadflow/shared";
import { Router } from "express";
import { actorOf } from "../lib/access";
import { env } from "../config/env";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { toPayment, toPaymentRequest } from "../lib/serialize";
import { parseBody, parseIdParam, parseQuery } from "../lib/validation";
import { authOf, requirePermission } from "../middleware/auth";
import { createCheckoutSession } from "../providers/stripe";
import { ProviderError } from "../providers/errors";
import { recordOpportunityActivity } from "../services/activity";
import { markIntegrationError, markIntegrationSuccess, resolveCredentials } from "../services/integrations";

export const paymentsRouter = Router();

paymentsRouter.post("/opportunities/:id/payment-requests", requirePermission("crm.edit"), async (req, res) => {
  const auth = authOf(req);
  const { workspaceId } = auth;
  const id = parseIdParam(req);
  const input = parseBody(createPaymentRequestSchema, req);

  const opportunity = await prisma.opportunity.findFirst({ where: { id, workspaceId } });
  if (!opportunity) {
    throw ApiError.notFound("Opportunity not found");
  }

  const resolved = await resolveCredentials(workspaceId, "stripe");
  if (!resolved) {
    throw ApiError.providerError("Stripe is not connected. Connect Stripe in Integrations.");
  }

  const request = await prisma.paymentRequest.create({
    data: {
      workspaceId,
      opportunityId: opportunity.id,
      contactId: opportunity.contactId,
      amount: input.amount,
      currency: input.currency,
      requestedByUserId: auth.user.id,
    },
  });

  try {
    const session = await createCheckoutSession(resolved.credentials, {
      amountMinor: Math.round(input.amount * 100),
      currency: input.currency,
      description: input.description ?? `${opportunity.title} payment`,
      successUrl: `${env.APP_URL}/payments?status=success&request=${request.id}`,
      cancelUrl: `${env.APP_URL}/payments?status=cancelled&request=${request.id}`,
      metadata: { workspaceId, paymentRequestId: request.id },
    });

    const updated = await prisma.paymentRequest.update({
      where: { id: request.id },
      data: { providerRef: session.id, checkoutUrl: session.url },
    });

    if (resolved.row) {
      await markIntegrationSuccess(workspaceId, "stripe", resolved.row.userId);
    }

    await recordOpportunityActivity({
      workspaceId,
      opportunityId: opportunity.id,
      type: "payment",
      actor: actorOf(auth),
      summary: `Payment request created for ${input.amount} ${input.currency.toUpperCase()}`,
    });

    res.status(201).json(toPaymentRequest(updated));
  } catch (error) {
    await prisma.paymentRequest.update({
      where: { id: request.id },
      data: { status: "failed" },
    });
    if (resolved.row) {
      await markIntegrationError(
        workspaceId,
        "stripe",
        resolved.row.userId,
        error instanceof Error ? error.message : "Stripe error",
      );
    }
    if (error instanceof ProviderError) {
      throw ApiError.providerError(error.message);
    }
    throw error;
  }
});

paymentsRouter.get("/payment-requests", requirePermission("crm.view"), async (req, res) => {
  const { workspaceId } = authOf(req);
  const query = parseQuery(paginationQuerySchema, req);

  const [total, rows] = await Promise.all([
    prisma.paymentRequest.count({ where: { workspaceId } }),
    prisma.paymentRequest.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  res.json({ data: rows.map(toPaymentRequest), page: query.page, pageSize: query.pageSize, total });
});

paymentsRouter.get("/payments", requirePermission("crm.view"), async (req, res) => {
  const { workspaceId } = authOf(req);
  const query = parseQuery(paginationQuerySchema, req);

  const [total, rows] = await Promise.all([
    prisma.payment.count({ where: { workspaceId } }),
    prisma.payment.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  res.json({ data: rows.map(toPayment), page: query.page, pageSize: query.pageSize, total });
});
