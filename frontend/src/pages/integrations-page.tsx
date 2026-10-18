import { useState } from "react";
import type {
  ConnectResendInput,
  ConnectStripeInput,
  ConnectTwilioInput,
  IntegrationState,
} from "@leadflow/shared";
import {
  useConnectGoogleCalendar,
  useConnectIntegration,
  useDisconnectGoogleCalendar,
  useDisconnectIntegration,
  useIntegrationEvents,
  useIntegrations,
} from "../api/integrations";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, PageHeader } from "../components/ui/card";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { Field, TextInput } from "../components/ui/field";
import { Modal } from "../components/ui/modal";
import { Pagination } from "../components/ui/pagination";
import { EmptyState, ErrorBlock, LoadingBlock } from "../components/ui/states";
import { TD, TH, TR, TableWrap } from "../components/ui/table";
import { useToast } from "../components/ui/toast";
import { formatDateTime, humanize } from "../lib/format";

type Provider = IntegrationState["provider"];
type FormProvider = "twilio_whatsapp" | "stripe" | "resend";

const PROVIDER_INFO: Record<
  Provider,
  { name: string; description: string; form: FormProvider | null }
> = {
  twilio_whatsapp: {
    name: "Twilio WhatsApp",
    description: "Send and receive WhatsApp messages with contacts.",
    form: "twilio_whatsapp",
  },
  stripe: {
    name: "Stripe",
    description: "Collect payments through checkout links and track their status.",
    form: "stripe",
  },
  resend: {
    name: "Resend",
    description: "Send transactional email such as confirmation messages.",
    form: "resend",
  },
  google_calendar: {
    name: "Google Calendar",
    description: "Sync booked appointments to each teammate's calendar.",
    form: null,
  },
};

const EMPTY_FORMS = {
  twilio_whatsapp: { accountSid: "", authToken: "", whatsappFrom: "" },
  stripe: { secretKey: "", webhookSecret: "" },
  resend: { apiKey: "", fromEmail: "" },
} satisfies Record<FormProvider, Record<string, string>>;

