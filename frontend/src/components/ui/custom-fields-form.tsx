import type { CustomFieldDefinition } from "@leadflow/shared";
import { Field, Checkbox, Select, TextInput } from "./field";

export type CustomFieldValues = Record<string, unknown>;

export function CustomFieldsForm({
  definitions,
  value,
  onChange,
  errors,
}: {
  definitions: CustomFieldDefinition[];
  value: CustomFieldValues;
  onChange: (next: CustomFieldValues) => void;
  errors?: Record<string, string>;
}) {
  if (definitions.length === 0) {
    return <p className="text-sm text-slate-500">No custom fields defined.</p>;
  }

  function setValue(key: string, next: unknown) {
    onChange({ ...value, [key]: next });
  }

  return (
    <div className="space-y-4">
      {definitions.map((definition) => {
        const raw = value[definition.key];
        const error = errors?.[definition.key] ?? null;

        if (definition.type === "checkbox") {
          return (
            <div key={definition.id}>
              <Checkbox
                label={definition.label}
                checked={raw === true}
                onChange={(event) => setValue(definition.key, event.target.checked)}
              />
              {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
            </div>
          );
        }

        if (definition.type === "dropdown") {
          return (
            <Field key={definition.id} label={definition.label} required={definition.required} error={error}>
              <Select
                value={typeof raw === "string" ? raw : ""}
                onChange={(event) => setValue(definition.key, event.target.value || undefined)}
              >
                <option value="">Select…</option>
                {definition.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </Field>
          );
        }

        if (definition.type === "date") {
          return (
            <Field key={definition.id} label={definition.label} required={definition.required} error={error}>
              <TextInput
                type="date"
                value={typeof raw === "string" ? raw.slice(0, 10) : ""}
                onChange={(event) => setValue(definition.key, event.target.value || undefined)}
              />
            </Field>
          );
        }

        return (
          <Field key={definition.id} label={definition.label} required={definition.required} error={error}>
            <TextInput
              type={definition.type === "number" ? "number" : "text"}
              value={raw === undefined || raw === null ? "" : String(raw)}
              onChange={(event) => {
                const next = event.target.value;
                if (next === "") {
                  setValue(definition.key, undefined);
                } else if (definition.type === "number") {
                  setValue(definition.key, Number(next));
                } else {
                  setValue(definition.key, next);
                }
              }}
            />
          </Field>
        );
      })}
    </div>
  );
}
