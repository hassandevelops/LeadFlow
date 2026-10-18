import { withTimeout } from "../lib/async";
import type { ProviderCredentials } from "../services/integrations";
import { ProviderError, isTransientStatus } from "./errors";

export async function sendEmail(
  credentials: ProviderCredentials,
  input: { to: string; subject: string; text: string; html?: string },
): Promise<{ id: string }> {
  const response = await withTimeout(
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: credentials.fromEmail || "alerts@resend.dev",
        to: [input.to],
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
      }),
    }),
    15000,
    "Resend request timed out",
  );

  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    name?: string;
  };

  if (!response.ok) {
    throw new ProviderError(payload.message ?? `Resend error (${response.status})`, {
      permanent: !isTransientStatus(response.status),
      code: payload.name ?? `http_${response.status}`,
    });
  }

  return { id: payload.id ?? "" };
}
