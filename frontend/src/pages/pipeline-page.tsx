import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Opportunity } from "@leadflow/shared";
import {
  downloadOpportunitiesCsv,
  useContacts,
  useMoveOpportunityStage,
  useOpportunities,
} from "../api/crm";
import { usePipelines } from "../api/pipeline";
import { useUsers } from "../api/users";
import { useCan } from "../auth/use-can";
import { isApiClientError } from "../lib/api-client";
import { Avatar } from "../components/ui/avatar";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, PageHeader } from "../components/ui/card";
import { Select } from "../components/ui/field";
import { Countdown } from "../components/ui/countdown";
import { EmptyState, ErrorBlock, LoadingBlock } from "../components/ui/states";
import { useToast } from "../components/ui/toast";
import { NewLeadModal } from "../components/new-lead-modal";
import { formatMoney, timeAgo } from "../lib/format";
import { useNow } from "../lib/server-time";

export function PipelinePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const now = useNow();
  const can = useCan();
  const pipelinesQuery = usePipelines();
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropStageId, setDropStageId] = useState<string | null>(null);

  const opportunitiesQuery = useOpportunities({
    pipelineId: pipelineId ?? undefined,
    page: 1,
    pageSize: 100,
  });
  const contactsQuery = useContacts({ page: 1, pageSize: 100 });
  const usersQuery = useUsers({ page: 1, pageSize: 100 });
  const moveStage = useMoveOpportunityStage();

  useEffect(() => {
    if (pipelineId || !pipelinesQuery.data) return;
    const fallback = pipelinesQuery.data.find((pipeline) => pipeline.isDefault) ?? pipelinesQuery.data[0];
    if (fallback) setPipelineId(fallback.id);
  }, [pipelineId, pipelinesQuery.data]);

  const contactsById = useMemo(
    () => new Map((contactsQuery.data?.data ?? []).map((contact) => [contact.id, contact])),
    [contactsQuery.data],
  );
  const usersById = useMemo(
    () => new Map((usersQuery.data?.data ?? []).map((user) => [user.id, user])),
    [usersQuery.data],
  );

  const pipeline = pipelinesQuery.data?.find((candidate) => candidate.id === pipelineId) ?? null;
  const opportunities = opportunitiesQuery.data?.data ?? [];

  const byStage = useMemo(() => {
    const map = new Map<string, Opportunity[]>();
    for (const opportunity of opportunities) {
      const list = map.get(opportunity.stageId) ?? [];
      list.push(opportunity);
      map.set(opportunity.stageId, list);
    }
    return map;
  }, [opportunities]);

  async function handleDrop(stageId: string) {
    const opportunityId = draggingId;
    setDraggingId(null);
    setDropStageId(null);
    if (!opportunityId) return;
    const opportunity = opportunities.find((candidate) => candidate.id === opportunityId);
    if (!opportunity || opportunity.stageId === stageId) return;
    try {
      await moveStage.mutateAsync({ id: opportunityId, stageId });
    } catch (error) {
      if (isApiClientError(error) && error.code === "validation_failed") {
        const details = error.details as
          | { missingFields?: Array<{ label: string }> }
          | undefined;
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

  async function handleExport() {
    setIsExporting(true);
    try {
      await downloadOpportunitiesCsv({
        pipelineId: pipelineId ?? undefined,
        page: 1,
        pageSize: 100,
      });
      toast.show({ title: "Export downloaded", variant: "success" });
    } catch (error) {
      toast.show({
        title: "Could not export opportunities",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[100rem]">
      <PageHeader
        title="Pipeline"
        description="Drag deals between stages. Required fields are validated on drop."
        actions={
          <>
            <Select
              className="w-52"
              value={pipelineId ?? ""}
              onChange={(event) => setPipelineId(event.target.value)}
              aria-label="Select pipeline"
            >
              {(pipelinesQuery.data ?? []).map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </Select>
            {can("crm.export") ? (
              <Button
                variant="secondary"
                isLoading={isExporting}
                onClick={() => void handleExport()}
              >
                Export CSV
              </Button>
            ) : null}
            <Button onClick={() => setLeadOpen(true)}>New lead</Button>
          </>
        }
      />

      {pipelinesQuery.isPending || opportunitiesQuery.isPending ? <LoadingBlock /> : null}
      {opportunitiesQuery.isError ? (
        <ErrorBlock error={opportunitiesQuery.error} onRetry={() => void opportunitiesQuery.refetch()} />
      ) : null}

      {pipeline ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {pipeline.stages.map((stage) => {
            const stageOpportunities = byStage.get(stage.id) ?? [];
            const total = stageOpportunities.reduce(
              (sum, opportunity) =>
                opportunity.valueHidden || opportunity.value === null ? sum : sum + opportunity.value,
              0,
            );
            return (
              <section
                key={stage.id}
                aria-label={`${stage.name} stage`}
                className={`flex w-72 shrink-0 flex-col rounded-xl border bg-slate-50 transition-colors ${
                  dropStageId === stage.id ? "border-slate-900 bg-white" : "border-slate-200"
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDropStageId(stage.id);
                }}
                onDragLeave={() => setDropStageId((current) => (current === stage.id ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  void handleDrop(stage.id);
                }}
              >
                <header className="border-b border-slate-200 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">{stage.name}</p>
                    <Badge>{stageOpportunities.length}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">{formatMoney(total, "usd")}</p>
                </header>
                <div className="flex min-h-24 flex-1 flex-col gap-2 p-2">
                  {stageOpportunities.length === 0 ? (
                    <p className="px-1 py-4 text-center text-xs text-slate-400">
                      Drop deals here
                    </p>
                  ) : null}
                  {stageOpportunities.map((opportunity) => {
                    const isOverdue =
                      opportunity.ackDeadlineAt !== null && opportunity.acknowledgedAt === null;
                    const contact = contactsById.get(opportunity.contactId);
                    const owner = opportunity.ownerId
                      ? usersById.get(opportunity.ownerId)
                      : undefined;
                    return (
                      <article
                        key={opportunity.id}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", opportunity.id);
                          setDraggingId(opportunity.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDropStageId(null);
                        }}
                        className={`cursor-grab rounded-lg border bg-white p-3 shadow-sm ${
                          isOverdue ? "border-red-300" : "border-slate-200"
                        } ${draggingId === opportunity.id ? "opacity-50" : ""}`}
                      >
                        <Link
                          to={`/opportunities/${opportunity.id}`}
                          className="block text-sm font-medium text-slate-900 hover:underline"
                        >
                          {opportunity.title}
                        </Link>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {contact?.name ?? "Unknown contact"}
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-800">
                            {opportunity.valueHidden || opportunity.value === null
                              ? "•••"
                              : formatMoney(opportunity.value, opportunity.currency)}
                          </span>
                          {owner ? <Avatar name={owner.name} /> : <Badge tone="amber">Unassigned</Badge>}
                        </div>
                        {isOverdue && opportunity.ackDeadlineAt ? (
                          <div className="mt-1.5 flex items-center justify-between gap-2">
                            <Countdown to={opportunity.ackDeadlineAt} now={now} />
                            <span className="text-xs text-slate-400">
                              {opportunity.stageEnteredAt
                                ? timeAgo(opportunity.stageEnteredAt, now)
                                : null}
                            </span>
                          </div>
                        ) : (
                          <p className="mt-1.5 text-xs text-slate-400">
                            {opportunity.stageEnteredAt
                              ? `In stage ${timeAgo(opportunity.stageEnteredAt, now)}`
                              : null}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      {!pipeline && !pipelinesQuery.isPending ? (
        <Card>
          <EmptyState
            title="No pipeline yet"
            description="Create a pipeline in Settings to start tracking deals."
            action={
              <Button variant="secondary" onClick={() => navigate("/settings/pipeline")}>
                Go to settings
              </Button>
            }
          />
        </Card>
      ) : null}

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
