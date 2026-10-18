import { api } from "../lib/api-client";
import { customFieldKeys, pipelineKeys } from "../lib/query-keys";
import { useApiMutation, useApiQuery } from "./helpers";
import type {
  CreateCustomFieldInput,
  CreatePipelineInput,
  CreateStageInput,
  CustomFieldDefinition,
  CustomFieldEntity,
  Pipeline,
  Stage,
  UpdateCustomFieldInput,
  UpdatePipelineInput,
  UpdateStageInput,
} from "@leadflow/shared";

export function usePipelines() {
  return useApiQuery<Pipeline[]>(pipelineKeys.list, "/pipelines", undefined, { staleTime: 60_000 });
}

export function useCreatePipeline() {
  return useApiMutation<CreatePipelineInput, Pipeline>(
    (input) => api.post<Pipeline>("/pipelines", input),
    { invalidate: [pipelineKeys.list] },
  );
}

export function useUpdatePipeline() {
  return useApiMutation<{ id: string; input: UpdatePipelineInput }, Pipeline>(
    ({ id, input }) => api.patch<Pipeline>(`/pipelines/${id}`, input),
    { invalidate: [pipelineKeys.list] },
  );
}

export function useDeletePipeline() {
  return useApiMutation<string, void>((id) => api.delete<void>(`/pipelines/${id}`), {
    invalidate: [pipelineKeys.list],
  });
}

export function useCreateStage() {
  return useApiMutation<{ pipelineId: string; input: CreateStageInput }, Stage>(
    ({ pipelineId, input }) => api.post<Stage>(`/pipelines/${pipelineId}/stages`, input),
    { invalidate: [pipelineKeys.list, ["opportunities"]] },
  );
}

export function useUpdateStage() {
  return useApiMutation<{ id: string; input: UpdateStageInput }, Stage>(
    ({ id, input }) => api.patch<Stage>(`/stages/${id}`, input),
    { invalidate: [pipelineKeys.list, ["opportunities"]] },
  );
}

export function useDeleteStage() {
  return useApiMutation<{ id: string; moveToStageId?: string }, void>(
    ({ id, moveToStageId }) =>
      api.delete<void>(`/stages/${id}${moveToStageId ? `?moveToStageId=${moveToStageId}` : ""}`),
    { invalidate: [pipelineKeys.list, ["opportunities"]] },
  );
}

export function useReorderStages() {
  return useApiMutation<{ pipelineId: string; stageIds: string[] }, Stage[]>(
    ({ pipelineId, stageIds }) =>
      api.patch<Stage[]>(`/pipelines/${pipelineId}/stages/order`, { stageIds }),
    { invalidate: [pipelineKeys.list] },
  );
}

export function useCustomFields(entity?: CustomFieldEntity) {
  return useApiQuery<CustomFieldDefinition[]>(
    customFieldKeys.list(entity),
    "/custom-fields",
    entity ? { entity } : undefined,
    { staleTime: 60_000 },
  );
}

export function useCreateCustomField() {
  return useApiMutation<CreateCustomFieldInput, CustomFieldDefinition>(
    (input) => api.post<CustomFieldDefinition>("/custom-fields", input),
    { invalidate: [customFieldKeys.list(), ["opportunities"], ["contacts"]] },
  );
}

export function useUpdateCustomField() {
  return useApiMutation<{ id: string; input: UpdateCustomFieldInput }, CustomFieldDefinition>(
    ({ id, input }) => api.patch<CustomFieldDefinition>(`/custom-fields/${id}`, input),
    { invalidate: [customFieldKeys.list(), ["opportunities"], ["contacts"]] },
  );
}

export function useDeleteCustomField() {
  return useApiMutation<string, void>((id) => api.delete<void>(`/custom-fields/${id}`), {
    invalidate: [customFieldKeys.list(), ["opportunities"], ["contacts"]],
  });
}
