import { api } from "../lib/api-client";
import { leadKeys, opportunityKeys } from "../lib/query-keys";
import { useApiMutation, useApiQuery } from "./helpers";
import type {
  AssignmentRules,
  CreateLeadInput,
  Opportunity,
  Page,
  ReassignLeadInput,
  RecoveryQueueItem,
  UpdateAssignmentRulesInput,
} from "@leadflow/shared";

export function useRecoveryQueue(page: number, pageSize = 25) {
  const query = { page, pageSize };
  return useApiQuery<Page<RecoveryQueueItem>>(leadKeys.recovery(query), "/recovery-queue", query);
}

export function useAssignmentRules() {
  return useApiQuery<AssignmentRules>(leadKeys.rules, "/assignment-rules");
}

export function useUpdateAssignmentRules() {
  return useApiMutation<UpdateAssignmentRulesInput, AssignmentRules>(
    (input) => api.patch<AssignmentRules>("/assignment-rules", input),
    { invalidate: [leadKeys.rules, ["users"], ["audit"]] },
  );
}

export function useCreateLead() {
  return useApiMutation<CreateLeadInput, Opportunity>(
    (input) => api.post<Opportunity>("/leads", input),
    { invalidate: [["opportunities"], ["contacts"], ["leads"], ["dashboard"]] },
  );
}

export function useAcknowledgeLead() {
  return useApiMutation<string, Opportunity>(
    (id) => api.post<Opportunity>(`/leads/${id}/acknowledge`),
    { invalidate: [["opportunities"], ["leads"], ["dashboard"], ["audit"]] },
  );
}

export function useReassignLead() {
  return useApiMutation<{ id: string; input: ReassignLeadInput }, Opportunity>(
    ({ id, input }) => api.post<Opportunity>(`/leads/${id}/reassign`, input),
    {
      invalidate: [
        ["opportunities"],
        ["leads"],
        ["dashboard"],
        ["audit"],
        opportunityKeys.detail("all"),
      ],
    },
  );
}
