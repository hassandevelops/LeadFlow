import { UnrecoverableError } from "bullmq";
import type { OutboundJob } from "../lib/queues";
import { prisma } from "../lib/prisma";
import { emitToWorkspace } from "../realtime/io";
import { sendEmail } from "../providers/resend";
import { deleteEvent, insertEvent, patchEvent, GoogleInvalidGrantError } from "../providers/google";
import { sendWhatsApp } from "../providers/twilio";
import { ProviderError } from "../providers/errors";
import { env } from "../config/env";
import { markIntegrationError, markIntegrationSuccess, recordProviderEvent, resolveCredentials } from "./integrations";

async function failMessage(messageId: string, code: string | null, message: string): Promise<void> {
  const current = await prisma.message.findUnique({ where: { id: messageId } });
  if (!current || current.status === "failed") {
    return;
  }
  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { status: "failed", errorCode: code, errorMessage: message },
  });
  emitToWorkspace(updated.workspaceId, "message.status_updated", {
    workspaceId: updated.workspaceId,
    at: new Date().toISOString(),
    messageId: updated.id,
    status: "failed",
  });
}

async function processWhatsAppSend(job: Extract<OutboundJob, { kind: "whatsapp_send" }>): Promise<void> {
  const message = await prisma.message.findUnique({
    where: { id: job.messageId },
    include: { conversation: { include: { contact: true } } },
  });
  if (!message || message.workspaceId !== job.workspaceId || message.direction !== "outbound") {
    return;
  }
  if (message.status === "sent" || message.status === "delivered") {
    return;
  }

  const contact = message.conversation.contact;
  if (!contact.phone) {
    await failMessage(message.id, "missing_phone", "Contact has no phone number");
    return;
  }
  if (contact.optedOut) {
    await failMessage(message.id, "opted_out", "Contact opted out of WhatsApp messages");
    return;
  }

  const resolved = await resolveCredentials(job.workspaceId, "twilio_whatsapp");
  if (!resolved) {
    await failMessage(message.id, "not_connected", "WhatsApp is not connected");
    await recordProviderEvent({
      workspaceId: job.workspaceId,
      provider: "twilio_whatsapp",
      direction: "outbound",
      eventType: "message_send",
      payload: { messageId: message.id },
      result: "failure",
      errorMessage: "WhatsApp is not connected",
    });
    return;
  }

  try {
    const { sid } = await sendWhatsApp(resolved.credentials, {
      to: contact.phone,
      body: message.body,
    });
    const updated = await prisma.message.update({
      where: { id: message.id },
      data: {
        status: "sent",
        providerMessageId: sid || message.providerMessageId,
        errorCode: null,
        errorMessage: null,
      },
    });
    await markIntegrationSuccess(job.workspaceId, "twilio_whatsapp");
    await recordProviderEvent({
      workspaceId: job.workspaceId,
      provider: "twilio_whatsapp",
      externalId: `send:${sid || message.id}`,
      direction: "outbound",
      eventType: "message_send",
      payload: { messageId: message.id, sid },
      result: "success",
    });
    emitToWorkspace(job.workspaceId, "message.status_updated", {
      workspaceId: job.workspaceId,
      at: new Date().toISOString(),
      messageId: updated.id,
      status: "sent",
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      await recordProviderEvent({
        workspaceId: job.workspaceId,
        provider: "twilio_whatsapp",
        direction: "outbound",
        eventType: "message_send",
        payload: { messageId: message.id },
        result: "failure",
        errorMessage: error.message,
      });
      if (error.permanent) {
        await failMessage(message.id, error.code ?? "provider_error", error.message);
        return;
      }
    }
    throw error;
  }
}

async function processEscalationEmail(
  job: Extract<OutboundJob, { kind: "escalation_email" }>,
): Promise<void> {
  const lead = await prisma.opportunity.findUnique({ where: { id: job.leadId } });
  const owner = await prisma.user.findUnique({ where: { id: job.ownerId } });
  if (!lead || !owner || lead.workspaceId !== job.workspaceId) {
    return;
  }

  const resolved = await resolveCredentials(job.workspaceId, "resend");
  if (!resolved) {
    await recordProviderEvent({
      workspaceId: job.workspaceId,
      provider: "resend",
      externalId: `escalation:${job.leadId}:${job.level}:not_connected`,
      direction: "outbound",
      eventType: "escalation_email",
      payload: { leadId: job.leadId, ownerId: job.ownerId },
      result: "failure",
      errorMessage: "Email provider is not connected",
    });
    return;
  }

  const setting = await prisma.notificationSetting.findUnique({
    where: { userId_channel: { userId: owner.id, channel: "email" } },
  });
  const to = setting?.destination ?? owner.email;
  const link = `${env.APP_URL}/opportunities/${lead.id}`;

  try {
    const { id } = await sendEmail(resolved.credentials, {
      to,
      subject: `Lead escalated: ${lead.title}`,
      text: [
        `A lead was escalated to you.`,
        ``,
        `Lead: ${lead.title}`,
        `Source: ${lead.source}`,
        `Reason: ${job.reason}`,
        `Level: ${job.level}`,
        ``,
        `Open it in LeadFlow: ${link}`,
      ].join("\n"),
    });
    await markIntegrationSuccess(job.workspaceId, "resend");
    await recordProviderEvent({
      workspaceId: job.workspaceId,
      provider: "resend",
      externalId: `escalation:${job.leadId}:${job.level}`,
      direction: "outbound",
      eventType: "escalation_email",
      payload: { leadId: job.leadId, ownerId: job.ownerId, emailId: id },
      result: "success",
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      await recordProviderEvent({
        workspaceId: job.workspaceId,
        provider: "resend",
        externalId: `escalation:${job.leadId}:${job.level}:failure`,
        direction: "outbound",
        eventType: "escalation_email",
        payload: { leadId: job.leadId, ownerId: job.ownerId },
        result: "failure",
        errorMessage: error.message,
      });
      if (error.permanent) {
        await markIntegrationError(job.workspaceId, "resend", null, error.message);
        throw new UnrecoverableError(error.message);
      }
    }
    throw error;
  }
}

async function processCalendarSync(
  job: Extract<OutboundJob, { kind: "calendar_sync" }>,
): Promise<void> {
  const appointment =
    job.action === "delete"
      ? null
      : await prisma.appointment.findUnique({ where: { id: job.appointmentId } });

  if (job.action !== "delete" && (!appointment || appointment.workspaceId !== job.workspaceId)) {
    return;
  }

  const userId = job.userId ?? appointment?.userId;
  const googleEventId = job.googleEventId === undefined ? appointment?.googleEventId : job.googleEventId;
  if (!userId) {
    return;
  }

  const resolved = await resolveCredentials(job.workspaceId, "google_calendar", userId);
  if (!resolved) {
    if (appointment) {
      const updated = await prisma.appointment.update({
        where: { id: appointment.id },
        data: { syncState: "failed", syncError: "Google Calendar is not connected" },
      });
      emitToWorkspace(job.workspaceId, "appointment.updated", {
        workspaceId: job.workspaceId,
        at: new Date().toISOString(),
        appointmentId: updated.id,
        status: updated.syncState,
      });
    }
    await recordProviderEvent({
      workspaceId: job.workspaceId,
      provider: "google_calendar",
      direction: "outbound",
      eventType: `calendar_${job.action}`,
      payload: { appointmentId: job.appointmentId },
      result: "failure",
      errorMessage: "Google Calendar is not connected",
    });
    return;
  }

  try {
    if (job.action === "delete") {
      if (googleEventId) {
        await deleteEvent(resolved.credentials, googleEventId);
      }
      await markIntegrationSuccess(job.workspaceId, "google_calendar", userId);
      await recordProviderEvent({
        workspaceId: job.workspaceId,
        provider: "google_calendar",
        direction: "outbound",
        eventType: "calendar_delete",
        payload: { appointmentId: job.appointmentId, googleEventId },
        result: "success",
      });
      return;
    }

    if (!appointment) {
      return;
    }

    if (job.action === "create") {
      const { googleEventId: createdId } = await insertEvent(resolved.credentials, {
        title: appointment.title,
        description: appointment.description,
        startsAt: appointment.startsAt.toISOString(),
        endsAt: appointment.endsAt.toISOString(),
        timeZone: appointment.timeZone,
      });
      const updated = await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          googleEventId: createdId,
          syncState: "synced",
          syncError: null,
          status: appointment.status,
        },
      });
      emitToWorkspace(job.workspaceId, "appointment.updated", {
        workspaceId: job.workspaceId,
        at: new Date().toISOString(),
        appointmentId: updated.id,
        status: updated.syncState,
      });
    } else {
      if (!appointment.googleEventId) {
        throw new ProviderError("Appointment has no Google event to update", { permanent: true });
      }
      await patchEvent(resolved.credentials, appointment.googleEventId, {
        title: appointment.title,
        description: appointment.description,
        startsAt: appointment.startsAt.toISOString(),
        endsAt: appointment.endsAt.toISOString(),
        timeZone: appointment.timeZone,
        status: appointment.status,
      });
      const updated = await prisma.appointment.update({
        where: { id: appointment.id },
        data: { syncState: "synced", syncError: null },
      });
      emitToWorkspace(job.workspaceId, "appointment.updated", {
        workspaceId: job.workspaceId,
        at: new Date().toISOString(),
        appointmentId: updated.id,
        status: updated.syncState,
      });
    }

    await markIntegrationSuccess(job.workspaceId, "google_calendar", userId);
    await recordProviderEvent({
      workspaceId: job.workspaceId,
      provider: "google_calendar",
      direction: "outbound",
      eventType: `calendar_${job.action}`,
      payload: { appointmentId: job.appointmentId },
      result: "success",
    });
  } catch (error) {
    if (error instanceof GoogleInvalidGrantError) {
      await markIntegrationError(job.workspaceId, "google_calendar", userId, error.message);
      if (appointment) {
        const updated = await prisma.appointment.update({
          where: { id: appointment.id },
          data: {
            syncState: "needs_reconnect",
            syncError: "Google Calendar authorization expired — reconnect needed",
          },
        });
        emitToWorkspace(job.workspaceId, "appointment.updated", {
          workspaceId: job.workspaceId,
          at: new Date().toISOString(),
          appointmentId: updated.id,
          status: updated.syncState,
        });
      }
      await recordProviderEvent({
        workspaceId: job.workspaceId,
        provider: "google_calendar",
        direction: "outbound",
        eventType: `calendar_${job.action}`,
        payload: { appointmentId: job.appointmentId },
        result: "failure",
        errorMessage: error.message,
      });
      throw new UnrecoverableError(error.message);
    }
    if (error instanceof ProviderError && error.permanent) {
      await recordProviderEvent({
        workspaceId: job.workspaceId,
        provider: "google_calendar",
        direction: "outbound",
        eventType: `calendar_${job.action}`,
        payload: { appointmentId: job.appointmentId },
        result: "failure",
        errorMessage: error.message,
      });
      throw new UnrecoverableError(error.message);
    }
    throw error;
  }
}

