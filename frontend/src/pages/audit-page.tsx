import { useState } from "react";
import { AUDIT_EVENT_TYPES, type AuditEntry, type AuditEventType } from "@leadflow/shared";
import { useAuditEntries } from "../api/audit";
import { useUsers } from "../api/users";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardHeader, PageHeader } from "../components/ui/card";
import { Field, Select, TextInput } from "../components/ui/field";
import { Modal } from "../components/ui/modal";
import { Pagination } from "../components/ui/pagination";
import { EmptyState, ErrorBlock, LoadingBlock } from "../components/ui/states";
import { TD, TH, TR, TableWrap } from "../components/ui/table";
import { formatDateTime, humanize } from "../lib/format";

export function AuditPage() {
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [eventType, setEventType] = useState("");
  const [actorId, setActorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const usersQuery = useUsers({ page: 1, pageSize: 100 });
  const auditQuery = useAuditEntries({
    page,
    pageSize,
    eventType: (eventType || undefined) as AuditEventType | undefined,
    actorId: actorId || undefined,
    from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
  });

  const entries = auditQuery.data?.data ?? [];
  const hasFilters = eventType !== "" || actorId !== "" || from !== "" || to !== "";

  function resetFilters() {
    setEventType("");
    setActorId("");
    setFrom("");
    setTo("");
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Audit log"
        description="Every sensitive action in the workspace, with before/after snapshots."
      />

      <Card className="mb-4">
        <CardHeader
          title="Filters"
          actions={
            hasFilters ? (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Clear filters
              </Button>
            ) : null
          }
        />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Event type">
            <Select
              value={eventType}
              onChange={(event) => {
                setEventType(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All events</option>
              {AUDIT_EVENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {humanize(type)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Actor">
            <Select
              value={actorId}
              onChange={(event) => {
                setActorId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Anyone</option>
              {(usersQuery.data?.data ?? []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From">
            <TextInput
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
            />
          </Field>
          <Field label="To">
            <TextInput
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
            />
          </Field>
        </div>
      </Card>

      <Card>
        {auditQuery.isPending ? <LoadingBlock /> : null}
        {auditQuery.isError ? (
          <ErrorBlock error={auditQuery.error} onRetry={() => void auditQuery.refetch()} />
        ) : null}
        {auditQuery.data && entries.length === 0 ? (
          <EmptyState
            title="No audit entries"
            description={hasFilters ? "No events match these filters." : "Activity appears here as it happens."}
          />
        ) : null}
        {auditQuery.data && entries.length > 0 ? (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <TH>When</TH>
                  <TH>Actor</TH>
                  <TH>Event</TH>
                  <TH>Summary</TH>
                  <TH>Target</TH>
                  <TH />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <TR key={entry.id}>
                    <TD className="whitespace-nowrap text-xs text-slate-500">
                      {formatDateTime(entry.at)}
                    </TD>
                    <TD>
                      <p className="text-sm font-medium text-slate-800">{entry.actorName}</p>
                      <Badge tone={entry.actorType === "system" ? "slate" : "blue"}>
                        {humanize(entry.actorType)}
                      </Badge>
                    </TD>
                    <TD>
                      <Badge tone="slate">{humanize(entry.eventType)}</Badge>
                    </TD>
                    <TD className="max-w-80 text-sm text-slate-700">{entry.summary}</TD>
                    <TD className="text-xs text-slate-500">
                      {entry.targetType} · {entry.targetId.slice(0, 8)}…
                    </TD>
                    <TD>
                      <Button variant="ghost" size="sm" onClick={() => setSelected(entry)}>
                        Details
                      </Button>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </TableWrap>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={auditQuery.data.total}
              onPageChange={setPage}
            />
          </>
        ) : null}
      </Card>

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title="Audit entry"
        size="lg"
      >
        {selected ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">When</dt>
                <dd className="text-slate-800">{formatDateTime(selected.at)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Actor</dt>
                <dd className="text-slate-800">
                  {selected.actorName} ({humanize(selected.actorType)})
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Event</dt>
                <dd className="text-slate-800">{humanize(selected.eventType)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Target</dt>
                <dd className="text-slate-800">
                  {selected.targetType} · {selected.targetId}
                </dd>
              </div>
            </dl>
            <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">{selected.summary}</p>
            {selected.before !== undefined || selected.after !== undefined ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500 uppercase">Before</p>
                  <pre className="max-h-64 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    {selected.before === undefined
                      ? "—"
                      : JSON.stringify(selected.before, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500 uppercase">After</p>
                  <pre className="max-h-64 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    {selected.after === undefined
                      ? "—"
                      : JSON.stringify(selected.after, null, 2)}
                  </pre>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
