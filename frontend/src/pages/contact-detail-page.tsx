import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { CustomFieldValues } from "../components/ui/custom-fields-form";
import { useContactFull, useContactTimeline, useDeleteContact, useSetContactOptOut, useUpdateContact, useCompanies } from "../api/crm";
import { useCustomFields } from "../api/pipeline";
import { useUsers } from "../api/users";
import { Badge, StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "../components/ui/card";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { CustomFieldsForm } from "../components/ui/custom-fields-form";
import { Field, Select, TextInput } from "../components/ui/field";
import { Modal } from "../components/ui/modal";
import { Pagination } from "../components/ui/pagination";
import { EmptyState, ErrorBlock, LoadingBlock } from "../components/ui/states";
import { useToast } from "../components/ui/toast";
import { NewLeadModal } from "../components/new-lead-modal";
import { formatDate, formatDateTime, formatMoney, humanize, timeAgo } from "../lib/format";
import type { UpdateContactInput } from "@leadflow/shared";

export function ContactDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const contactQuery = useContactFull(id);
  const fieldsQuery = useCustomFields("contact");
  const companiesQuery = useCompanies({ page: 1, pageSize: 100 });
  const usersQuery = useUsers({ page: 1, pageSize: 100 });
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();
  const optOut = useSetContactOptOut();

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    companyId: "",
    ownerId: "",
    tagsText: "",
  });
  const [editCustomFields, setEditCustomFields] = useState<CustomFieldValues>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [optOutOpen, setOptOutOpen] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [timelinePage, setTimelinePage] = useState(1);
  const timelineQuery = useContactTimeline(id, timelinePage);

  if (contactQuery.isPending) return <LoadingBlock />;
  if (contactQuery.isError) {
    return <ErrorBlock error={contactQuery.error} onRetry={() => void contactQuery.refetch()} />;
  }

  const view = contactQuery.data;
  const { contact } = view;
  const customFields = fieldsQuery.data ?? [];

  function openEdit() {
    setEditForm({
      name: contact.name,
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      companyId: contact.companyId ?? "",
      ownerId: contact.ownerId ?? "",
      tagsText: contact.tags.join(", "),
    });
    setEditCustomFields({ ...contact.customFields });
    setEditError(null);
    setEditOpen(true);
  }

  async function handleSaveEdit() {
    if (!editForm.name.trim()) {
      setEditError("Name is required");
      return;
    }
    const input: UpdateContactInput = {
      name: editForm.name.trim(),
      email: editForm.email.trim() || undefined,
      phone: editForm.phone.trim() || undefined,
      companyId: editForm.companyId || undefined,
      ownerId: editForm.ownerId || undefined,
      tags: editForm.tagsText
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      customFields: editCustomFields,
    };
    try {
      await updateContact.mutateAsync({ id, input });
      toast.show({ title: "Contact updated", variant: "success" });
      setEditOpen(false);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Could not update contact");
    }
  }

  async function handleToggleOwnerQuick(nextOwnerId: string) {
    if (!nextOwnerId) {
      toast.show({ title: "Pick a teammate to assign the contact" });
      return;
    }
    try {
      await updateContact.mutateAsync({ id, input: { ownerId: nextOwnerId } });
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
        title={contact.name}
        description={view.company ? view.company.name : "No company"}
        actions={
          <>
            <Button variant="secondary" onClick={() => setLeadOpen(true)}>
              New lead
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
              title="Details"
              actions={
                contact.optedOut ? <Badge tone="red">Opted out</Badge> : <Badge tone="green">Active</Badge>
              }
            />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-500">Email</p>
                <p className="text-sm font-medium text-slate-800">{contact.email ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Phone</p>
                <p className="text-sm font-medium text-slate-800">{contact.phone ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Company</p>
                {view.company ? (
                  <Link
                    to={`/companies/${view.company.id}`}
                    className="text-sm font-medium text-slate-800 underline"
                  >
                    {view.company.name}
                  </Link>
                ) : (
                  <p className="text-sm text-slate-500">—</p>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500">Owner</p>
                <Select
                  className="w-full"
                  value={contact.ownerId ?? ""}
                  onChange={(event) => void handleToggleOwnerQuick(event.target.value)}
                  aria-label="Contact owner"
                >
                  <option value="">Unassigned</option>
                  {(usersQuery.data?.data ?? []).map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-500">Tags</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {contact.tags.length === 0 ? <span className="text-sm text-slate-500">—</span> : null}
                  {contact.tags.map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500">Created</p>
                <p className="text-sm text-slate-700">{formatDate(contact.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Last updated</p>
                <p className="text-sm text-slate-700">{formatDate(contact.updatedAt)}</p>
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
                const raw = contact.customFields[definition.key];
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
            <CardHeader title="Activity timeline" />
            {timelineQuery.isPending ? <LoadingBlock /> : null}
            {timelineQuery.data ? (
              <>
                <CardBody className="space-y-3">
                  {timelineQuery.data.data.length === 0 ? (
                    <EmptyState title="No activity yet" />
                  ) : null}
                  {timelineQuery.data.data.map((entry) => (
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
                </CardBody>
                <Pagination
                  page={timelinePage}
                  pageSize={25}
                  total={timelineQuery.data.total}
                  onPageChange={setTimelinePage}
                />
              </>
            ) : null}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Marketing"
              description="Opt-out stops all outbound messaging."
            />
            <CardBody>
              <Button
                variant={contact.optedOut ? "secondary" : "danger"}
                size="sm"
                onClick={() => setOptOutOpen(true)}
              >
                {contact.optedOut ? "Allow messaging again" : "Mark as opted out"}
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Opportunities" />
            <CardBody className="space-y-3">
              {view.opportunities.length === 0 ? (
                <p className="text-sm text-slate-500">No opportunities yet.</p>
              ) : null}
              {view.opportunities.map((opportunity) => (
                <div key={opportunity.id} className="flex items-center justify-between gap-2">
                  <Link
                    to={`/opportunities/${opportunity.id}`}
                    className="truncate text-sm font-medium text-slate-800 underline"
                  >
                    {opportunity.title}
                  </Link>
                  <span className="text-sm text-slate-600">
                    {opportunity.valueHidden || opportunity.value === null
                      ? "•••"
                      : formatMoney(opportunity.value, opportunity.currency)}
                  </span>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Conversations" />
            <CardBody className="space-y-2">
              {view.conversations.length === 0 ? (
                <p className="text-sm text-slate-500">No conversations yet.</p>
              ) : null}
              {view.conversations.map((conversation) => (
                <Link
                  key={conversation.id}
                  to={`/conversations?c=${conversation.id}`}
                  className="flex items-center justify-between gap-2 text-sm text-slate-700 hover:underline"
                >
                  <span>{humanize(conversation.channel)}</span>
                  <span className="text-xs text-slate-500">
                    {conversation.lastMessageAt ? timeAgo(conversation.lastMessageAt) : "No messages"}
                  </span>
                </Link>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Appointments" />
            <CardBody className="space-y-2">
              {view.appointments.length === 0 ? (
                <p className="text-sm text-slate-500">No appointments yet.</p>
              ) : null}
              {view.appointments.map((appointment) => (
                <div key={appointment.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-700">{formatDateTime(appointment.startsAt)}</span>
                  <StatusBadge status={appointment.status} />
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Payments" />
            <CardBody className="space-y-3">
              {view.paymentRequests.length === 0 ? (
                <p className="text-sm text-slate-500">No payment requests yet.</p>
              ) : null}
              {view.paymentRequests.map((request) => (
                <div key={request.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-700">
                    {formatMoney(request.amount, request.currency)}
                  </span>
                  <StatusBadge status={request.status} />
                </div>
              ))}
              {view.payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-500">
                    Paid {formatMoney(payment.amount, payment.currency)}
                  </span>
                  <StatusBadge status={payment.status} />
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit contact"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveEdit()} isLoading={updateContact.isPending}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required>
            <TextInput
              value={editForm.name}
              onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email">
              <TextInput
                type="email"
                value={editForm.email}
                onChange={(event) => setEditForm({ ...editForm, email: event.target.value })}
              />
            </Field>
            <Field label="Phone">
              <TextInput
                value={editForm.phone}
                onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })}
              />
            </Field>
            <Field label="Company">
              <Select
                value={editForm.companyId}
                onChange={(event) => setEditForm({ ...editForm, companyId: event.target.value })}
              >
                <option value="">No company</option>
                {(companiesQuery.data?.data ?? []).map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Owner">
              <Select
                value={editForm.ownerId}
                onChange={(event) => setEditForm({ ...editForm, ownerId: event.target.value })}
              >
                <option value="">Unassigned</option>
                {(usersQuery.data?.data ?? []).map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Tags" hint="Comma separated">
            <TextInput
              value={editForm.tagsText}
              onChange={(event) => setEditForm({ ...editForm, tagsText: event.target.value })}
            />
          </Field>
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

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete contact"
        description={`Delete ${contact.name}? Their conversations and data are removed. This cannot be undone.`}
        confirmLabel="Delete contact"
        destructive
        onConfirm={async () => {
          try {
            await deleteContact.mutateAsync(id);
            toast.show({ title: "Contact deleted", variant: "success" });
            navigate("/contacts");
          } catch (error) {
            toast.show({
              title: "Could not delete contact",
              description: error instanceof Error ? error.message : undefined,
              variant: "error",
            });
          }
        }}
      />

      <ConfirmDialog
        open={optOutOpen}
        onClose={() => setOptOutOpen(false)}
        title={contact.optedOut ? "Allow messaging" : "Mark as opted out"}
        description={
          contact.optedOut
            ? `${contact.name} will receive outbound messages again.`
            : `${contact.name} will stop receiving all outbound messages. Inbound messages are still recorded.`
        }
        confirmLabel={contact.optedOut ? "Allow messaging" : "Opt out"}
        destructive={!contact.optedOut}
        onConfirm={async () => {
          try {
            await optOut.mutateAsync({ id, optedOut: !contact.optedOut });
            toast.show({
              title: contact.optedOut ? "Messaging allowed" : "Contact opted out",
              variant: "success",
            });
          } catch (error) {
            toast.show({
              title: "Could not update opt-out",
              description: error instanceof Error ? error.message : undefined,
              variant: "error",
            });
          }
        }}
      />

      <NewLeadModal
        open={leadOpen}
        onClose={() => setLeadOpen(false)}
        onCreated={(opportunity) => {
          toast.show({ title: "Lead created", variant: "success" });
          navigate(`/opportunities/${opportunity.id}`);
        }}
      />
    </div>
  );
}
