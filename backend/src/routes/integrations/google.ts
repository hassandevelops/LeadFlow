import { Router } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env";
import { decryptJson } from "../../lib/crypto";
import { prisma } from "../../lib/prisma";
import { buildAuthUrl, exchangeCode } from "../../providers/google";
import { csrfProtection } from "../../middleware/session";
import { authOf, requireAuth } from "../../middleware/auth";
import { writeAudit } from "../../services/audit";
import { deleteIntegration, saveIntegration, type ProviderCredentials } from "../../services/integrations";

export const googleRouter = Router();

interface OAuthState {
  workspaceId: string;
  userId: string;
  at: number;
}

function signState(state: OAuthState): string {
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  const signature = createHmac("sha256", env.SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyState(raw: string): OAuthState | null {
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) {
    return null;
  }
  const expected = createHmac("sha256", env.SESSION_SECRET).update(payload).digest("base64url");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(signature, "utf8");
  if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
    return null;
  }
  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    if (Date.now() - state.at > 10 * 60 * 1000) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

googleRouter.get("/connect", requireAuth, (req, res) => {
  const { workspaceId, user } = authOf(req);
  const url = buildAuthUrl(signState({ workspaceId, userId: user.id, at: Date.now() }));
  res.redirect(302, url);
});

googleRouter.get("/callback", async (req, res) => {
  const appUrl = env.APP_URL;
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? verifyState(req.query.state) : null;

  if (!code || !state) {
    res.redirect(302, `${appUrl}/integrations?google=error`);
    return;
  }

  try {
    const tokens = await exchangeCode(code);
    const existing = await prisma.integration.findFirst({
      where: { workspaceId: state.workspaceId, provider: "google_calendar", userId: state.userId },
    });
    const previous = existing?.encryptedCredentials
      ? decryptJson<ProviderCredentials>(existing.encryptedCredentials)
      : null;

    const refreshToken = tokens.refreshToken || previous?.refreshToken || "";
    if (!refreshToken) {
      res.redirect(302, `${appUrl}/integrations?google=error`);
      return;
    }

    await saveIntegration({
      workspaceId: state.workspaceId,
      provider: "google_calendar",
      userId: state.userId,
      credentials: {
        refreshToken,
        accessToken: tokens.accessToken,
        expiresAt: tokens.expiresAt,
      },
      accountLabel: tokens.email ?? previous?.email ?? "Google Calendar",
    });

    const actor = await prisma.user.findUnique({
      where: { id: state.userId },
      select: { name: true },
    });
    await writeAudit({
      workspaceId: state.workspaceId,
      actor: { id: state.userId, name: actor?.name ?? "Unknown user" },
      eventType: "integration_change",
      targetType: "integration",
      targetId: "google_calendar",
      summary: `${actor?.name ?? "A user"} connected Google Calendar`,
    });

    res.redirect(302, `${appUrl}/integrations?google=connected`);
  } catch (error) {
    void error;
    res.redirect(302, `${appUrl}/integrations?google=error`);
  }
});

googleRouter.delete("/", csrfProtection, requireAuth, async (req, res) => {
  const { workspaceId, user } = authOf(req);
  await deleteIntegration(workspaceId, "google_calendar", user.id);

  await writeAudit({
    workspaceId,
    actor: { id: user.id, name: user.name },
    eventType: "integration_change",
    targetType: "integration",
    targetId: "google_calendar",
    summary: `${user.name} disconnected Google Calendar`,
  });

  res.status(204).end();
});
