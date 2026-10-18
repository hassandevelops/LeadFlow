import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router";
import type { CreateContactInput } from "@leadflow/shared";
import { useCompanies, useContacts, useCreateContact } from "../api/crm";
import { useUsers } from "../api/users";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardHeader, PageHeader } from "../components/ui/card";
import { Field, Select, TextInput } from "../components/ui/field";
import { Modal } from "../components/ui/modal";
import { Pagination } from "../components/ui/pagination";
import { EmptyState, ErrorBlock, LoadingBlock } from "../components/ui/states";
import { TD, TH, TR, TableWrap } from "../components/ui/table";
import { useToast } from "../components/ui/toast";
import { NewLeadModal } from "../components/new-lead-modal";
import { formatDate } from "../lib/format";

export function ContactsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);

  const contactsQuery = useContacts({
    page,
    pageSize,
    q: query || undefined,
    ownerId: ownerId || undefined,
  });
  const usersQuery = useUsers({ page: 1, pageSize: 100 });
  const companiesQuery = useCompanies({ page: 1, pageSize: 100 });
  const createContact = useCreateContact();

  const usersById = new Map((usersQuery.data?.data ?? []).map((user) => [user.id, user]));
  const companiesById = new Map(
    (companiesQuery.data?.data ?? []).map((company) => [company.id, company]),
  );

  const [form, setForm] = useState<CreateContactInput & { tagsText: string }>({
    name: "",
    email: "",
    phone: "",
    companyId: undefined,
    ownerId: undefined,
    tags: [],
    tagsText: "",
  });
  const [formError, setFormError] = useState<string | null>(null);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setQuery(search.trim());
  }

  async function handleCreate() {
    if (!form.name.trim()) {
      setFormError("Name is required");
      return;
    }
    try {
      await createContact.mutateAsync({
        name: form.name.trim(),
        email: form.email?.trim() || undefined,
        phone: form.phone?.trim() || undefined,
        companyId: form.companyId || undefined,
        ownerId: form.ownerId || undefined,
        tags: form.tagsText
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      toast.show({ title: "Contact created", variant: "success" });
      setCreateOpen(false);
      setForm({ name: "", email: "", phone: "", tagsText: "" });
      setFormError(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not create contact");
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Contacts"
        description="Everyone you talk to, with ownership and lifecycle history."
        actions={
          <>
            <Button variant="secondary" onClick={() => setLeadOpen(true)}>
              New lead
            </Button>
            <Button onClick={() => setCreateOpen(true)}>New contact</Button>
          </>
        }
      />

      <Card>
        <CardHeader
          title="All contacts"
          description={contactsQuery.data ? `${contactsQuery.data.total} contacts` : undefined}
          actions={
            <form onSubmit={handleSearch} className="flex items-end gap-2">
              <TextInput
                className="w-56"
                placeholder="Search name, email, phone…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search contacts"
              />
              <Select
                className="w-40"
                value={ownerId}
                onChange={(event) => {
                  setOwnerId(event.target.value);
                  setPage(1);
                }}
                aria-label="Filter by owner"
              >
                <option value="">All owners</option>
                {(usersQuery.data?.data ?? []).map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="secondary" size="sm">
                Search
              </Button>
            </form>
          }
        />
        {contactsQuery.isPending ? <LoadingBlock /> : null}
        {contactsQuery.isError ? (
          <ErrorBlock error={contactsQuery.error} onRetry={() => void contactsQuery.refetch()} />
        ) : null}
        {contactsQuery.data && contactsQuery.data.data.length === 0 ? (
          <EmptyState
            title="No contacts found"
            description="Try a different search, or create a new contact."
          />
        ) : null}
        {contactsQuery.data && contactsQuery.data.data.length > 0 ? (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <TH>Name</TH>
                  <TH>Company</TH>
                  <TH>Owner</TH>
                  <TH>Tags</TH>
                  <TH>Status</TH>
                  <TH>Updated</TH>
                </tr>
              </thead>
              <tbody>
                {contactsQuery.data.data.map((contact) => (
                  <TR
                    key={contact.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/contacts/${contact.id}`)}
                  >
                    <TD>
                      <Link
                        to={`/contacts/${contact.id}`}
                        className="font-medium text-slate-900 underline-offset-2 hover:underline"
                      >
                        {contact.name}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {contact.email ?? contact.phone ?? "—"}
                      </p>
                    </TD>
                    <TD>
                      {contact.companyId
                        ? (companiesById.get(contact.companyId)?.name ?? "—")
                        : "—"}
                    </TD>
                    <TD>
                      {contact.ownerId ? (usersById.get(contact.ownerId)?.name ?? "—") : "—"}
                    </TD>
                    <TD>
                      <span className="flex flex-wrap gap-1">
                        {contact.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag}>{tag}</Badge>
                        ))}
                        {contact.tags.length > 3 ? <Badge>+{contact.tags.length - 3}</Badge> : null}
                      </span>
                    </TD>
                    <TD>
                      {contact.optedOut ? (
                        <Badge tone="red">Opted out</Badge>
                      ) : (
                        <Badge tone="green">Active</Badge>
                      )}
                    </TD>
                    <TD className="text-xs text-slate-500">{formatDate(contact.updatedAt)}</TD>
                  </TR>
                ))}
              </tbody>
            </TableWrap>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={contactsQuery.data.total}
              onPageChange={setPage}
            />
          </>
        ) : null}
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New contact"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} isLoading={createContact.isPending}>
              Create contact
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required>
            <TextInput
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              autoFocus
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email">
              <TextInput
                type="email"
                value={form.email ?? ""}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </Field>
            <Field label="Phone">
              <TextInput
                value={form.phone ?? ""}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company">
              <Select
                value={form.companyId ?? ""}
                onChange={(event) => setForm({ ...form, companyId: event.target.value || undefined })}
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
                value={form.ownerId ?? ""}
                onChange={(event) => setForm({ ...form, ownerId: event.target.value || undefined })}
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
          <Field label="Tags" hint="Comma separated, e.g. vip, newsletter">
            <TextInput
              value={form.tagsText}
              onChange={(event) => setForm({ ...form, tagsText: event.target.value })}
            />
          </Field>
          {formError ? (
            <p role="alert" className="text-sm text-red-600">
              {formError}
            </p>
          ) : null}
        </div>
      </Modal>

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
