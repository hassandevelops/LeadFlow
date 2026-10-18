import { useState } from "react";
import {
  CUSTOM_FIELD_TYPES,
  type CustomFieldDefinition,
  type CustomFieldType,
  type Pipeline,
  type Stage,
} from "@leadflow/shared";
import {
  useCreateCustomField,
  useCreatePipeline,
  useCreateStage,
  useCustomFields,
  useDeleteCustomField,
  useDeletePipeline,
  useDeleteStage,
  usePipelines,
  useReorderStages,
  useUpdateCustomField,
  useUpdatePipeline,
  useUpdateStage,
} from "../api/pipeline";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardBody, CardHeader } from "../components/ui/card";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { Checkbox, Field, Select, TextArea, TextInput } from "../components/ui/field";
import { Modal } from "../components/ui/modal";
import { ErrorBlock, LoadingBlock } from "../components/ui/states";
import { TD, TH, TR, TableWrap } from "../components/ui/table";
import { useToast } from "../components/ui/toast";
import { humanize } from "../lib/format";

type StageDraft = {
  pipelineId: string;
  stage: Stage | null;
  name: string;
  isWon: boolean;
  isLost: boolean;
  color: string;
  requiredFieldKeys: string[];
};

const EMPTY_STAGE: StageDraft = {
  pipelineId: "",
  stage: null,
  name: "",
  isWon: false,
  isLost: false,
  color: "",
  requiredFieldKeys: [],
};

type FieldDraft = {
  field: CustomFieldDefinition | null;
  entity: "contact" | "opportunity";
  key: string;
  label: string;
  type: CustomFieldType;
  options: string;
  required: boolean;
};

const EMPTY_FIELD: FieldDraft = {
  field: null,
  entity: "opportunity",
  key: "",
  label: "",
  type: "text",
  options: "",
  required: false,
};

