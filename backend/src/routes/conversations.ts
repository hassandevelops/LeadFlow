import { paginationQuerySchema, sendMessageSchema } from "@leadflow/shared";
import { Router } from "express";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { enqueueOutbound } from "../lib/queues";
import { toConversation, toMessage } from "../lib/serialize";
import { parseBody, parseIdParam, parseQuery } from "../lib/validation";
import { authOf, requirePermission } from "../middleware/auth";
import { isWhatsAppConfigured } from "../services/whatsapp";

export const conversationsRouter = Router();

async function findConversation(workspaceId: string, id: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id, workspaceId },
    include: { contact: { select: { id: true, name: true, optedOut: true } } },
  });
  if (!conversation) {
    throw ApiError.notFound("Conversation not found");
  }
  return conversation;
}

conversationsRouter.get("/conversations", requirePermission("crm.view"), async (req, res) => {
  const { workspaceId } = authOf(req);
  const query = parseQuery(paginationQuerySchema, req);

  const [total, rows] = await Promise.all([
    prisma.conversation.count({ where: { workspaceId } }),
    prisma.conversation.findMany({
      where: { workspaceId },
      orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  res.json({ data: rows.map(toConversation), page: query.page, pageSize: query.pageSize, total });
});

conversationsRouter.get("/conversations/:id/messages", requirePermission("crm.view"), async (req, res) => {
  const { workspaceId } = authOf(req);
  const id = parseIdParam(req);
  const query = parseQuery(paginationQuerySchema, req);
  const conversation = await findConversation(workspaceId, id);

  const [total, rows] = await Promise.all([
    prisma.message.count({ where: { conversationId: conversation.id } }),
    prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  if (conversation.unreadCount > 0) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { unreadCount: 0 },
    });
  }

  res.json({ data: rows.map(toMessage), page: query.page, pageSize: query.pageSize, total });
});

conversationsRouter.post("/conversations/:id/messages", requirePermission("crm.edit"), async (req, res) => {
  const { workspaceId, user } = authOf(req);
  const id = parseIdParam(req);
  const input = parseBody(sendMessageSchema, req);
  const conversation = await findConversation(workspaceId, id);

  if (conversation.contact.optedOut) {
    throw ApiError.conflict("This contact has opted out of WhatsApp messages");
  }

  if (!isWhatsAppConfigured()) {
    throw ApiError.providerError(
      "WhatsApp is not connected. Set GREEN_ID and GREEN_TOKEN in the backend environment.",
    );
  }

  const now = new Date();
  const message = await prisma.message.create({
    data: {
      workspaceId,
      conversationId: conversation.id,
      direction: "outbound",
      body: input.body,
      status: "queued",
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: now,
      ...(conversation.assignedUserId ? {} : { assignedUserId: user.id }),
    },
  });

  await enqueueOutbound({ kind: "whatsapp_send", workspaceId, messageId: message.id });

  res.status(201).json(toMessage(message));
});

conversationsRouter.post(
  "/conversations/:id/messages/:messageId/retry",
  requirePermission("crm.edit"),
  async (req, res) => {
    const { workspaceId } = authOf(req);
    const id = parseIdParam(req);
    const messageId = String(req.params.messageId ?? "");
    const conversation = await findConversation(workspaceId, id);

    const message = await prisma.message.findFirst({
      where: { id: messageId, conversationId: conversation.id },
    });
    if (!message) {
      throw ApiError.notFound("Message not found");
    }
    if (message.status !== "failed") {
      throw ApiError.conflict("Only failed messages can be retried");
    }
    if (conversation.contact.optedOut) {
      throw ApiError.conflict("This contact has opted out of WhatsApp messages");
    }

    if (!isWhatsAppConfigured()) {
      throw ApiError.providerError(
        "WhatsApp is not connected. Set GREEN_ID and GREEN_TOKEN in the backend environment.",
      );
    }

    const updated = await prisma.message.update({
      where: { id: message.id },
      data: {
        status: "queued",
        errorCode: null,
        errorMessage: null,
        providerMessageId: null,
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    await enqueueOutbound({ kind: "whatsapp_send", workspaceId, messageId: updated.id });

    res.json(toMessage(updated));
  },
);
