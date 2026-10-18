import { api } from "../lib/api-client";
import { conversationKeys } from "../lib/query-keys";
import { useApiMutation, useApiQuery } from "./helpers";
import type { Conversation, Message, Page, SendMessageInput } from "@leadflow/shared";

export function useConversations(page: number, pageSize = 25) {
  const query = { page, pageSize };
  return useApiQuery<Page<Conversation>>(conversationKeys.list(query), "/conversations", query, {
    refetchInterval: 15_000,
  });
}

export function useMessages(conversationId: string | undefined, page: number, pageSize = 50) {
  const query = { page, pageSize };
  return useApiQuery<Page<Message>>(
    conversationKeys.messages(conversationId ?? "none", page),
    `/conversations/${conversationId}/messages`,
    query,
    { enabled: Boolean(conversationId), refetchInterval: 10_000 },
  );
}

export function useSendMessage(conversationId: string) {
  return useApiMutation<SendMessageInput, Message>(
    (input) => api.post<Message>(`/conversations/${conversationId}/messages`, input),
    { invalidate: [["conversations"]] },
  );
}

export function useRetryMessage(conversationId: string) {
  return useApiMutation<string, Message>(
    (messageId) => api.post<Message>(`/conversations/${conversationId}/messages/${messageId}/retry`),
    { invalidate: [["conversations"]] },
  );
}
