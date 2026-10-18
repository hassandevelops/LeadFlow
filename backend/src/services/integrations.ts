import type { IntegrationEvent, IntegrationProvider, IntegrationState } from "@leadflow/shared";
import type { Integration, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { decryptJson, encryptJson } from "../lib/crypto";
import { prisma } from "../lib/prisma";
import { toIntegrationEvent, toIntegrationState } from "../lib/serialize";

export type ProviderCredentials = Record<string, string>;

export const PLATFORM_PROVIDERS: IntegrationProvider[] = [
  "twilio_whatsapp",
  "stripe",
  "resend",
  "google_calendar",
];

const CAPABILITIES: Record<IntegrationProvider, string[]> = {
  twilio_whatsapp: ["receive_messages", "send_messages", "delivery_status"],
  stripe: ["payment_requests", "checkout_links", "refunds"],
  google_calendar: ["oauth", "free_busy", "event_create", "event_update", "event_delete"],
  resend: ["transactional_email"],
};

const LIMITS_NOTE: Record<IntegrationProvider, string> = {
  twilio_whatsapp: "Sandbox only messages phones that joined with the join phrase.",
  stripe: "Test mode only; card details never touch this app.",
  google_calendar: "OAuth app in testing accepts listed test users only; refresh tokens can expire, reconnect if needed.",
  resend: "Sandbox sender may only deliver to the account owner until a domain is verified.",
};

const ENV_LABELS: Record<IntegrationProvider, string> = {
  twilio_whatsapp: "Environment (dev fallback)",
  stripe: "Environment (dev fallback, test mode)",
  google_calendar: "Per-employee OAuth",
  resend: "Environment (dev fallback)",
};

function envCredentials(provider: IntegrationProvider): ProviderCredentials | null {
  if (provider === "stripe") {
    if (!env.STRIPE_SECRET_KEY) return null;
    return {
      secretKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? "",
    };
  }
  if (provider === "resend") {
    if (!env.RESEND_API_KEY) return null;
    return {
      apiKey: env.RESEND_API_KEY,
      fromEmail: env.RESEND_FROM_EMAIL ?? "alerts@resend.dev",
    };
  }
  return null;
}

export async function getIntegrationRow(
  workspaceId: string,
  provider: IntegrationProvider,
  userId?: string | null,
): Promise<Integration | null> {
  return prisma.integration.findFirst({
    where: { workspaceId, provider, userId: userId ?? null },
  });
}

export interface ResolvedCredentials {
  credentials: ProviderCredentials;
  accountLabel: string;
  source: "integration" | "env";
  row: Integration | null;
}

export async function resolveCredentials(
  workspaceId: string,
  provider: IntegrationProvider,
  userId?: string | null,
): Promise<ResolvedCredentials | null> {
  const row = await getIntegrationRow(workspaceId, provider, userId);
  if (row?.encryptedCredentials) {
    const credentials = decryptJson<ProviderCredentials>(row.encryptedCredentials);
    if (credentials) {
      return {
        credentials,
        accountLabel: row.accountLabel ?? provider,
        source: "integration",
        row,
      };
    }
  }
  const fallback = envCredentials(provider);
  if (fallback) {
    return {
      credentials: fallback,
      accountLabel: row?.accountLabel ?? ENV_LABELS[provider],
      source: "env",
      row,
    };
  }
  return null;
}

export async function saveIntegration(input: {
  workspaceId: string;
  provider: IntegrationProvider;
  userId?: string | null;
  credentials: ProviderCredentials;
  accountLabel: string;
}): Promise<Integration> {
  const userId = input.userId ?? null;
  const data = {
    encryptedCredentials: encryptJson(input.credentials),
    accountLabel: input.accountLabel,
    status: "connected" as const,
  };
  const existing = await getIntegrationRow(input.workspaceId, input.provider, userId);
  if (existing) {
    return prisma.integration.update({ where: { id: existing.id }, data });
  }
  return prisma.integration.create({
    data: {
      workspaceId: input.workspaceId,
      provider: input.provider,
      userId,
      ...data,
    },
  });
}

export async function deleteIntegration(
  workspaceId: string,
  provider: IntegrationProvider,
  userId?: string | null,
): Promise<void> {
  const row = await getIntegrationRow(workspaceId, provider, userId);
  if (row) {
    await prisma.integration.delete({ where: { id: row.id } });
  }
}

export async function markIntegrationSuccess(
  workspaceId: string,
  provider: IntegrationProvider,
  userId?: string | null,
): Promise<void> {
  const row = await getIntegrationRow(workspaceId, provider, userId);
  if (row) {
    await prisma.integration.update({
      where: { id: row.id },
      data: { status: "connected", lastSuccessAt: new Date() },
    });
  }
}

export async function markIntegrationError(
  workspaceId: string,
  provider: IntegrationProvider,
  userId: string | null | undefined,
  message: string,
): Promise<void> {
  const row = await getIntegrationRow(workspaceId, provider, userId);
  if (row) {
    await prisma.integration.update({
      where: { id: row.id },
      data: { status: "error", lastErrorAt: new Date() },
    });
    return;
  }
  if (provider !== "google_calendar") {
    await prisma.integration.create({
      data: {
        workspaceId,
        provider,
        userId: userId ?? null,
        status: "error",
        accountLabel: ENV_LABELS[provider],
        lastErrorAt: new Date(),
      },
    });
  }
  void message;
}

export async function recordProviderEvent(input: {
  workspaceId: string;
  provider: IntegrationProvider;
  externalId?: string;
  direction: "inbound" | "outbound";
  eventType: string;
  payload: Record<string, unknown>;
  result: "success" | "failure" | "rejected";
  errorMessage?: string | null;
}): Promise<{ duplicate: boolean; event: IntegrationEvent }> {
  const externalId = input.externalId ?? `out_${randomUUID()}`;
  const existing = await prisma.providerEvent.findUnique({
    where: { provider_externalId: { provider: input.provider, externalId } },
  });
  if (existing) {
    return { duplicate: true, event: toIntegrationEvent(existing) };
  }
  try {
    const row = await prisma.providerEvent.create({
      data: {
        workspaceId: input.workspaceId,
        provider: input.provider,
        externalId,
        direction: input.direction,
        eventType: input.eventType,
        payload: input.payload as Prisma.InputJsonValue,
        result: input.result,
        errorMessage: input.errorMessage ?? null,
      },
    });
    return { duplicate: false, event: toIntegrationEvent(row) };
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      const raced = await prisma.providerEvent.findUnique({
        where: { provider_externalId: { provider: input.provider, externalId } },
      });
      if (raced) {
        return { duplicate: true, event: toIntegrationEvent(raced) };
      }
    }
    throw error;
  }
}