export async function handleOutboundJob(job: OutboundJob): Promise<void> {
  switch (job.kind) {
    case "whatsapp_send":
      await processWhatsAppSend(job);
      return;
    case "escalation_email":
      await processEscalationEmail(job);
      return;
    case "calendar_sync":
      await processCalendarSync(job);
      return;
  }
}

export async function handleOutboundFailure(job: OutboundJob, error: Error): Promise<void> {
  if (job.kind === "whatsapp_send") {
    await failMessage(job.messageId, null, error.message).catch(() => undefined);
    return;
  }
  if (job.kind === "calendar_sync") {
    if (job.action !== "delete") {
      const appointment = await prisma.appointment.findUnique({ where: { id: job.appointmentId } });
      if (appointment && appointment.syncState === "pending") {
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { syncState: "failed", syncError: error.message },
        });
        emitToWorkspace(job.workspaceId, "appointment.updated", {
          workspaceId: job.workspaceId,
          at: new Date().toISOString(),
          appointmentId: appointment.id,
          status: "failed",
        });
      }
    }
    return;
  }
  if (job.kind === "escalation_email") {
    await recordProviderEvent({
      workspaceId: job.workspaceId,
      provider: "resend",
      externalId: `escalation:${job.leadId}:${job.level}:final_failure`,
      direction: "outbound",
      eventType: "escalation_email",
      payload: { leadId: job.leadId, ownerId: job.ownerId },
      result: "failure",
      errorMessage: error.message,
    }).catch(() => undefined);
  }
}
