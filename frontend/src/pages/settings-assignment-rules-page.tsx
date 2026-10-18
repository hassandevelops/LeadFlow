import { useEffect, useState } from "react";
import {
  ABSENCE_HANDLING,
  type AssignmentRules,
  type EscalationLevel,
  type UpdateAssignmentRulesInput,
} from "@leadflow/shared";
import { useAssignmentRules, useUpdateAssignmentRules } from "../api/leads";
import { useUsers } from "../api/users";
import { Button } from "../components/ui/button";
import { Card, CardBody, CardHeader } from "../components/ui/card";
import { Field, Select, TextInput } from "../components/ui/field";
import { ErrorBlock, LoadingBlock } from "../components/ui/states";
import { useToast } from "../components/ui/toast";
import { humanize } from "../lib/format";

type Draft = {
  maxOpenLeadsPerUser: string;
  ackWindowSeconds: string;
  idleThresholdSeconds: string;
  escalationLevels: EscalationLevel[];
  backupUserId: string;
  managerUserId: string;
  absenceHandling: AssignmentRules["absenceHandling"];
};

function toDraft(rules: AssignmentRules): Draft {
  return {
    maxOpenLeadsPerUser: String(rules.maxOpenLeadsPerUser),
    ackWindowSeconds: String(rules.ackWindowSeconds),
    idleThresholdSeconds: String(rules.idleThresholdSeconds),
    escalationLevels: rules.escalationLevels.map((level) => ({ ...level })),
    backupUserId: rules.backupUserId ?? "",
    managerUserId: rules.managerUserId ?? "",
    absenceHandling: rules.absenceHandling,
  };
}

export function SettingsAssignmentRulesPage() {
  const toast = useToast();
  const rulesQuery = useAssignmentRules();
  const usersQuery = useUsers({ page: 1, pageSize: 100 });
  const updateRules = useUpdateAssignmentRules();
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (rulesQuery.data) setDraft(toDraft(rulesQuery.data));
  }, [rulesQuery.data]);

  if (rulesQuery.isPending || usersQuery.isPending || !draft) return <LoadingBlock />;
  if (rulesQuery.isError) {
    return <ErrorBlock error={rulesQuery.error} onRetry={() => void rulesQuery.refetch()} />;
  }

  const users = usersQuery.data?.data ?? [];

  function updateLevel(index: number, patch: Partial<EscalationLevel>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            escalationLevels: current.escalationLevels.map((level, i) =>
              i === index ? { ...level, ...patch } : level,
            ),
          }
        : current,
    );
  }

  async function handleSave() {
    if (!draft) return;
    const payload: UpdateAssignmentRulesInput = {
      maxOpenLeadsPerUser: Number(draft.maxOpenLeadsPerUser),
      ackWindowSeconds: Number(draft.ackWindowSeconds),
      idleThresholdSeconds: Number(draft.idleThresholdSeconds),
      escalationLevels: draft.escalationLevels,
      backupUserId: draft.backupUserId === "" ? null : draft.backupUserId,
      managerUserId: draft.managerUserId === "" ? null : draft.managerUserId,
      absenceHandling: draft.absenceHandling,
    };
    try {
      await updateRules.mutateAsync(payload);
      toast.show({ title: "Assignment rules saved", variant: "success" });
    } catch (error) {
      toast.show({
        title: "Could not save rules",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    }
  }

  function userOptions() {
    return (
      <>
        <option value="">None</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Assignment"
          description="Leads are distributed round-robin to teammates who are available and under capacity."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Max open leads per user" hint="New leads skip teammates above this limit.">
            <TextInput
              type="number"
              min={1}
              max={50}
              value={draft.maxOpenLeadsPerUser}
              onChange={(event) =>
                setDraft({ ...draft, maxOpenLeadsPerUser: event.target.value })
              }
            />
          </Field>
          <Field label="Acknowledgement window (seconds)" hint="Time a rep has to acknowledge a lead.">
            <TextInput
              type="number"
              min={5}
              value={draft.ackWindowSeconds}
              onChange={(event) => setDraft({ ...draft, ackWindowSeconds: event.target.value })}
            />
          </Field>
          <Field label="Backup assignee" hint="Receives leads when everyone is at capacity.">
            <Select
              value={draft.backupUserId}
              onChange={(event) => setDraft({ ...draft, backupUserId: event.target.value })}
            >
              {userOptions()}
            </Select>
          </Field>
          <Field label="Team manager" hint="Loop in for stale leads and recovery queue.">
            <Select
              value={draft.managerUserId}
              onChange={(event) => setDraft({ ...draft, managerUserId: event.target.value })}
            >
              {userOptions()}
            </Select>
          </Field>
          <Field label="Idle threshold (seconds)" hint="Leads with no activity beyond this land in recovery.">
            <TextInput
              type="number"
              min={60}
              value={draft.idleThresholdSeconds}
              onChange={(event) =>
                setDraft({ ...draft, idleThresholdSeconds: event.target.value })
              }
            />
          </Field>
          <Field label="When a teammate is on leave">
            <Select
              value={draft.absenceHandling}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  absenceHandling: event.target.value as AssignmentRules["absenceHandling"],
                })
              }
            >
              {ABSENCE_HANDLING.map((mode) => (
                <option key={mode} value={mode}>
                  {humanize(mode)}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Escalation levels"
          description="If a lead is not acknowledged in time, escalate to the next person (max 5 levels)."
          actions={
            <Button
              variant="secondary"
              size="sm"
              disabled={draft.escalationLevels.length >= 5}
              onClick={() =>
                setDraft({
                  ...draft,
                  escalationLevels: [
                    ...draft.escalationLevels,
                    { targetUserId: null, timeoutSeconds: 300 },
                  ],
                })
              }
            >
              Add level
            </Button>
          }
        />
        <CardBody className="space-y-3">
          {draft.escalationLevels.length === 0 ? (
            <p className="text-sm text-slate-500">
              No escalation levels yet. Overdue leads stay with their owner.
            </p>
          ) : null}
          {draft.escalationLevels.map((level, index) => (
            <div key={index} className="flex flex-wrap items-end gap-3">
              <Field label={`Level ${index + 1} target`} className="min-w-48 flex-1">
                <Select
                  value={level.targetUserId ?? ""}
                  onChange={(event) =>
                    updateLevel(index, { targetUserId: event.target.value || null })
                  }
                >
                  {userOptions()}
                </Select>
              </Field>
              <Field label="Timeout (seconds)" className="w-40">
                <TextInput
                  type="number"
                  min={5}
                  value={level.timeoutSeconds}
                  onChange={(event) =>
                    updateLevel(index, { timeoutSeconds: Number(event.target.value) })
                  }
                />
              </Field>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setDraft({
                    ...draft,
                    escalationLevels: draft.escalationLevels.filter((_, i) => i !== index),
                  })
                }
              >
                Remove
              </Button>
            </div>
          ))}
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => void handleSave()} isLoading={updateRules.isPending}>
          Save rules
        </Button>
      </div>
    </div>
  );
}