export async function listIntegrationStates(
  workspaceId: string,
  userId: string,
): Promise<IntegrationState[]> {
  const states: IntegrationState[] = [];

  for (const provider of PLATFORM_PROVIDERS) {
    const resolved = await resolveCredentials(
      workspaceId,
      provider,
      provider === "google_calendar" ? userId : null,
    );
    const row = resolved?.row ?? (await getIntegrationRow(workspaceId, provider, provider === "google_calendar" ? userId : null));

    const events = await prisma.providerEvent.findMany({
      where: { workspaceId, provider },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const recentErrors = events
      .filter((event) => event.result !== "success")
      .slice(0, 5)
      .map((event) => ({
        at: event.createdAt.toISOString(),
        message: event.errorMessage ?? `${event.eventType} failed`,
      }));

    const latestSuccess = events.find((event) => event.result === "success");

    let status: IntegrationState["status"] = "not_connected";
    if (row?.status === "error") {
      status = "error";
    } else if (resolved) {
      status = "connected";
    }

    states.push(
      toIntegrationState({
        provider,
        status,
        accountLabel: row?.accountLabel ?? (resolved && resolved.source === "env" ? ENV_LABELS[provider] : null),
        lastSuccessAt: row?.lastSuccessAt ?? latestSuccess?.createdAt ?? null,
        lastErrorAt: row?.lastErrorAt ?? (recentErrors[0] ? new Date(recentErrors[0].at) : null),
        recentErrors,
        capabilities: CAPABILITIES[provider],
        limitsNote: LIMITS_NOTE[provider],
        updatedAt: row?.updatedAt ?? new Date(),
      }),
    );
  }

  return states;
}

export async function listIntegrationEventsPage(
  workspaceId: string,
  provider: IntegrationProvider,
  page: number,
  pageSize: number,
): Promise<{ data: IntegrationEvent[]; total: number }> {
  const where = { workspaceId, provider };
  const [rows, total] = await Promise.all([
    prisma.providerEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.providerEvent.count({ where }),
  ]);
  return { data: rows.map(toIntegrationEvent), total };
}
