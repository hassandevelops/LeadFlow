import { env } from "../config/env";
import { withTimeout } from "../lib/async";
import type { ProviderCredentials } from "../services/integrations";
import { ProviderError, isTransientStatus } from "./errors";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export class GoogleInvalidGrantError extends ProviderError {
  constructor(message = "Google refresh token is no longer valid") {
    super(message, { permanent: true, code: "invalid_grant" });
    this.name = "GoogleInvalidGrantError";
  }
}

function requireClient(): { clientId: string; clientSecret: string; redirectUri: string } {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new ProviderError("Google OAuth is not configured on the server", { permanent: true });
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI ?? `${env.API_URL}/api/integrations/google/callback`,
  };
}

export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = requireClient();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function tokenRequest(body: URLSearchParams): Promise<Record<string, unknown>> {
  const response = await withTimeout(
    fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }),
    15000,
    "Google token request timed out",
  );
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const errorCode = String(payload.error ?? `http_${response.status}`);
    if (errorCode === "invalid_grant") {
      throw new GoogleInvalidGrantError(
        typeof payload.error_description === "string"
          ? payload.error_description
          : "Google refresh token is no longer valid",
      );
    }
    throw new ProviderError(`Google token error: ${errorCode}`, {
      permanent: !isTransientStatus(response.status),
      code: errorCode,
    });
  }
  return payload;
}

export async function exchangeCode(code: string): Promise<{
  refreshToken: string;
  accessToken: string;
  expiresAt: string;
  email: string | null;
}> {
  const { clientId, clientSecret, redirectUri } = requireClient();
  const payload = await tokenRequest(
    new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  );

  const accessToken = String(payload.access_token ?? "");
  const refreshToken = String(payload.refresh_token ?? "");
  const expiresIn = Number(payload.expires_in ?? 3600);

  let email: string | null = null;
  try {
    const infoResponse = await withTimeout(
      fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      10000,
    );
    if (infoResponse.ok) {
      const info = (await infoResponse.json()) as { email?: string };
      email = info.email ?? null;
    }
  } catch {
    email = null;
  }

  return {
    refreshToken,
    accessToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    email,
  };
}

export async function accessTokenFor(credentials: ProviderCredentials): Promise<string> {
  const { clientId, clientSecret } = requireClient();
  const refreshToken = credentials.refreshToken;
  if (!refreshToken) {
    throw new GoogleInvalidGrantError("No refresh token stored for this connection");
  }
  const payload = await tokenRequest(
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  );
  return String(payload.access_token ?? "");
}

async function calendarRequest<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await withTimeout(
    fetch(`${CALENDAR_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    }),
    15000,
    "Google Calendar request timed out",
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; status?: string };
    };
    const status = payload.error?.status ?? `http_${response.status}`;
    if (response.status === 401) {
      throw new GoogleInvalidGrantError(
        payload.error?.message ?? "Google Calendar authorization expired",
      );
    }
    throw new ProviderError(payload.error?.message ?? `Google Calendar error (${response.status})`, {
      permanent: !isTransientStatus(response.status) && response.status !== 403,
      code: status,
    });
  }

  if (response.status === 204) {
    return {} as T;
  }
  return (await response.json().catch(() => ({}))) as T;
}

export async function freeBusy(
  credentials: ProviderCredentials,
  from: string,
  to: string,
): Promise<{ startsAt: string; endsAt: string }[]> {
  const accessToken = await accessTokenFor(credentials);
  const payload = await calendarRequest<{
    calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
  }>(accessToken, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin: from,
      timeMax: to,
      items: [{ id: credentials.calendarId || "primary" }],
    }),
  });
  const calendarId = credentials.calendarId || "primary";
  const busy = payload.calendars?.[calendarId]?.busy ?? [];
  return busy.map((slot) => ({ startsAt: slot.start, endsAt: slot.end }));
}

export async function insertEvent(
  credentials: ProviderCredentials,
  event: {
    title: string;
    description?: string | null;
    startsAt: string;
    endsAt: string;
    timeZone: string;
  },
): Promise<{ googleEventId: string }> {
  const accessToken = await accessTokenFor(credentials);
  const payload = await calendarRequest<{ id?: string }>(
    accessToken,
    `/calendars/${encodeURIComponent(credentials.calendarId || "primary")}/events?sendUpdates=all`,
    {
      method: "POST",
      body: JSON.stringify({
        summary: event.title,
        description: event.description ?? undefined,
        start: { dateTime: event.startsAt, timeZone: event.timeZone },
        end: { dateTime: event.endsAt, timeZone: event.timeZone },
      }),
    },
  );
  if (!payload.id) {
    throw new ProviderError("Google Calendar did not return an event id");
  }
  return { googleEventId: payload.id };
}

export async function patchEvent(
  credentials: ProviderCredentials,
  googleEventId: string,
  event: {
    title: string;
    description?: string | null;
    startsAt: string;
    endsAt: string;
    timeZone: string;
    status: "scheduled" | "cancelled";
  },
): Promise<void> {
  const accessToken = await accessTokenFor(credentials);
  await calendarRequest(
    accessToken,
    `/calendars/${encodeURIComponent(credentials.calendarId || "primary")}/events/${encodeURIComponent(googleEventId)}?sendUpdates=all`,
    {
      method: "PATCH",
      body: JSON.stringify({
        summary: event.title,
        description: event.description ?? undefined,
        start: { dateTime: event.startsAt, timeZone: event.timeZone },
        end: { dateTime: event.endsAt, timeZone: event.timeZone },
        status: event.status === "cancelled" ? "cancelled" : "confirmed",
      }),
    },
  );
}

export async function deleteEvent(
  credentials: ProviderCredentials,
  googleEventId: string,
): Promise<void> {
  const accessToken = await accessTokenFor(credentials);
  await calendarRequest(
    accessToken,
    `/calendars/${encodeURIComponent(credentials.calendarId || "primary")}/events/${encodeURIComponent(googleEventId)}?sendUpdates=all`,
    { method: "DELETE" },
  );
}