export function SettingsPipelinePage() {
  const toast = useToast();
  const pipelinesQuery = usePipelines();
  const fieldsQuery = useCustomFields();
  const createPipeline = useCreatePipeline();
  const updatePipeline = useUpdatePipeline();
  const deletePipeline = useDeletePipeline();
  const createStage = useCreateStage();
  const updateStage = useUpdateStage();
  const deleteStage = useDeleteStage();
  const reorderStages = useReorderStages();
  const createField = useCreateCustomField();
  const updateField = useUpdateCustomField();
  const deleteField = useDeleteCustomField();

  const [pipelineModalOpen, setPipelineModalOpen] = useState(false);
  const [pipelineDraft, setPipelineDraft] = useState<{ name: string; editing: Pipeline | null }>({
    name: "",
    editing: null,
  });
  const [stageDraft, setStageDraft] = useState<StageDraft | null>(null);
  const [stageError, setStageError] = useState<string | null>(null);
  const [deletePipelineTarget, setDeletePipelineTarget] = useState<Pipeline | null>(null);
  const [deleteStageTarget, setDeleteStageTarget] = useState<{ stage: Stage; pipeline: Pipeline } | null>(
    null,
  );
  const [moveToStageId, setMoveToStageId] = useState("");
  const [fieldDraft, setFieldDraft] = useState<FieldDraft | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [deleteFieldTarget, setDeleteFieldTarget] = useState<CustomFieldDefinition | null>(null);

  if (pipelinesQuery.isPending || fieldsQuery.isPending) return <LoadingBlock />;
  if (pipelinesQuery.isError || fieldsQuery.isError) {
    return (
      <ErrorBlock
        error={pipelinesQuery.error ?? fieldsQuery.error}
        onRetry={() => {
          void pipelinesQuery.refetch();
          void fieldsQuery.refetch();
        }}
      />
    );
  }

  const pipelines = pipelinesQuery.data;
  const fields = fieldsQuery.data;
  const opportunityFields = fields.filter((field) => field.entity === "opportunity");

  async function handleSavePipeline() {
    const name = pipelineDraft.name.trim();
    if (!name) return;
    try {
      if (pipelineDraft.editing) {
        await updatePipeline.mutateAsync({ id: pipelineDraft.editing.id, input: { name } });
      } else {
        await createPipeline.mutateAsync({ name });
      }
      toast.show({ title: pipelineDraft.editing ? "Pipeline renamed" : "Pipeline created", variant: "success" });
      setPipelineModalOpen(false);
      setPipelineDraft({ name: "", editing: null });
    } catch (error) {
      toast.show({
        title: "Could not save pipeline",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    }
  }

  async function handleSaveStage() {
    if (!stageDraft) return;
    const name = stageDraft.name.trim();
    if (!name) {
      setStageError("Stage name is required");
      return;
    }
    const payload = {
      name,
      isWon: stageDraft.isWon,
      isLost: stageDraft.isLost,
      requiredFieldKeys: stageDraft.requiredFieldKeys,
    };
    const color = stageDraft.color.trim();
    try {
      if (stageDraft.stage) {
        await updateStage.mutateAsync({
          id: stageDraft.stage.id,
          input: { ...payload, color: color === "" ? null : color },
        });
      } else {
        await createStage.mutateAsync({
          pipelineId: stageDraft.pipelineId,
          input: color === "" ? payload : { ...payload, color },
        });
      }
      toast.show({ title: stageDraft.stage ? "Stage updated" : "Stage added", variant: "success" });
      setStageDraft(null);
      setStageError(null);
    } catch (error) {
      setStageError(error instanceof Error ? error.message : "Could not save stage");
    }
  }

  async function handleMoveStage(pipeline: Pipeline, index: number, direction: -1 | 1) {
    const next = [...pipeline.stages];
    const target = index + direction;
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    try {
      await reorderStages.mutateAsync({
        pipelineId: pipeline.id,
        stageIds: next.map((stage) => stage.id),
      });
    } catch (error) {
      toast.show({
        title: "Could not reorder stages",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    }
  }

  async function handleSaveField() {
    if (!fieldDraft) return;
    const label = fieldDraft.label.trim();
    const key = fieldDraft.key.trim();
    if (!label) {
      setFieldError("Label is required");
      return;
    }
    if (!fieldDraft.field && !/^[a-z][a-z0-9_]{1,40}$/.test(key)) {
      setFieldError("Key must start with a letter and use lowercase letters, numbers or underscores");
      return;
    }
    const options = fieldDraft.options
      .split(",")
      .map((option) => option.trim())
      .filter(Boolean);
    try {
      if (fieldDraft.field) {
        await updateField.mutateAsync({
          id: fieldDraft.field.id,
          input: {
            label,
            options: fieldDraft.field.type === "dropdown" ? options : [],
            required: fieldDraft.required,
          },
        });
      } else {
        await createField.mutateAsync({
          entity: fieldDraft.entity,
          key,
          label,
          type: fieldDraft.type,
          options: fieldDraft.type === "dropdown" ? options : [],
          required: fieldDraft.required,
          order: fields.filter((field) => field.entity === fieldDraft.entity).length,
        });
      }
      toast.show({ title: fieldDraft.field ? "Field updated" : "Field created", variant: "success" });
      setFieldDraft(null);
      setFieldError(null);
    } catch (error) {
      setFieldError(error instanceof Error ? error.message : "Could not save field");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Pipelines"
          description="Drag-free ordering with arrow buttons; stages validate required fields on move."
          actions={
            <Button
              size="sm"
              onClick={() => {
                setPipelineDraft({ name: "", editing: null });
                setPipelineModalOpen(true);
              }}
            >
              New pipeline
            </Button>
          }
        />
        <CardBody className="space-y-6">
          {pipelines.map((pipeline) => (
            <div key={pipeline.id} className="rounded-lg border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {pipeline.name}
                    {pipeline.isDefault ? (
                      <Badge tone="blue" className="ml-2">
                        Default
                      </Badge>
                    ) : null}
                  </p>
                  <p className="text-xs text-slate-500">{pipeline.stages.length} stages</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setPipelineDraft({ name: pipeline.name, editing: pipeline });
                      setPipelineModalOpen(true);
                    }}
                  >
                    Rename
                  </Button>
                  {!pipeline.isDefault ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletePipelineTarget(pipeline)}
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {pipeline.stages.map((stage, index) => (
                  <div
                    key={stage.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-6 text-xs text-slate-400">{index + 1}</span>
                      <span className="text-sm font-medium text-slate-800">{stage.name}</span>
                      {stage.isWon ? <Badge tone="green">Won</Badge> : null}
                      {stage.isLost ? <Badge tone="red">Lost</Badge> : null}
                      {stage.requiredFieldKeys.length > 0 ? (
                        <Badge tone="amber">
                          {stage.requiredFieldKeys.length} required field
                          {stage.requiredFieldKeys.length === 1 ? "" : "s"}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Move ${stage.name} up`}
                        disabled={index === 0 || reorderStages.isPending}
                        onClick={() => void handleMoveStage(pipeline, index, -1)}
                      >
                        ↑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Move ${stage.name} down`}
                        disabled={index === pipeline.stages.length - 1 || reorderStages.isPending}
                        onClick={() => void handleMoveStage(pipeline, index, 1)}
                      >
                        ↓
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setStageDraft({
                            pipelineId: pipeline.id,
                            stage,
                            name: stage.name,
                            isWon: stage.isWon,
                            isLost: stage.isLost,
                            color: stage.color ?? "",
                            requiredFieldKeys: stage.requiredFieldKeys,
                          });
                          setStageError(null);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pipeline.stages.length <= 1}
                        onClick={() => {
                          setDeleteStageTarget({ stage, pipeline });
                          setMoveToStageId(
                            pipeline.stages.find((candidate) => candidate.id !== stage.id)?.id ?? "",
                          );
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-200 px-4 py-2.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStageDraft({ ...EMPTY_STAGE, pipelineId: pipeline.id });
                    setStageError(null);
                  }}
                >
                  + Add stage
                </Button>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Custom fields"
          description="Extra data captured on contacts and opportunities (max useful on required markers)."
          actions={
            <Button
              size="sm"
              onClick={() => {
                setFieldDraft({ ...EMPTY_FIELD });
                setFieldError(null);
              }}
            >
              New field
            </Button>
          }
        />
        <TableWrap>
          <thead>
            <tr>
              <TH>Label</TH>
              <TH>Key</TH>
              <TH>Entity</TH>
              <TH>Type</TH>
              <TH>Required</TH>
              <TH className="text-right">Actions</TH>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <TR key={field.id}>
                <TD className="font-medium text-slate-900">{field.label}</TD>
                <TD>
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{field.key}</code>
                </TD>
                <TD className="capitalize">{field.entity}</TD>
                <TD>
                  <Badge>{humanize(field.type)}</Badge>
                  {field.type === "dropdown" && field.options.length > 0 ? (
                    <span className="ml-2 text-xs text-slate-500">{field.options.join(", ")}</span>
                  ) : null}
                </TD>
                <TD>{field.required ? "Yes" : "—"}</TD>
                <TD className="text-right">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setFieldDraft({
                        field,
                        entity: field.entity,
                        key: field.key,
                        label: field.label,
                        type: field.type,
                        options: field.options.join(", "),
                        required: field.required,
                      });
                      setFieldError(null);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-1"
                    onClick={() => setDeleteFieldTarget(field)}
                  >
                    Delete
                  </Button>
                </TD>
              </TR>
            ))}
          </tbody>
        </TableWrap>
      </Card>

      <Modal
        open={pipelineModalOpen}
        onClose={() => setPipelineModalOpen(false)}
        title={pipelineDraft.editing ? "Rename pipeline" : "New pipeline"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPipelineModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSavePipeline()} isLoading={createPipeline.isPending || updatePipeline.isPending}>
              Save
            </Button>
          </>
        }
      >
        <Field label="Pipeline name" required>
          <TextInput
            value={pipelineDraft.name}
            onChange={(event) => setPipelineDraft({ ...pipelineDraft, name: event.target.value })}
            autoFocus
          />
        </Field>
      </Modal>

      <Modal
        open={stageDraft !== null}
        onClose={() => setStageDraft(null)}
        title={stageDraft?.stage ? `Edit stage — ${stageDraft.stage.name}` : "Add stage"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setStageDraft(null)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveStage()} isLoading={createStage.isPending || updateStage.isPending}>
              Save stage
            </Button>
          </>
        }
      >
        {stageDraft ? (
          <div className="space-y-4">
            <Field label="Stage name" required>
              <TextInput
                value={stageDraft.name}
                onChange={(event) => setStageDraft({ ...stageDraft, name: event.target.value })}
                autoFocus
              />
            </Field>
            <Field label="Color" hint="Optional Tailwind color name, e.g. emerald">
              <TextInput
                value={stageDraft.color}
                onChange={(event) => setStageDraft({ ...stageDraft, color: event.target.value })}
              />
            </Field>
            <div className="flex gap-4">
              <Checkbox
                label="Won stage"
                checked={stageDraft.isWon}
                onChange={(event) =>
                  setStageDraft({ ...stageDraft, isWon: event.target.checked, isLost: false })
                }
              />
              <Checkbox
                label="Lost stage"
                checked={stageDraft.isLost}
                onChange={(event) =>
                  setStageDraft({ ...stageDraft, isLost: event.target.checked, isWon: false })
                }
              />
            </div>
            {opportunityFields.length > 0 ? (
              <div>
                <p className="text-sm font-medium text-slate-700">Required fields to enter this stage</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {opportunityFields.map((field) => (
                    <Checkbox
                      key={field.id}
                      label={field.label}
                      checked={stageDraft.requiredFieldKeys.includes(field.key)}
                      onChange={(event) =>
                        setStageDraft({
                          ...stageDraft,
                          requiredFieldKeys: event.target.checked
                            ? [...stageDraft.requiredFieldKeys, field.key]
                            : stageDraft.requiredFieldKeys.filter((key) => key !== field.key),
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {stageError ? (
              <p role="alert" className="text-sm text-red-600">
                {stageError}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={deletePipelineTarget !== null}
        onClose={() => setDeletePipelineTarget(null)}
        title="Delete pipeline"
        description={
          deletePipelineTarget
            ? `Delete "${deletePipelineTarget.name}"? Pipelines with opportunities cannot be deleted.`
            : ""
        }
        confirmLabel="Delete pipeline"
        destructive
        onConfirm={async () => {
          if (!deletePipelineTarget) return;
          try {
            await deletePipeline.mutateAsync(deletePipelineTarget.id);
            toast.show({ title: "Pipeline deleted", variant: "success" });
          } catch (error) {
            toast.show({
              title: "Could not delete pipeline",
              description: error instanceof Error ? error.message : undefined,
              variant: "error",
            });
          }
        }}
      />

      <Modal
        open={deleteStageTarget !== null}
        onClose={() => setDeleteStageTarget(null)}
        title="Remove stage"
        description="Opportunities in this stage are moved to another stage you choose."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteStageTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={deleteStage.isPending}
              onClick={async () => {
                if (!deleteStageTarget) return;
                try {
                  await deleteStage.mutateAsync({
                    id: deleteStageTarget.stage.id,
                    moveToStageId,
                  });
                  toast.show({ title: "Stage removed", variant: "success" });
                  setDeleteStageTarget(null);
                } catch (error) {
                  toast.show({
                    title: "Could not remove stage",
                    description: error instanceof Error ? error.message : undefined,
                    variant: "error",
                  });
                }
              }}
            >
              Remove stage
            </Button>
          </>
        }
      >
        {deleteStageTarget ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Remove <span className="font-medium">{deleteStageTarget.stage.name}</span> from{" "}
              {deleteStageTarget.pipeline.name}. Move existing opportunities to:
            </p>
            <Field label="Move to stage">
              <Select
                value={moveToStageId}
                onChange={(event) => setMoveToStageId(event.target.value)}
              >
                {deleteStageTarget.pipeline.stages
                  .filter((stage) => stage.id !== deleteStageTarget.stage.id)
                  .map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={fieldDraft !== null}
        onClose={() => setFieldDraft(null)}
        title={fieldDraft?.field ? `Edit field — ${fieldDraft.field.label}` : "New custom field"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFieldDraft(null)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveField()} isLoading={createField.isPending || updateField.isPending}>
              Save field
            </Button>
          </>
        }
      >
        {fieldDraft ? (
          <div className="space-y-4">
            <Field label="Entity">
              <Select
                value={fieldDraft.entity}
                disabled={fieldDraft.field !== null}
                onChange={(event) =>
                  setFieldDraft({ ...fieldDraft, entity: event.target.value as FieldDraft["entity"] })
                }
              >
                <option value="contact">Contact</option>
                <option value="opportunity">Opportunity</option>
              </Select>
            </Field>
            <Field label="Key" required hint="Used in filters and exports; cannot change later.">
              <TextInput
                value={fieldDraft.key}
                disabled={fieldDraft.field !== null}
                onChange={(event) => setFieldDraft({ ...fieldDraft, key: event.target.value })}
                placeholder="e.g. referral_source"
              />
            </Field>
            <Field label="Label" required>
              <TextInput
                value={fieldDraft.label}
                onChange={(event) => setFieldDraft({ ...fieldDraft, label: event.target.value })}
              />
            </Field>
            <Field label="Type">
              <Select
                value={fieldDraft.type}
                disabled={fieldDraft.field !== null}
                onChange={(event) =>
                  setFieldDraft({ ...fieldDraft, type: event.target.value as CustomFieldType })
                }
              >
                {CUSTOM_FIELD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {humanize(type)}
                  </option>
                ))}
              </Select>
            </Field>
            {fieldDraft.type === "dropdown" ? (
              <Field label="Options" hint="Comma separated values." required>
                <TextArea
                  value={fieldDraft.options}
                  onChange={(event) => setFieldDraft({ ...fieldDraft, options: event.target.value })}
                  placeholder="Prospect, Partner, Customer"
                />
              </Field>
            ) : null}
            <Checkbox
              label="Required"
              checked={fieldDraft.required}
              onChange={(event) => setFieldDraft({ ...fieldDraft, required: event.target.checked })}
            />
            {fieldError ? (
              <p role="alert" className="text-sm text-red-600">
                {fieldError}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={deleteFieldTarget !== null}
        onClose={() => setDeleteFieldTarget(null)}
        title="Delete custom field"
        description={
          deleteFieldTarget
            ? `Delete "${deleteFieldTarget.label}"? Existing values on records are removed and stage requirements referencing it are cleaned up.`
            : ""
        }
        confirmLabel="Delete field"
        destructive
        onConfirm={async () => {
          if (!deleteFieldTarget) return;
          try {
            await deleteField.mutateAsync(deleteFieldTarget.id);
            toast.show({ title: "Field deleted", variant: "success" });
          } catch (error) {
            toast.show({
              title: "Could not delete field",
              description: error instanceof Error ? error.message : undefined,
              variant: "error",
            });
          }
        }}
      />
    </div>
  );
}
