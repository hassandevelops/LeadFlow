import { useState } from "react";
import { LEAD_SOURCES, type LeadSource, type Opportunity } from "@leadflow/shared";
import { useCreateLead } from "../api/leads";
import { usePipelines } from "../api/pipeline";
import { Button } from "./ui/button";
import { Field, Select, TextArea, TextInput } from "./ui/field";
import { Modal } from "./ui/modal";
import { humanize } from "../lib/format";

export function NewLeadModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (opportunity: Opportunity) => void;
}) {
  const createLead = useCreateLead();
  const pipelines = usePipelines();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    title: "",
    value: "",
    source: "manual" as LeadSource,
    pipelineId: "",
    note: "",
  });
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setForm({
      name: "",
      email: "",
      phone: "",
      title: "",
      value: "",
      source: "manual",
      pipelineId: "",
      note: "",
    });
    setError(null);
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    if (!form.email.trim() && !form.phone.trim()) {
      setError("Add at least an email or a phone number");
      return;
    }
    try {
      const opportunity = await createLead.mutateAsync({
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        title: form.title.trim() || undefined,
        value: form.value === "" ? undefined : Number(form.value),
        source: form.source,
        pipelineId: form.pipelineId || undefined,
        note: form.note.trim() || undefined,
      });
      reset();
      onClose();
      onCreated?.(opportunity);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create lead");
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="New lead"
      description="Leads are assigned round-robin and need acknowledgement."
      size="lg"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} isLoading={createLead.isPending}>
            Create lead
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact name" required>
          <TextInput
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            autoFocus
          />
        </Field>
        <Field label="Deal title" hint="Defaults to a generic title when left empty.">
          <TextInput
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </Field>
        <Field label="Email">
          <TextInput
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </Field>
        <Field label="Phone">
          <TextInput
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
        </Field>
        <Field label="Value">
          <TextInput
            type="number"
            min={0}
            value={form.value}
            onChange={(event) => setForm({ ...form, value: event.target.value })}
            placeholder="0"
          />
        </Field>
        <Field label="Source">
          <Select
            value={form.source}
            onChange={(event) => setForm({ ...form, source: event.target.value as LeadSource })}
          >
            {LEAD_SOURCES.map((source) => (
              <option key={source} value={source}>
                {humanize(source)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Pipeline" className="sm:col-span-2">
          <Select
            value={form.pipelineId}
            onChange={(event) => setForm({ ...form, pipelineId: event.target.value })}
          >
            <option value="">Default pipeline</option>
            {(pipelines.data ?? []).map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note" className="sm:col-span-2">
          <TextArea
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
            placeholder="Context for the first follow-up…"
          />
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-red-600 sm:col-span-2">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
