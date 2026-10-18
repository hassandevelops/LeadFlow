import { env } from "../config/env";
import { withTimeout } from "../lib/async";
import { ProviderError, isTransientStatus } from "../providers/errors";

const GREEN_API_FALLBACK_BASE = "https://api.green-api.com";

function greenApiBaseUrl(): string {
  const cluster = (env.GREEN_ID ?? "").slice(0, 4);
  return /^\d{4}$/.test(cluster)
    ? `https://${cluster}.api.greenapi.com`
    : GREEN_API_FALLBACK_BASE;
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(env.GREEN_ID && env.GREEN_TOKEN);
}

export function normalizeWhatsAppNumber(number: string): string {
  let digits = number.replace(/\D/g, "");
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  if (digits.startsWith("0")) {
    digits = `92${digits.slice(1)}`;
  }
  return digits;
}

export async function sendWhatsApp(number: string, text: string): Promise<{ idMessage: string }> {
  if (!env.GREEN_ID || !env.GREEN_TOKEN) {
    throw new ProviderError("Green API is not configured: set GREEN_ID and GREEN_TOKEN", {
      permanent: true,
      code: "not_configured",
    });
  }

  const digits = normalizeWhatsAppNumber(number);
  if (!digits) {
    throw new ProviderError(`Invalid WhatsApp number: "${number}"`, {
      permanent: true,
      code: "invalid_number",
    });
  }

  const response = await withTimeout(
    fetch(`${greenApiBaseUrl()}/waInstance${env.GREEN_ID}/sendMessage/${env.GREEN_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: `${digits}@c.us`, message: text }),
    }),
    15000,
    "Green API request timed out",
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const detail = body.trim().slice(0, 300);
    throw new ProviderError(
      `Green API send failed (HTTP ${response.status})${detail ? `: ${detail}` : ""}`,
      { permanent: !isTransientStatus(response.status), code: `http_${response.status}` },
    );
  }

  const payload = (await response.json().catch(() => null)) as { idMessage?: string } | null;
  return { idMessage: payload?.idMessage ?? "" };
}
