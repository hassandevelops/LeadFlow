import { createHmac, timingSafeEqual } from "node:crypto";
import { withTimeout } from "../lib/async";
import type { ProviderCredentials } from "../services/integrations";
import { ProviderError, isTransientStatus } from "./errors";

export function twilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  const payload = Object.keys(params)
    .sort()
    .reduce((accumulator, key) => accumulator + key + params[key], url);
  return createHmac("sha1", authToken).update(payload, "utf8").digest("base64");
}

export function verifyTwilioSignature(input: {
  authToken: string;
  url: string;
  params: Record<string, string>;
  signature: string;
}): boolean {
  const expected = twilioSignature(input.authToken, input.url, input.params);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(input.signature, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function sendWhatsApp(
  credentials: ProviderCredentials,
  input: { to: string; body: string },
): Promise<{ sid: string; status: string }> {
  const accountSid = credentials.accountSid;
  const authToken = credentials.authToken;
  const from = credentials.whatsappFrom || "whatsapp:+14155238886";

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({
    From: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
    To: input.to.startsWith("whatsapp:") ? input.to : `whatsapp:${input.to}`,
    Body: input.body,
  });

  const response = await withTimeout(
    fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }),
    15000,
    "Twilio request timed out",
  );

  const payload = (await response.json().catch(() => ({}))) as {
    sid?: string;
    status?: string;
    code?: number;
    message?: string;
  };

  if (!response.ok) {
    throw new ProviderError(payload.message ?? `Twilio error (${response.status})`, {
      permanent: !isTransientStatus(response.status),
      code: payload.code ? String(payload.code) : `http_${response.status}`,
    });
  }

  return { sid: payload.sid ?? "", status: payload.status ?? "queued" };
}
