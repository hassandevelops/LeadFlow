import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import type { Company } from "@leadflow/shared";
import { useCompanies, useCreateCompany, useDeleteCompany, useUpdateCompany } from "../api/crm";
import { Button } from "../components/ui/button";
import { Card, CardHeader, PageHeader } from "../components/ui/card";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { Field, TextInput } from "../components/ui/field";
import { Modal } from "../components/ui/modal";
import { Pagination } from "../components/ui/pagination";
import { EmptyState, ErrorBlock, LoadingBlock } from "../components/ui/states";
import { TD, TH, TR, TableWrap } from "../components/ui/table";
import { useToast } from "../components/ui/toast";

type CompanyDraft = {
  editing: Company | null;
  name: string;
  domain: string;
  phone: string;
  address: string;
};

const EMPTY_DRAFT: CompanyDraft = { editing: null, name: "", domain: "", phone: "", address: "" };

export function CompaniesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const companiesQuery = useCompanies({ page, pageSize, q: query || undefined });
  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany();
  const deleteCompany = useDeleteCompany();

  const [draft, setDraft] = useState<CompanyDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setQuery(search.trim());
  }

  async function handleSave() {
    if (!draft) return;
    if (!draft.name.trim()) {
      setDraftError("Company name is required");
      return;
    }
    const input = {
      name: draft.name.trim(),
      domain: draft.domain.trim() || undefined,
      phone: draft.phone.trim() || undefined,
      address: draft.address.trim() || undefined,
    };
    try {
      if (draft.editing) {
        await updateCompany.mutateAsync({ id: draft.editing.id, input });
      } else {
        await createCompany.mutateAsync(input);
      }
      toast.show({ title: draft.editing ? "Company updated" : "Company created", variant: "success" });
      setDraft(null);
      setDraftError(null);
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : "Could not save company");
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Companies"
        description="Accounts your contacts and deals belong to."
        actions={<Button onClick={() => setDraft({ ...EMPTY_DRAFT })}>New company</Button>}
      />

      <Card>
        <CardHeader
          title="All companies"
          description={companiesQuery.data ? `${companiesQuery.data.total} companies` : undefined}
          actions={
            <form onSubmit={handleSearch} className="flex items-end gap-2">
              <TextInput
                className="w-56"
                placeholder="Search companies…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search companies"
              />
              <Button type="submit" variant="secondary" size="sm">
                Search
              </Button>
            </form>
          }
        />
        {companiesQuery.isPending ? <LoadingBlock /> : null}
        {companiesQuery.isError ? (
          <ErrorBlock error={companiesQuery.error} onRetry={() => void companiesQuery.refetch()} />
        ) : null}
        {companiesQuery.data && companiesQuery.data.data.length === 0 ? (
          <EmptyState title="No companies found" description="Create your first company." />
        ) : null}
        {companiesQuery.data && companiesQuery.data.data.length > 0 ? (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <TH>Name</TH>
                  <TH>Domain</TH>
                  <TH>Phone</TH>
                  <TH>Address</TH>
                  <TH className="text-right">Actions</TH>
                </tr>
              </thead>
              <tbody>
                {companiesQuery.data.data.map((company) => (
                  <TR key={company.id}>
                    <TD>
                      <button
                        type="button"
                        className="font-medium text-slate-900 underline-offset-2 hover:underline"
                        onClick={() => navigate(`/companies/${company.id}`)}
                      >
                        {company.name}
                      </button>
                    </TD>
                    <TD>{company.domain ?? "—"}</TD>
                    <TD>{company.phone ?? "—"}</TD>
                    <TD className="max-w-64 truncate">{company.address ?? "—"}</TD>
                    <TD className="text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setDraft({
                            editing: company,
                            name: company.name,
                            domain: company.domain ?? "",
                            phone: company.phone ?? "",
                            address: company.address ?? "",
                          })
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-1"
                        onClick={() => setDeleteTarget(company)}
                      >
                        Delete
                      </Button>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </TableWrap>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={companiesQuery.data.total}
              onPageChange={setPage}
            />
          </>
        ) : null}
      </Card>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.editing ? `Edit ${draft.editing.name}` : "New company"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleSave()}
              isLoading={createCompany.isPending || updateCompany.isPending}
            >
              Save company
            </Button>
          </>
        }
      >
        {draft ? (
          <div className="space-y-4">
            <Field label="Name" required>
              <TextInput
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                autoFocus
              />
            </Field>
            <Field label="Domain">
              <TextInput
                value={draft.domain}
                onChange={(event) => setDraft({ ...draft, domain: event.target.value })}
                placeholder="acme.com"
              />
            </Field>
            <Field label="Phone">
              <TextInput
                value={draft.phone}
                onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
              />
            </Field>
            <Field label="Address">
              <TextInput
                value={draft.address}
                onChange={(event) => setDraft({ ...draft, address: event.target.value })}
              />
            </Field>
            {draftError ? (
              <p role="alert" className="text-sm text-red-600">
                {draftError}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete company"
        description={
          deleteTarget
            ? `Delete ${deleteTarget.name}? Companies with contacts or opportunities cannot be deleted.`
            : ""
        }
        confirmLabel="Delete company"
        destructive
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await deleteCompany.mutateAsync(deleteTarget.id);
            toast.show({ title: "Company deleted", variant: "success" });
          } catch (error) {
            toast.show({
              title: "Could not delete company",
              description: error instanceof Error ? error.message : undefined,
              variant: "error",
            });
          }
        }}
      />
    </div>
  );
}
