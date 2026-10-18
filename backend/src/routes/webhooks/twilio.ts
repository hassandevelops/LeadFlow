import { Router } from "express";
import { decryptJson } from "../../lib/crypto";
import { phoneDigits } from "../../lib/phone";
import { prisma } from "../../lib/prisma";
import { emitToWorkspace } from "../../realtime/io";
import { verifyTwilioSignature } from "../../providers/twilio";
import { recordProviderEvent } from "../../services/integrations";
import { findContactByEmailOrPhone } from "../../services/lead-intake";

export const twilioWebhooksRouter = Router();

interface TwilioCredentials {
  accountSid?: string;
  authToken?: string;
  whatsappFrom?: string;
  [key: string]: string | undefined;
}

function stringParams(body: unknown): Record<string, string> {
  if (!body || typeof body !== "object") {
    return {};
  }
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (typeof value === "string") {
      params[key] = value;
    }
  }
  return params;
}

async function resolveWorkspaceForNumber(
  to: string,
): Promise<{ workspaceId: string; credentials: TwilioCredentials } | null> {
  const digits = phoneDigits(to.replace(/^whatsapp:/, ""));
  const rows = await prisma.integration.findMany({
    where: { provider: "twilio_whatsapp" },
  });
  for (const row of rows) {
    if (!row.encryptedCredentials) {
      continue;
    }
    const credentials = decryptJson<TwilioCredentials>(row.encryptedCredentials);
    if (!credentials?.whatsappFrom) {
      continue;
    }
    if (phoneDigits(credentials.whatsappFrom) === digits) {
      return { workspaceId: row.workspaceId, credentials };
    }
  }
  return null;
}

function webhookUrl(req: { protocol: string; get: (name: string) => string | undefined; originalUrl: string }): string {
  const host = req.get("host") ?? "localhost";
  return `${req.protocol}://${host}${req.originalUrl.split("?")[0]}`;
}

twilioWebhooksRouter.post("/webhooks/twilio/whatsapp", async (req, res) => {
  const params = stringParams(req.body);
  const messageSid = params.MessageSid ?? "";
  const from = params.From ?? "";
  const to = params.To ?? "";
  const body = params.Body ?? "";

  if (!messageSid || !from || !to) {
    res.status(200).json({ status: "ignored", reason: "missing_fields" });
    return;
  }

  const target = await resolveWorkspaceForNumber(to);
  if (!target) {
    res.status(200).json({ status: "ignored", reason: "unknown_number" });
    return;
  }

  const signature = String(req.get("x-twilio-signature") ?? "");
  const signatureOk =
    signature.length > 0 &&
    verifyTwilioSignature({
      authToken: target.credentials.authToken ?? "",
      url: webhookUrl(req),
      params,
      signature,
    });
  if (!signatureOk) {
    res.status(403).json({ error: { code: "forbidden", message: "Invalid Twilio signature" } });
    return;
  }

  const event = await recordProviderEvent({
    workspaceId: target.workspaceId,
    provider: "twilio_whatsapp",
    externalId: messageSid,
    direction: "inbound",
    eventType: "whatsapp.inbound",
    payload: {
      MessageSid: messageSid,
      From: from,
      To: to,
      Body: body,
      ProfileName: params.ProfileName ?? null,
      WaId: params.WaId ?? null,
      NumMedia: params.NumMedia ?? "0",
    },
    result: "success",
  });
  if (event.duplicate) {
    res.status(200).json({ status: "duplicate" });
    return;
  }

  const contactPhone = from.replace(/^whatsapp:/, "");
  let contact = await findContactByEmailOrPhone(target.workspaceId, null, contactPhone);
  if (!contact) {
    const created = await prisma.contact.create({
      data: {
        workspaceId: target.workspaceId,
        name: params.ProfileName?.trim() || contactPhone,
        phone: contactPhone,
      },
    });
    contact = { id: created.id, ownerId: created.ownerId };
  }

  let conversation = await prisma.conversation.findFirst({
    where: { workspaceId: target.workspaceId, contactId: contact.id, channel: "whatsapp" },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        workspaceId: target.workspaceId,
        contactId: contact.id,
        channel: "whatsapp",
      },
    });
  }

  const now = new Date();
  const message = await prisma.message.create({
    data: {
      workspaceId: target.workspaceId,
      conversationId: conversation.id,
      direction: "inbound",
      body,
      status: "received",
      providerMessageId: messageSid,
    },
  });

  const updatedConversation = await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: now, unreadCount: { increment: 1 } },
  });

  const contactName = (
    await prisma.contact.findUnique({ where: { id: contact.id }, select: { name: true } })
  )?.name;

  emitToWorkspace(target.workspaceId, "message.received", {
    workspaceId: target.workspaceId,
    at: now.toISOString(),
    conversationId: conversation.id,
    messageId: message.id,
    contactId: contact.id,
  });
  emitToWorkspace(target.workspaceId, "notification.created", {
    workspaceId: target.workspaceId,
    at: now.toISOString(),
    notificationId: updatedConversation.id,
    title: `New WhatsApp reply from ${contactName ?? "a contact"}`,
    link: "/conversations",
  });

  res.status(200).json({ status: "ok" });
});

const STATUS_MAP: Record<string, string> = {
  accepted: "queued",
  queued: "queued",
  sending: "queued",
  sent: "sent",
  delivered: "delivered",
  read: "delivered",
  undelivered: "failed",
  failed: "failed",
};

twilioWebhooksRouter.post("/webhooks/twilio/status", async (req, res) => {
  const params = stringParams(req.body);
  const messageSid = params.MessageSid ?? "";
  const rawStatus = (params.MessageStatus ?? "").toLowerCase();

  if (!messageSid || !rawStatus) {
    res.status(200).json({ status: "ignored", reason: "missing_fields" });
    return;
  }

  const message = await prisma.message.findUnique({ where: { providerMessageId: messageSid } });
  if (!message) {
    res.status(200).json({ status: "ignored", reason: "unknown_message" });
    return;
  }

  const event = await recordProviderEvent({
    workspaceId: message.workspaceId,
    provider: "twilio_whatsapp",
    externalId: `${messageSid}:${rawStatus}`,
    direction: "outbound",
    eventType: "whatsapp.status",
    payload: {
      MessageSid: messageSid,
      MessageStatus: rawStatus,
      ErrorCode: params.ErrorCode ?? null,
    },
    result: "success",
  });
  if (event.duplicate) {
    res.status(200).json({ status: "duplicate" });
    return;
  }

  const status = STATUS_MAP[rawStatus] ?? message.status;
  const failed = status === "failed";
  const updated = await prisma.message.update({
    where: { id: message.id },
    data: {
      status: status as typeof message.status,
      ...(failed
        ? {
            errorCode: params.ErrorCode ?? "twilio_delivery_failed",
            errorMessage: params.ErrorMessage ?? "Twilio could not deliver the message",
          }
        : {}),
    },
  });

  const now = new Date();
  emitToWorkspace(message.workspaceId, "message.status_updated", {
    workspaceId: message.workspaceId,
    at: now.toISOString(),
    messageId: updated.id,
    status: updated.status,
  });

  res.status(200).json({ status: "ok" });
});
