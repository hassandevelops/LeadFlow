import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { CustomFieldValues } from "../components/ui/custom-fields-form";
import {
  useAddOpportunityNote,
  useContactFull,
  useDeleteOpportunity,
  useMoveOpportunityStage,
  useOpportunity,
  useUpdateOpportunity,
} from "../api/crm";
import { useCreatePaymentRequest } from "../api/payments";
import { useCustomFields, usePipelines } from "../api/pipeline";
import { useAcknowledgeLead } from "../api/leads";
import { useIntegrations } from "../api/integrations";
import { useUsers } from "../api/users";
import { isApiClientError } from "../lib/api-client";
import { Badge, StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "../components/ui/card";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { Countdown } from "../components/ui/countdown";
import { CustomFieldsForm } from "../components/ui/custom-fields-form";
import { Field, Select, TextArea, TextInput } from "../components/ui/field";
import { Modal } from "../components/ui/modal";
import { ReassignModal } from "../components/reassign-modal";
import { EmptyState, ErrorBlock, LoadingBlock } from "../components/ui/states";
import { useToast } from "../components/ui/toast";
import { formatDateTime, formatMoney, humanize, timeAgo } from "../lib/format";
import { useNow } from "../lib/server-time";

export function OpportunityDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const now = useNow();

  const opportunityQuery = useOpportunity(id);
  const pipelinesQuery = usePipelines();
  const fieldsQuery = useCustomFields("opportunity");
  const usersQuery = useUsers({ page: 1, pageSize: 100 });
  const integrationsQuery = useIntegrations();
  const contactId = opportunityQuery.data?.contactId;
  const contactQuery = useContactFull(contactId);

  const updateOpportunity = useUpdateOpportunity();
  const moveStage = useMoveOpportunityStage();
  const addNote = useAddOpportunityNote();
  const acknowledge = useAcknowledgeLead();
  const deleteOpportunity = useDeleteOpportunity();
  const createPaymentRequest = useCreatePaymentRequest(id);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", value: "", tagsText: "" });
  const [editCustomFields, setEditCustomFields] = useState<CustomFieldValues>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: "", description: "" });
  const [paymentError, setPaymentError] = useState<string | null>(null);

  if (opportunityQuery.isPending) return <LoadingBlock />;
  if (opportunityQuery.isError) {
    return <ErrorBlock error={opportunityQuery.error} onRetry={() => void opportunityQuery.refetch()} />;
  }

  const opportunity = opportunityQuery.data;
  const pipeline = pipelinesQuery.data?.find((candidate) => candidate.id === opportunity.pipelineId);
  const stage = pipeline?.stages.find((candidate) => candidate.id === opportunity.stageId);
  const customFields = fieldsQuery.data ?? [];
  const usersById = new Map((usersQuery.data?.data ?? []).map((user) => [user.id, user]));
  const owner = opportunity.ownerId ? usersById.get(opportunity.ownerId) : undefined;
  const needsAck = opportunity.ackDeadlineAt !== null && opportunity.acknowledgedAt === null;
  const stripeConnected = (integrationsQuery.data ?? []).some(
    (integration) => integration.provider === "stripe" && integration.status === "connected",
  );
  const dealActivity = (contactQuery.data?.activity ?? []).filter(
    (entry) => entry.entityType === "opportunity" && entry.entityId === opportunity.id,
  );
  const paymentRequests = (contactQuery.data?.paymentRequests ?? []).filter(
    (request) => request.opportunityId === opportunity.id,
  );

  function openEdit() {
    setEditForm({
      title: opportunity.title,
      value: opportunity.value === null ? "" : String(opportunity.value),
      tagsText: opportunity.tags.join(", "),
    });
    setEditCustomFields({ ...opportunity.customFields });
    setEditError(null);
    setEditOpen(true);
  }

  async function handleSaveEdit() {
    if (!editForm.title.trim()) {
      setEditError("Title is required");
      return;
    }
    try {
      await updateOpportunity.mutateAsync({
        id,
        input: {
          title: editForm.title.trim(),
          value: editForm.value === "" ? null : Number(editForm.value),
          tags: editForm.tagsText
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          customFields: editCustomFields,
        },
      });
      toast.show({ title: "Opportunity updated", variant: "success" });
      setEditOpen(false);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Could not update opportunity");
    }
  }

  async function handleStageChange(stageId: string) {
    try {
      await moveStage.mutateAsync({ id, stageId });
      toast.show({ title: "Stage updated", variant: "success" });
    } catch (error) {
      if (isApiClientError(error) && error.code === "validation_failed") {
        const details = error.details as { missingFields?: Array<{ label: string }> } | undefined;
        const labels = details?.missingFields?.map((field) => field.label).join(", ");
        toast.show({
          title: "Complete required fields first",
          description: labels ? `Missing: ${labels}` : error.message,
          variant: "error",
        });
      } else {
        toast.show({
          title: "Could not move opportunity",
          description: error instanceof Error ? error.message : undefined,
          variant: "error",
        });
      }
    }
  }

  async function handleOwnerChange(ownerId: string) {
    try {
      await updateOpportunity.mutateAsync({ id, input: { ownerId: ownerId || null } });
      toast.show({ title: "Owner updated", variant: "success" });
    } catch (error) {
      toast.show({
        title: "Could not update owner",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={opportunity.title}
        description={
          pipeline && stage ? `${pipeline.name} · ${stage.name}` : undefined
        }
        actions={
          <>
            {needsAck && opportunity.ackDeadlineAt ? (
              <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-1.5">
                <Countdown to={opportunity.ackDeadlineAt} now={now} />
              </div>
            ) : null}
            {needsAck ? (
              <Button
                onClick={async () => {
                  try {
                    await acknowledge.mutateAsync(id);
                    toast.show({ title: "Lead acknowledged", variant: "success" });
                  } catch (error) {
                    toast.show({
                      title: "Could not acknowledge",
                      description: error instanceof Error ? error.message : undefined,
                      variant: "error",
                    });
                  }
                }}
                isLoading={acknowledge.isPending}
              >
                Acknowledge
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setReassignOpen(true)}>
              Reassign
            </Button>
            <Button variant="secondary" onClick={openEdit}>
              Edit
            </Button>
            <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Deal"
              actions={
                <div className="flex items-center gap-2">
                  <Badge tone="blue">{humanize(opportunity.source)}</Badge>
                  {opportunity.escalationCount > 0 ? (
                    <Badge tone="red">Escalated ×{opportunity.escalationCount}</Badge>
                  ) : null}
                </div>
              }
            />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-500">Value</p>
                <p className="text-sm font-semibold text-slate-800">
                  {opportunity.valueHidden || opportunity.value === null
                    ? "•••"
                    : formatMoney(opportunity.value, opportunity.currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Stage</p>
                <Select
                  className="w-full"
                  value={opportunity.stageId}
                  disabled={moveStage.isPending}
                  onChange={(event) => void handleStageChange(event.target.value)}
                  aria-label="Opportunity stage"
                >
                  {(pipeline?.stages ?? []).map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <p className="text-xs text-slate-500">Owner</p>
                <Select
                  className="w-full"
                  value={opportunity.ownerId ?? ""}
                  disabled={updateOpportunity.isPending}
                  onChange={(event) => void handleOwnerChange(event.target.value)}
                  aria-label="Opportunity owner"
                >
                  <option value="">Unassigned</option>
                  {(usersQuery.data?.data ?? []).map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <p className="text-xs text-slate-500">Acknowledgement</p>
                {opportunity.acknowledgedAt ? (
                  <p className="text-sm text-emerald-700">
                    Acknowledged {timeAgo(opportunity.acknowledgedAt)}
                  </p>
                ) : needsAck ? (
                  <p className="text-sm text-red-600">Awaiting acknowledgement</p>
                ) : (
                  <p className="text-sm text-slate-500">—</p>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500">Last action</p>
                <p className="text-sm text-slate-700">
                  {opportunity.lastActionAt ? timeAgo(opportunity.lastActionAt) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Created</p>
                <p className="text-sm text-slate-700">{formatDateTime(opportunity.createdAt)}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-500">Tags</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {opportunity.tags.length === 0 ? (
                    <span className="text-sm text-slate-500">—</span>
                  ) : null}
                  {opportunity.tags.map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Custom fields"
              actions={
                <Button variant="secondary" size="sm" onClick={openEdit}>
                  Edit
                </Button>
              }
            />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              {customFields.length === 0 ? (
                <p className="text-sm text-slate-500">No custom fields defined.</p>
              ) : null}
              {customFields.map((definition) => {
                const raw = opportunity.customFields[definition.key];
                return (
                  <div key={definition.id}>
                    <p className="text-xs text-slate-500">{definition.label}</p>
                    <p className="text-sm text-slate-700">
                      {raw === undefined || raw === null || raw === ""
                        ? "—"
                        : typeof raw === "boolean"
                          ? raw
                            ? "Yes"
                            : "No"
                          : String(raw)}
                    </p>
                  </div>
                );
              })}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Notes & activity" />
            <CardBody className="space-y-4">
              <form
                className="space-y-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!note.trim()) return;
                  try {
                    await addNote.mutateAsync({ id, input: { body: note.trim() } });
                    setNote("");
                  } catch (error) {
                    toast.show({
                      title: "Could not add note",
                      description: error instanceof Error ? error.message : undefined,
                      variant: "error",
                    });
                  }
                }}
              >
                <TextArea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Add a note for your team…"
                />
                <div className="flex justify-end">
                  <Button type="submit" size="sm" isLoading={addNote.isPending} disabled={!note.trim()}>
                    Add note
                  </Button>
                </div>
              </form>
              <div className="space-y-3 border-t border-slate-100 pt-3">
                {dealActivity.length === 0 ? (
                  <EmptyState title="No activity yet" description="Notes and stage changes appear here." />
                ) : null}
                {dealActivity.map((entry) => (
                  <div key={entry.id} className="flex gap-3">
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-slate-300" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800">{entry.summary}</p>
                      <p className="text-xs text-slate-500">
                        {entry.actorName} · {humanize(entry.type)} · {timeAgo(entry.at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Contact" />
            <CardBody className="space-y-2 text-sm">
              {contactQuery.data ? (
                <>
                  <Link
                    to={`/contacts/${contactQuery.data.contact.id}`}
                    className="font-medium text-slate-900 underline-offset-2 hover:underline"
                  >
                    {contactQuery.data.contact.name}
                  </Link>
                  <p className="text-slate-600">{contactQuery.data.contact.email ?? "—"}</p>
                  <p className="text-slate-600">{contactQuery.data.contact.phone ?? "—"}</p>
                  {contactQuery.data.contact.optedOut ? (
                    <Badge tone="red">Opted out of messaging</Badge>
                  ) : null}
                </>
              ) : (
                <p className="text-slate-500">Loading contact…</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Company" />
            <CardBody className="text-sm">
              {contactQuery.data?.company ? (
                <Link
                  to={`/companies/${contactQuery.data.company.id}`}
                  className="font-medium text-slate-900 underline-offset-2 hover:underline"
                >
                  {contactQuery.data.company.name}
                </Link>
              ) : (
                <p className="text-slate-500">No company linked.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Payments"
              actions={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (!stripeConnected) {
                      toast.show({
                        title: "Stripe not connected",
                        description: "Connect Stripe under Integrations to request payments.",
                        variant: "error",
                      });
                      return;
                    }
                    setPaymentForm({
                      amount: opportunity.value === null ? "" : String(opportunity.value),
                      description: opportunity.title,
                    });
                    setPaymentError(null);
                    setPaymentOpen(true);
                  }}
                >
                  Request payment
                </Button>
              }
            />
            <CardBody className="space-y-3 text-sm">
              {paymentRequests.length === 0 ? (
                <p className="text-slate-500">No payment requests yet.</p>
              ) : null}
              {paymentRequests.map((request) => (
                <div key={request.id} className="space-y-1 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">
                      {formatMoney(request.amount, request.currency)}
                    </span>
                    <StatusBadge status={request.status} />
                  </div>
                  {request.checkoutUrl ? (
                    <a
                      href={request.checkoutUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-xs text-blue-600 hover:underline"
                    >
                      {request.checkoutUrl}
                    </a>
                  ) : null}
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit opportunity"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveEdit()} isLoading={updateOpportunity.isPending}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title" required>
            <TextInput
              value={editForm.title}
              onChange={(event) => setEditForm({ ...editForm, title: event.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Value">
              <TextInput
                type="number"
                min={0}
                value={editForm.value}
                onChange={(event) => setEditForm({ ...editForm, value: event.target.value })}
              />
            </Field>
            <Field label="Tags" hint="Comma separated">
              <TextInput
                value={editForm.tagsText}
                onChange={(event) => setEditForm({ ...editForm, tagsText: event.target.value })}
              />
            </Field>
          </div>
          {customFields.length > 0 ? (
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Custom fields</p>
              <CustomFieldsForm
                definitions={customFields}
                value={editCustomFields}
                onChange={setEditCustomFields}
              />
            </div>
          ) : null}
          {editError ? (
            <p role="alert" className="text-sm text-red-600">
              {editError}
            </p>
          ) : null}
        </div>
      </Modal>

      <ReassignModal
        open={reassignOpen}
        onClose={() => setReassignOpen(false)}
        leadId={id}
        currentOwnerName={owner?.name ?? null}
      />

      <Modal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        title="Request payment"
        description="Creates a Stripe checkout link and messages the contact."
        footer={
          <>
            <Button variant="secondary" onClick={() => setPaymentOpen(false)}>
              Cancel
            </Button>
            <Button
              isLoading={createPaymentRequest.isPending}
              onClick={async () => {
                const amount = Number(paymentForm.amount);
                if (!amount || amount <= 0) {
                  setPaymentError("Enter an amount greater than zero");
                  return;
                }
                try {
                  await createPaymentRequest.mutateAsync({
                    amount,
                    currency: "usd",
                    description: paymentForm.description.trim() || undefined,
                  });
                  toast.show({
                    title: "Payment request sent",
                    description: "The checkout link was shared with the contact.",
                    variant: "success",
                  });
                  setPaymentOpen(false);
                  void contactQuery.refetch();
                } catch (error) {
                  setPaymentError(
                    error instanceof Error ? error.message : "Could not create payment request",
                  );
                }
              }}
            >
              Send request
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Amount" required>
            <TextInput
              type="number"
              min={1}
              value={paymentForm.amount}
              onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })}
            />
          </Field>
          <Field label="Description">
            <TextInput
              value={paymentForm.description}
              onChange={(event) =>
                setPaymentForm({ ...paymentForm, description: event.target.value })
              }
            />
          </Field>
          {paymentError ? (
            <p role="alert" className="text-sm text-red-600">
              {paymentError}
            </p>
          ) : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete opportunity"
        description={`Delete "${opportunity.title}"? This cannot be undone.`}
        confirmLabel="Delete opportunity"
        destructive
        onConfirm={async () => {
          try {
            await deleteOpportunity.mutateAsync(id);
            toast.show({ title: "Opportunity deleted", variant: "success" });
            navigate("/pipeline");
          } catch (error) {
            toast.show({
              title: "Could not delete opportunity",
              description: error instanceof Error ? error.message : undefined,
              variant: "error",
            });
          }
        }}
      />
    </div>
  );
}
