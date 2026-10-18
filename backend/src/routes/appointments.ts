import { createAppointmentSchema, paginationQuerySchema, updateAppointmentSchema } from "@leadflow/shared";
import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { actorOf } from "../lib/access";
import { ProviderError } from "../providers/errors";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { enqueueOutbound } from "../lib/queues";
import { toAppointment } from "../lib/serialize";
import { parseBody, parseIdParam, parseQuery } from "../lib/validation";
import { authOf, requirePermission } from "../middleware/auth";
import { freeBusy, GoogleInvalidGrantError } from "../providers/google";
import { recordActivity } from "../services/activity";
import { markIntegrationError, markIntegrationSuccess, resolveCredentials } from "../services/integrations";

export const appointmentsRouter = Router();

const busyQuerySchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
});

const listQuerySchema = paginationQuerySchema.extend({
  userId: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

appointmentsRouter.get("/users/:id/busy", requirePermission("crm.view"), async (req, res) => {
  const { workspaceId } = authOf(req);
  const userId = parseIdParam(req);
  if (!req.query.from || !req.query.to) {
    throw ApiError.validationFailed("from and to are required");
  }
  const query = parseQuery(busyQuerySchema, req);

  const user = await prisma.user.findFirst({ where: { id: userId, workspaceId } });
  if (!user) {
    throw ApiError.notFound("User not found");
  }

  const resolved = await resolveCredentials(workspaceId, "google_calendar", user.id);
  if (!resolved) {
    throw ApiError.providerError(`${user.name} has not connected Google Calendar`);
  }

  try {
    const slots = await freeBusy(resolved.credentials, query.from, query.to);
    if (resolved.row) {
      await markIntegrationSuccess(workspaceId, "google_calendar", resolved.row.userId);
    }
    res.json(slots);
  } catch (error) {
    if (resolved.row) {
      const message = error instanceof Error ? error.message : "Google Calendar error";
      await markIntegrationError(workspaceId, "google_calendar", resolved.row.userId, message);
    }
    if (error instanceof GoogleInvalidGrantError) {
      throw ApiError.providerError("Google Calendar authorization expired — reconnect needed");
    }
    if (error instanceof ProviderError) {
      throw ApiError.providerError(error.message);
    }
    throw error;
  }
});

appointmentsRouter.get("/appointments", requirePermission("crm.view"), async (req, res) => {
  const { workspaceId } = authOf(req);
  const query = parseQuery(listQuerySchema, req);

  const where: Prisma.AppointmentWhereInput = {
    workspaceId,
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.from ? { endsAt: { gt: new Date(query.from) } } : {}),
    ...(query.to ? { startsAt: { lt: new Date(query.to) } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.appointment.count({ where }),
    prisma.appointment.findMany({
      where,
      orderBy: { startsAt: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  res.json({ data: rows.map(toAppointment), page: query.page, pageSize: query.pageSize, total });
});

appointmentsRouter.post("/appointments", requirePermission("crm.edit"), async (req, res) => {
  const auth = authOf(req);
  const { workspaceId } = auth;
  const input = parseBody(createAppointmentSchema, req);

  const contact = await prisma.contact.findFirst({ where: { id: input.contactId, workspaceId } });
  if (!contact) {
    throw ApiError.notFound("Contact not found");
  }
  const user = await prisma.user.findFirst({ where: { id: input.userId, workspaceId } });
  if (!user) {
    throw ApiError.notFound("User not found");
  }
  if (input.opportunityId) {
    const opportunity = await prisma.opportunity.findFirst({
      where: { id: input.opportunityId, workspaceId },
    });
    if (!opportunity) {
      throw ApiError.notFound("Opportunity not found");
    }
  }

  const resolved = await resolveCredentials(workspaceId, "google_calendar", user.id);
  if (!resolved) {
    throw ApiError.providerError(
      `${user.name} has not connected Google Calendar, so the appointment cannot be synced`,
    );
  }

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);

  const overlapping = await prisma.appointment.findFirst({
    where: {
      workspaceId,
      userId: user.id,
      status: "scheduled",
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
  });
  if (overlapping) {
    throw ApiError.conflict("This time overlaps another appointment", {
      overlapping: toAppointment(overlapping),
    });
  }

  const appointment = await prisma.appointment.create({
    data: {
      workspaceId,
      contactId: contact.id,
      opportunityId: input.opportunityId ?? null,
      userId: user.id,
      title: input.title,
      description: input.description ?? null,
      startsAt,
      endsAt,
      timeZone: input.timeZone,
      syncState: "pending",
    },
  });

  await recordActivity({
    workspaceId,
    entityType: "contact",
    entityId: contact.id,
    type: "appointment",
    actor: actorOf(auth),
    summary: `Appointment booked: ${appointment.title}`,
  });

  await enqueueOutbound({
    kind: "calendar_sync",
    workspaceId,
    appointmentId: appointment.id,
    action: "create",
    userId: user.id,
  });

  res.status(201).json(toAppointment(appointment));
});

appointmentsRouter.patch("/appointments/:id", requirePermission("crm.edit"), async (req, res) => {
  const { workspaceId } = authOf(req);
  const id = parseIdParam(req);
  const input = parseBody(updateAppointmentSchema, req);

  const appointment = await prisma.appointment.findFirst({ where: { id, workspaceId } });
  if (!appointment) {
    throw ApiError.notFound("Appointment not found");
  }

  const nextStartsAt = input.startsAt ? new Date(input.startsAt) : appointment.startsAt;
  const nextEndsAt = input.endsAt ? new Date(input.endsAt) : appointment.endsAt;
  if (nextEndsAt <= nextStartsAt) {
    throw ApiError.validationFailed("endsAt must be after startsAt", [
      { path: "endsAt", message: "endsAt must be after startsAt" },
    ]);
  }

  const timesChanged =
    nextStartsAt.getTime() !== appointment.startsAt.getTime() ||
    nextEndsAt.getTime() !== appointment.endsAt.getTime();
  const nextStatus = input.status ?? appointment.status;

  if (timesChanged && nextStatus === "scheduled") {
    const overlapping = await prisma.appointment.findFirst({
      where: {
        workspaceId,
        userId: appointment.userId,
        status: "scheduled",
        id: { not: appointment.id },
        startsAt: { lt: nextEndsAt },
        endsAt: { gt: nextStartsAt },
      },
    });
    if (overlapping) {
      throw ApiError.conflict("This time overlaps another appointment", {
        overlapping: toAppointment(overlapping),
      });
    }
  }

  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.startsAt === undefined ? {} : { startsAt: nextStartsAt }),
      ...(input.endsAt === undefined ? {} : { endsAt: nextEndsAt }),
      ...(input.timeZone === undefined ? {} : { timeZone: input.timeZone }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...((timesChanged && nextStatus === "scheduled") ||
      (input.status === "cancelled" && appointment.status !== "cancelled")
        ? { syncState: "pending" as const, syncError: null }
        : {}),
    },
  });

  if (input.status === "cancelled" && appointment.status !== "cancelled" && appointment.googleEventId) {
    await enqueueOutbound({
      kind: "calendar_sync",
      workspaceId,
      appointmentId: updated.id,
      action: "delete",
      userId: updated.userId,
      googleEventId: appointment.googleEventId,
    });
  } else if (timesChanged && nextStatus === "scheduled" && updated.googleEventId) {
    await enqueueOutbound({
      kind: "calendar_sync",
      workspaceId,
      appointmentId: updated.id,
      action: "update",
      userId: updated.userId,
    });
  }

  res.json(toAppointment(updated));
});

appointmentsRouter.delete("/appointments/:id", requirePermission("crm.edit"), async (req, res) => {
  const { workspaceId } = authOf(req);
  const id = parseIdParam(req);

  const appointment = await prisma.appointment.findFirst({ where: { id, workspaceId } });
  if (!appointment) {
    throw ApiError.notFound("Appointment not found");
  }

  if (appointment.googleEventId) {
    await enqueueOutbound({
      kind: "calendar_sync",
      workspaceId,
      appointmentId: appointment.id,
      action: "delete",
      userId: appointment.userId,
      googleEventId: appointment.googleEventId,
    });
  }

  await prisma.appointment.delete({ where: { id: appointment.id } });

  res.status(204).end();
});
