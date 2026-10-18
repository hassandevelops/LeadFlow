import { useState } from "react";
import { Link } from "react-router";
import { useRecoveryQueue } from "../api/leads";
import { Badge, StatusBadge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardHeader, PageHeader } from "../components/ui/card";
import { Countdown } from "../components/ui/countdown";
import { Pagination } from "../components/ui/pagination";
import { EmptyState, ErrorBlock, LoadingBlock } from "../components/ui/states";
import { TD, TH, TR, TableWrap } from "../components/ui/table";
import { ReassignModal } from "../components/reassign-modal";
import { formatDateTime, timeAgo } from "../lib/format";
import { useNow } from "../lib/server-time";

export function RecoveryQueuePage() {
  const now = useNow();
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const queueQuery = useRecoveryQueue(page, pageSize);
  const [reassignLead, setReassignLead] = useState<{ id: string; ownerName: string | null } | null>(
    null,
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Recovery queue"
        description="Unacknowledged, repeatedly escalated or idle leads that need attention."
      />

      <Card>
        <CardHeader
          title="Needs recovery"
          description={
            queueQuery.data ? `${queueQuery.data.total} leads in the queue` : undefined
          }
        />
        {queueQuery.isPending ? <LoadingBlock /> : null}
        {queueQuery.isError ? (
          <ErrorBlock error={queueQuery.error} onRetry={() => void queueQuery.refetch()} />
        ) : null}
        {queueQuery.data && queueQuery.data.data.length === 0 ? (
          <EmptyState
            title="Recovery queue is empty"
            description="No unacknowledged, escalated or idle leads right now."
          />
        ) : null}
        {queueQuery.data && queueQuery.data.data.length > 0 ? (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <TH>Lead</TH>
                  <TH>Reason</TH>
                  <TH>Owner</TH>
                  <TH>Escalations</TH>
                  <TH>Deadline</TH>
                  <TH>Assigned</TH>
                  <TH className="text-right">Actions</TH>
                </tr>
              </thead>
              <tbody>
                {queueQuery.data.data.map((item) => (
                  <TR key={item.leadId}>
                    <TD>
                      <Link
                        to={`/opportunities/${item.leadId}`}
                        className="font-medium text-slate-900 underline-offset-2 hover:underline"
                      >
                        {item.title}
                      </Link>
                    </TD>
                    <TD>
                      <StatusBadge status={item.reason} />
                    </TD>
                    <TD>
                      {item.ownerName ? (
                        item.ownerName
                      ) : (
                        <Badge tone="amber">Unassigned</Badge>
                      )}
                    </TD>
                    <TD>
                      {item.escalationCount > 0 ? (
                        <Badge tone="red">×{item.escalationCount}</Badge>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TD>
                    <TD>
                      {item.ackDeadlineAt ? (
                        <Countdown to={item.ackDeadlineAt} now={now} />
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TD>
                    <TD className="text-xs text-slate-500">
                      {item.assignedAt ? timeAgo(item.assignedAt, now) : "—"}
                    </TD>
                    <TD className="text-xs text-slate-500">
                      {item.lastActionAt ? formatDateTime(item.lastActionAt) : "—"}
                    </TD>
                    <TD className="text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setReassignLead({ id: item.leadId, ownerName: item.ownerName })
                        }
                      >
                        Reassign
                      </Button>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </TableWrap>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={queueQuery.data.total}
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
    </div>
  );
}
