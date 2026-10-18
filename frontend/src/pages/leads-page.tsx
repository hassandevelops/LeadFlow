import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { LEAD_SOURCES, type LeadSource } from "@leadflow/shared";
import { useContacts, useOpportunities } from "../api/crm";
import { useAcknowledgeLead } from "../api/leads";
import { useUsers } from "../api/users";
import { Avatar } from "../components/ui/avatar";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardHeader, PageHeader } from "../components/ui/card";
import { Countdown } from "../components/ui/countdown";
import { Select, TextInput } from "../components/ui/field";
import { Pagination } from "../components/ui/pagination";
import { EmptyState, ErrorBlock, LoadingBlock } from "../components/ui/states";
import { TD, TH, TR, TableWrap } from "../components/ui/table";
import { useToast } from "../components/ui/toast";
import { NewLeadModal } from "../components/new-lead-modal";
import { ReassignModal } from "../components/reassign-modal";
import { humanize, timeAgo } from "../lib/format";
import { useNow } from "../lib/server-time";

type Tab = "awaiting" | "all";

export function LeadsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const now = useNow();
  const [tab, setTab] = useState<Tab>("awaiting");
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [reassignLead, setReassignLead] = useState<{ id: string; ownerName: string | null } | null>(
    null,
  );
  const [leadOpen, setLeadOpen] = useState(false);

  const opportunitiesQuery = useOpportunities({
    page,
    pageSize,
    q: query || undefined,
    source: source || undefined,
    ownerId: ownerId || undefined,
  });
  const contactsQuery = useContacts({ page: 1, pageSize: 100 });
  const usersQuery = useUsers({ page: 1, pageSize: 100 });
  const acknowledge = useAcknowledgeLead();

  const contactsById = new Map((contactsQuery.data?.data ?? []).map((c) => [c.id, c]));
  const usersById = new Map((usersQuery.data?.data ?? []).map((u) => [u.id, u]));

  const rows = (opportunitiesQuery.data?.data ?? []).filter((opportunity) =>
    tab === "awaiting"
      ? opportunity.ackDeadlineAt !== null && opportunity.acknowledgedAt === null
      : true,
  );

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setQuery(search.trim());
  }

  async function handleAcknowledge(id: string) {
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
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Leads"
        description="Assigned leads and the acknowledgement clock."
        actions={<Button onClick={() => setLeadOpen(true)}>New lead</Button>}
      />

      <Card>
        <CardHeader
          title="Lead inbox"
          actions={
            <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-2">
              <TextInput
                className="w-48"
                placeholder="Search leads…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search leads"
              />
              <Select
                className="w-36"
                value={source}
                onChange={(event) => {
                  setSource(event.target.value);
                  setPage(1);
                }}
                aria-label="Filter by source"
              >
                <option value="">All sources</option>
                {LEAD_SOURCES.map((sourceOption) => (
                  <option key={sourceOption} value={sourceOption}>
                    {humanize(sourceOption)}
                  </option>
                ))}
              </Select>
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
        <div className="flex gap-1 border-b border-slate-200 px-5 pt-2">
          {(
            [
              { key: "awaiting", label: "Awaiting acknowledgement" },
              { key: "all", label: "All leads" },
            ] as Array<{ key: Tab; label: string }>
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                tab === item.key
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {opportunitiesQuery.isPending ? <LoadingBlock /> : null}
        {opportunitiesQuery.isError ? (
          <ErrorBlock
            error={opportunitiesQuery.error}
            onRetry={() => void opportunitiesQuery.refetch()}
          />
        ) : null}
        {opportunitiesQuery.data && rows.length === 0 ? (
          <EmptyState
            title={tab === "awaiting" ? "Nothing awaiting acknowledgement" : "No leads found"}
            description={
              tab === "awaiting"
                ? "Every assigned lead has been acknowledged. Nice work."
                : "Adjust the filters or create a new lead."
            }
          />
        ) : null}
        {opportunitiesQuery.data && rows.length > 0 ? (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <TH>Lead</TH>
                  <TH>Source</TH>
                  <TH>Owner</TH>
                  <TH>Status</TH>
                  <TH>Created</TH>
                  <TH className="text-right">Actions</TH>
                </tr>
              </thead>
              <tbody>
                {rows.map((opportunity) => {
                  const needsAck =
                    opportunity.ackDeadlineAt !== null && opportunity.acknowledgedAt === null;
                  const contact = contactsById.get(opportunity.contactId);
                  const owner = opportunity.ownerId ? usersById.get(opportunity.ownerId) : undefined;
                  return (
                    <TR key={opportunity.id}>
                      <TD>
                        <Link
                          to={`/opportunities/${opportunity.id}`}
                          className="font-medium text-slate-900 underline-offset-2 hover:underline"
                        >
                          {opportunity.title}
                        </Link>
                        <p className="text-xs text-slate-500">{contact?.name ?? "Unknown contact"}</p>
                      </TD>
                      <TD>
                        <Badge tone="blue">{humanize(opportunity.source)}</Badge>
                      </TD>
                      <TD>
                        {owner ? (
                          <span className="flex items-center gap-2">
                            <Avatar name={owner.name} />
                            <span className="text-sm">{owner.name}</span>
                          </span>
                        ) : (
                          <Badge tone="amber">Unassigned</Badge>
                        )}
                      </TD>
                      <TD>
                        {needsAck && opportunity.ackDeadlineAt ? (
                          <Countdown to={opportunity.ackDeadlineAt} now={now} />
                        ) : opportunity.acknowledgedAt ? (
                          <Badge tone="green">Acknowledged</Badge>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TD>
                      <TD className="text-xs text-slate-500">{timeAgo(opportunity.createdAt, now)}</TD>
                      <TD className="text-right">
                        {needsAck ? (
                          <Button
                            size="sm"
                            isLoading={acknowledge.isPending}
                            onClick={() => void handleAcknowledge(opportunity.id)}
                          >
                            Acknowledge
                          </Button>
                        ) : null}
                        <Button
                          variant="secondary"
                          size="sm"
                          className="ml-1"
                          onClick={() =>
                            setReassignLead({
                              id: opportunity.id,
                              ownerName: owner?.name ?? null,
                            })
                          }
                        >
                          Reassign
                        </Button>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </TableWrap>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={opportunitiesQuery.data.total}
              onPageChange={setPage}
            />
          </>
        ) : null}
      </Card>

      <ReassignModal
        open={reassignLead !== null}
        onClose={() => setReassignLead(null)}
        leadId={reassignLead?.id ?? ""}
        currentOwnerName={reassignLead?.ownerName ?? null}
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
