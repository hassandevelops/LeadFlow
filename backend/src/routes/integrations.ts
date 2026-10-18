import {
  connectResendSchema,
  connectStripeSchema,
  connectTwilioSchema,
  INTEGRATION_PROVIDERS,
  integrationProviderSchema,
  paginationQuerySchema,
  type IntegrationProvider,
  type IntegrationState,
} from "@leadflow/shared";
import { Router } from "express";
import { ApiError } from "../lib/errors";
import { parseBody, parseQuery } from "../lib/validation";
import { authOf, requirePermission } from "../middleware/auth";
import { writeAudit } from "../services/audit";
import {
  deleteIntegration,
  listIntegrationEventsPage,
  listIntegrationStates,
  saveIntegration,
} from "../services/integrations";

export const integrationsRouter = Router();

function providerParam(value: unknown): IntegrationProvider {
  const parsed = integrationProviderSchema.safeParse(value);
  if (!parsed.success) {
    throw ApiError.notFound("Unknown integration provider");
  }
  return parsed.data;
}

async function stateFor(workspaceId: string, userId: string, provider: IntegrationProvider): Promise<IntegrationState> {
  const states = await listIntegrationStates(workspaceId, userId);
  const state = states.find((candidate) => candidate.provider === provider);
  if (!state) {
    throw ApiError.internal("Integration state missing");
  }
  return state;
}

integrationsRouter.get("/integrations", requirePermission("integrations.manage"), async (req, res) => {
  const { workspaceId, user } = authOf(req);
  res.json(await listIntegrationStates(workspaceId, user.id));
});

integrationsRouter.post(
  "/integrations/:provider/connect",
  requirePermission("integrations.manage"),
  async (req, res) => {
    const { workspaceId, user } = authOf(req);
    const provider = providerParam(req.params.provider);

    if (provider === "google_calendar") {
      throw ApiError.validationFailed("Use the Google OAuth connect flow");
    }

    let accountLabel: string;
    if (provider === "twilio_whatsapp") {
      const input = parseBody(connectTwilioSchema, req);
      accountLabel = input.whatsappFrom;
      await saveIntegration({
        workspaceId,
        provider,
        credentials: {
          accountSid: input.accountSid,
          authToken: input.authToken,
          whatsappFrom: input.whatsappFrom,
        },
        accountLabel,
      });
    } else if (provider === "stripe") {
      const input = parseBody(connectStripeSchema, req);
      accountLabel = `acct_${input.secretKey.slice(-6)}`;
      await saveIntegration({
        workspaceId,
        provider,
        credentials: { secretKey: input.secretKey, webhookSecret: input.webhookSecret },
        accountLabel,
      });
    } else {
      const input = parseBody(connectResendSchema, req);
      accountLabel = input.fromEmail;
      await saveIntegration({
        workspaceId,
        provider,
        credentials: { apiKey: input.apiKey, fromEmail: input.fromEmail },
        accountLabel,
      });
    }

    await writeAudit({
      workspaceId,
      actor: { id: user.id, name: user.name },
      eventType: "integration_change",
      targetType: "integration",
      targetId: provider,
      summary: `${provider} connected`,
      after: { accountLabel },
    });

    res.json(await stateFor(workspaceId, user.id, provider));
  },
);

integrationsRouter.delete(
  "/integrations/:provider",
  requirePermission("integrations.manage"),
  async (req, res) => {
    const { workspaceId, user } = authOf(req);
    const provider = providerParam(req.params.provider);
    if (!INTEGRATION_PROVIDERS.includes(provider)) {
      throw ApiError.notFound("Unknown integration provider");
    }

    await deleteIntegration(workspaceId, provider, provider === "google_calendar" ? user.id : null);

    await writeAudit({
      workspaceId,
      actor: { id: user.id, name: user.name },
      eventType: "integration_change",
      targetType: "integration",
      targetId: provider,
      summary: `${provider} disconnected`,
    });

    res.status(204).end();
  },
);

integrationsRouter.get(
  "/integrations/:provider/events",
  requirePermission("integrations.manage"),
  async (req, res) => {
    const { workspaceId } = authOf(req);
    const provider = providerParam(req.params.provider);
    const query = parseQuery(paginationQuerySchema, req);
    const page = await listIntegrationEventsPage(workspaceId, provider, query.page, query.pageSize);
    res.json({ data: page.data, page: query.page, pageSize: query.pageSize, total: page.total });
  },
);