export function IntegrationsPage() {
  const toast = useToast();
  const integrationsQuery = useIntegrations();
  const connectIntegration = useConnectIntegration();
  const disconnectIntegration = useDisconnectIntegration();
  const connectGoogle = useConnectGoogleCalendar();
  const disconnectGoogle = useDisconnectGoogleCalendar();

  const [formProvider, setFormProvider] = useState<FormProvider | null>(null);
  const [form, setForm] = useState(EMPTY_FORMS);
  const [formError, setFormError] = useState<string | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<Provider | null>(null);
  const [eventsProvider, setEventsProvider] = useState<Provider | null>(null);

  function openForm(provider: FormProvider) {
    setForm(EMPTY_FORMS);
    setFormError(null);
    setFormProvider(provider);
  }

  async function handleConnect() {
    if (!formProvider) return;
    setFormError(null);
    try {
      if (formProvider === "twilio_whatsapp") {
        const input: ConnectTwilioInput = form.twilio_whatsapp;
        await connectIntegration.mutateAsync({ provider: "twilio_whatsapp", ...input });
      } else if (formProvider === "stripe") {
        const input: ConnectStripeInput = form.stripe;
        await connectIntegration.mutateAsync({ provider: "stripe", ...input });
      } else {
        const input: ConnectResendInput = form.resend;
        await connectIntegration.mutateAsync({ provider: "resend", ...input });
      }
      toast.show({ title: `${PROVIDER_INFO[formProvider].name} connected`, variant: "success" });
      setFormProvider(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not connect provider");
    }
  }

  async function handleGoogleConnect() {
    try {
      await connectGoogle.mutateAsync();
      toast.show({ title: "Google Calendar connected", variant: "success" });
    } catch (error) {
      toast.show({
        title: "Could not connect Google Calendar",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    }
  }

  async function handleDisconnect() {
    if (!disconnectTarget) return;
    try {
      if (disconnectTarget === "google_calendar") {
        await disconnectGoogle.mutateAsync();
      } else {
        await disconnectIntegration.mutateAsync(disconnectTarget);
      }
      toast.show({ title: "Integration disconnected", variant: "success" });
    } catch (error) {
      toast.show({
        title: "Could not disconnect",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Integrations"
        description="Connect the services LeadFlow uses for messaging, payments and scheduling."
      />

      {integrationsQuery.isPending ? <LoadingBlock /> : null}
      {integrationsQuery.isError ? (
        <ErrorBlock error={integrationsQuery.error} onRetry={() => void integrationsQuery.refetch()} />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {(integrationsQuery.data ?? []).map((integration) => {
          const info = PROVIDER_INFO[integration.provider];
          const connected = integration.status === "connected";
          return (
            <Card
              key={integration.provider}
              className="flex flex-col p-5"
              data-testid={`integration-${integration.provider}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{info.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">{info.description}</p>
                </div>
                <Badge tone={connected ? "green" : integration.status === "error" ? "red" : "slate"}>
                  {humanize(integration.status)}
                </Badge>
              </div>

              <dl className="mt-4 space-y-1 text-sm">
                {integration.accountLabel ? (
                  <div className="flex gap-2">
                    <dt className="text-slate-500">Account:</dt>
                    <dd className="font-medium text-slate-800">{integration.accountLabel}</dd>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <dt className="text-slate-500">Last success:</dt>
                  <dd className="text-slate-800">
                    {integration.lastSuccessAt ? formatDateTime(integration.lastSuccessAt) : "—"}
                  </dd>
                </div>
              </dl>

              {integration.recentErrors.length > 0 ? (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2">
                  <p className="text-xs font-medium text-red-800">Recent errors</p>
                  <ul className="mt-1 space-y-1">
                    {integration.recentErrors.map((error, index) => (
                      <li key={index} className="text-xs text-red-700">
                        {formatDateTime(error.at)} — {error.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <p className="mt-3 text-xs text-slate-400">{integration.limitsNote}</p>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                {connected ? (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setDisconnectTarget(integration.provider)}
                    >
                      Disconnect
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEventsProvider(integration.provider)}
                    >
                      View events
                    </Button>
                  </>
                ) : integration.provider === "google_calendar" ? (
                  <Button size="sm" isLoading={connectGoogle.isPending} onClick={() => void handleGoogleConnect()}>
                    Connect with Google
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => openForm(info.form as FormProvider)}>
                    Connect
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Modal
        open={formProvider !== null}
        onClose={() => setFormProvider(null)}
        title={formProvider ? `Connect ${PROVIDER_INFO[formProvider].name}` : "Connect"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormProvider(null)}>
              Cancel
            </Button>
            <Button onClick={() => void handleConnect()} isLoading={connectIntegration.isPending}>
              Connect
            </Button>
          </>
        }
      >
        {formProvider === "twilio_whatsapp" ? (
          <div className="space-y-4">
            <Field label="Account SID" required>
              <TextInput
                value={form.twilio_whatsapp.accountSid}
                onChange={(event) =>
                  setForm({
                    ...form,
                    twilio_whatsapp: { ...form.twilio_whatsapp, accountSid: event.target.value },
                  })
                }
                placeholder="ACxxxxxxxxxxxxxxxx"
              />
            </Field>
            <Field label="Auth token" required>
              <TextInput
                type="password"
                value={form.twilio_whatsapp.authToken}
                onChange={(event) =>
                  setForm({
                    ...form,
                    twilio_whatsapp: { ...form.twilio_whatsapp, authToken: event.target.value },
                  })
                }
              />
            </Field>
            <Field label="WhatsApp sender" required hint="E.164 number or WhatsApp sender ID.">
              <TextInput
                value={form.twilio_whatsapp.whatsappFrom}
                onChange={(event) =>
                  setForm({
                    ...form,
                    twilio_whatsapp: { ...form.twilio_whatsapp, whatsappFrom: event.target.value },
                  })
                }
                placeholder="+14155550123"
              />
            </Field>
          </div>
        ) : null}
        {formProvider === "stripe" ? (
          <div className="space-y-4">
            <Field label="Secret key" required>
              <TextInput
                type="password"
                value={form.stripe.secretKey}
                onChange={(event) =>
                  setForm({ ...form, stripe: { ...form.stripe, secretKey: event.target.value } })
                }
                placeholder="sk_live_…"
              />
            </Field>
            <Field label="Webhook secret" required>
              <TextInput
                type="password"
                value={form.stripe.webhookSecret}
                onChange={(event) =>
                  setForm({
                    ...form,
                    stripe: { ...form.stripe, webhookSecret: event.target.value },
                  })
                }
                placeholder="whsec_…"
              />
            </Field>
          </div>
        ) : null}
        {formProvider === "resend" ? (
          <div className="space-y-4">
            <Field label="API key" required>
              <TextInput
                type="password"
                value={form.resend.apiKey}
                onChange={(event) =>
                  setForm({ ...form, resend: { ...form.resend, apiKey: event.target.value } })
                }
                placeholder="re_…"
              />
            </Field>
            <Field label="From email" required>
              <TextInput
                type="email"
                value={form.resend.fromEmail}
                onChange={(event) =>
                  setForm({ ...form, resend: { ...form.resend, fromEmail: event.target.value } })
                }
                placeholder="hello@yourcompany.com"
              />
            </Field>
          </div>
        ) : null}
        {formError ? (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {formError}
          </p>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={disconnectTarget !== null}
        onClose={() => setDisconnectTarget(null)}
        title="Disconnect integration"
        description={
          disconnectTarget
            ? `Disconnect ${PROVIDER_INFO[disconnectTarget].name}? Features that depend on it will stop working until you reconnect.`
            : ""
        }
        confirmLabel="Disconnect"
        destructive
        onConfirm={handleDisconnect}
      />

      <EventsModal provider={eventsProvider} onClose={() => setEventsProvider(null)} />
    </div>
  );
}

function EventsModal({
  provider,
  onClose,
}: {
  provider: Provider | null;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const eventsQuery = useIntegrationEvents(provider ?? "", page);
  const events = provider ? (eventsQuery.data?.data ?? []) : [];

  return (
    <Modal
      open={provider !== null}
      onClose={() => {
        setPage(1);
        onClose();
      }}
      title={provider ? `${PROVIDER_INFO[provider].name} events` : "Integration events"}
      size="xl"
    >
      {eventsQuery.isPending && provider ? <LoadingBlock /> : null}
      {eventsQuery.isError ? (
        <ErrorBlock error={eventsQuery.error} onRetry={() => void eventsQuery.refetch()} />
      ) : null}
      {eventsQuery.data && events.length === 0 ? (
        <EmptyState title="No events recorded" description="Webhook and API activity appears here." />
      ) : null}
      {events.length > 0 ? (
        <>
          <TableWrap>
            <thead>
              <tr>
                <TH>When</TH>
                <TH>Direction</TH>
                <TH>Event</TH>
                <TH>Reference</TH>
                <TH>Result</TH>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <TR key={event.id}>
                  <TD className="text-xs text-slate-500">{formatDateTime(event.createdAt)}</TD>
                  <TD className="text-xs">{humanize(event.direction)}</TD>
                  <TD className="text-xs font-medium text-slate-800">{event.eventType}</TD>
                  <TD className="text-xs text-slate-500">{event.reference ?? "—"}</TD>
                  <TD>
                    <Badge
                      tone={
                        event.result === "success"
                          ? "green"
                          : event.result === "rejected"
                            ? "amber"
                            : "red"
                      }
                    >
                      {humanize(event.result)}
                    </Badge>
                    {event.errorMessage ? (
                      <p className="mt-1 text-xs text-red-600">{event.errorMessage}</p>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </tbody>
          </TableWrap>
          {eventsQuery.data ? (
            <Pagination
              page={page}
              pageSize={15}
              total={eventsQuery.data.total}
              onPageChange={setPage}
            />
          ) : null}
        </>
      ) : null}
    </Modal>
  );
}
