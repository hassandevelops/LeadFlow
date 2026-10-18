import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { useConversations, useMessages, useRetryMessage, useSendMessage } from "../api/messaging";
import { useContacts } from "../api/crm";
import { useIntegrations } from "../api/integrations";
import { isApiClientError } from "../lib/api-client";
import { Avatar } from "../components/ui/avatar";
import { Badge, StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, PageHeader } from "../components/ui/card";
import { Pagination } from "../components/ui/pagination";
import { EmptyState, ErrorBlock, LoadingBlock } from "../components/ui/states";
import { useToast } from "../components/ui/toast";
import { TextInput } from "../components/ui/field";
import { cn } from "../lib/cn";
import { formatTime, humanize, timeAgo } from "../lib/format";

export function InboxPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const conversationsQuery = useConversations(page, pageSize);
  const contactsQuery = useContacts({ page: 1, pageSize: 100 });
  const integrationsQuery = useIntegrations();

  const conversations = conversationsQuery.data?.data ?? [];
  const contactsById = useMemo(
    () => new Map((contactsQuery.data?.data ?? []).map((contact) => [contact.id, contact])),
    [contactsQuery.data],
  );

  const selectedId = searchParams.get("c") ?? conversations[0]?.id ?? null;
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId);
  const selectedContact = selectedConversation
    ? contactsById.get(selectedConversation.contactId)
    : undefined;

  const messagesQuery = useMessages(selectedId ?? undefined, 1, 100);
  const sendMessage = useSendMessage(selectedId ?? "");
  const retryMessage = useRetryMessage(selectedId ?? "");
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setDraft("");
  }, [selectedId]);

  const twilio = (integrationsQuery.data ?? []).find(
    (integration) => integration.provider === "twilio_whatsapp",
  );
  const twilioConnected = twilio?.status === "connected";

  function select(conversationId: string) {
    setSearchParams({ c: conversationId });
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || !selectedId) return;
    try {
      await sendMessage.mutateAsync({ body: draft.trim() });
      setDraft("");
    } catch (error) {
      if (isApiClientError(error) && error.code === "conflict") {
        toast.show({
          title: "Message blocked",
          description: error.message,
          variant: "error",
        });
      } else {
        toast.show({
          title: "Could not send message",
          description: error instanceof Error ? error.message : undefined,
          variant: "error",
        });
      }
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <PageHeader
        title="Inbox"
        description="WhatsApp conversations with your contacts."
        actions={
          <Badge tone={twilioConnected ? "green" : "red"}>
            {twilioConnected ? "Twilio connected" : "Twilio not connected"}
          </Badge>
        }
      />

      {!twilioConnected && !integrationsQuery.isPending ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          WhatsApp sending is disabled until Twilio is connected.{" "}
          <Link to="/integrations" className="font-medium underline">
            Connect Twilio
          </Link>
          .
        </div>
      ) : null}

      <div className="grid flex-1 gap-4 lg:grid-cols-[20rem_1fr]">
        <Card className={cn("overflow-hidden", selectedId ? "hidden lg:block" : "")}>
          {conversationsQuery.isPending ? <LoadingBlock /> : null}
          {conversationsQuery.isError ? (
            <ErrorBlock
              error={conversationsQuery.error}
              onRetry={() => void conversationsQuery.refetch()}
            />
          ) : null}
          {conversationsQuery.data && conversations.length === 0 ? (
            <EmptyState title="No conversations yet" description="Inbound messages appear here." />
          ) : null}
          <div className="divide-y divide-slate-100">
            {conversations.map((conversation) => {
              const contact = contactsById.get(conversation.contactId);
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => select(conversation.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50",
                    conversation.id === selectedId ? "bg-slate-100" : "",
                  )}
                >
                  <Avatar name={contact?.name ?? "?"} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-900">
                        {contact?.name ?? "Unknown contact"}
                      </span>
                      {conversation.lastMessageAt ? (
                        <span className="shrink-0 text-xs text-slate-400">
                          {timeAgo(conversation.lastMessageAt)}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-slate-500">
                        {contact?.optedOut ? "Opted out" : humanize(conversation.channel)}
                      </span>
                      {conversation.unreadCount > 0 ? (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1.5 text-xs font-medium text-white">
                          {conversation.unreadCount}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {conversationsQuery.data ? (
            <Pagination
              page={page}
              pageSize={pageSize}
              total={conversationsQuery.data.total}
              onPageChange={setPage}
            />
          ) : null}
        </Card>

        <Card className={cn("flex min-h-[32rem] flex-col", selectedId ? "" : "hidden lg:flex")}>
          {selectedConversation && selectedContact ? (
            <>
              <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
                <div className="flex items-center gap-3">
                  <Avatar name={selectedContact.name} />
                  <div>
                    <Link
                      to={`/contacts/${selectedContact.id}`}
                      className="text-sm font-semibold text-slate-900 underline-offset-2 hover:underline"
                    >
                      {selectedContact.name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {selectedContact.phone ?? selectedContact.email ?? "No contact info"}
                    </p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="lg:hidden"
                  onClick={() => setSearchParams({})}
                >
                  Back
                </Button>
              </header>

              <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {messagesQuery.isPending ? <LoadingBlock /> : null}
                {messagesQuery.isError ? (
                  <ErrorBlock
                    error={messagesQuery.error}
                    onRetry={() => void messagesQuery.refetch()}
                  />
                ) : null}
                {messagesQuery.data?.data.length === 0 ? (
                  <EmptyState title="No messages yet" description="Send the first message below." />
                ) : null}
                {messagesQuery.data?.data.map((message) => {
                  const outbound = message.direction === "outbound";
                  return (
                    <div
                      key={message.id}
                      className={cn("flex", outbound ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[75%] rounded-2xl px-4 py-2",
                          outbound
                            ? "bg-slate-900 text-white"
                            : "border border-slate-200 bg-slate-50 text-slate-800",
                        )}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                        <div
                          className={cn(
                            "mt-1 flex items-center justify-end gap-2 text-xs",
                            outbound ? "text-slate-300" : "text-slate-400",
                          )}
                        >
                          <span>{formatTime(message.createdAt)}</span>
                          {outbound ? <StatusBadge status={message.status} /> : null}
                        </div>
                        {outbound && message.status === "failed" ? (
                          <div className="mt-1 flex items-center justify-end gap-2">
                            <p className="text-xs text-red-300">{message.errorMessage}</p>
                            <button
                              type="button"
                              className="text-xs font-medium text-white underline"
                              disabled={retryMessage.isPending}
                              onClick={async () => {
                                try {
                                  await retryMessage.mutateAsync(message.id);
                                  toast.show({ title: "Retrying message", variant: "success" });
                                } catch (error) {
                                  toast.show({
                                    title: "Could not retry",
                                    description:
                                      error instanceof Error ? error.message : undefined,
                                    variant: "error",
                                  });
                                }
                              }}
                            >
                              Retry
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedContact.optedOut ? (
                <div className="border-t border-slate-200 bg-red-50 px-5 py-3 text-sm text-red-700">
                  {selectedContact.name} has opted out of messaging. Outbound messages are blocked;{" "}
                  <Link to={`/contacts/${selectedContact.id}`} className="font-medium underline">
                    manage opt-out here
                  </Link>
                  .
                </div>
              ) : null}

              <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-slate-200 px-5 py-3">
                <TextInput
                  className="flex-1"
                  placeholder={
                    twilioConnected ? "Write a message…" : "Connect Twilio to send messages"
                  }
                  value={draft}
                  disabled={!twilioConnected || selectedContact.optedOut}
                  onChange={(event) => setDraft(event.target.value)}
                  aria-label="Message body"
                />
                <Button
                  type="submit"
                  isLoading={sendMessage.isPending}
                  disabled={!twilioConnected || selectedContact.optedOut || !draft.trim()}
                >
                  Send
                </Button>
              </form>
            </>
          ) : (
            <EmptyState
              title="Select a conversation"
              description="Pick a contact on the left to read and reply."
            />
          )}
        </Card>
      </div>
    </div>
  );
}
