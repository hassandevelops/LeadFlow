import type { CustomFieldDefinition as CustomFieldRow, CustomFieldType, Opportunity } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/errors";

export type CustomFieldValue = string | number | boolean | null;

export interface FieldError {
  path: string;
  message: string;
}

export async function definitionsFor(
  workspaceId: string,
  entity: "contact" | "opportunity",
  pipelineId?: string | null,
): Promise<CustomFieldRow[]> {
  const rows = await prisma.customFieldDefinition.findMany({
    where: {
      workspaceId,
      entity,
      ...(entity === "opportunity" && pipelineId
        ? { OR: [{ pipelineId: null }, { pipelineId }] }
        : { pipelineId: null }),
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return rows;
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function validateValue(type: CustomFieldType, options: string[], value: unknown): CustomFieldValue | FieldError {
  switch (type) {
    case "text": {
      if (typeof value !== "string") {
        return { path: "", message: "Expected a text value" };
      }
      const trimmed = value.trim();
      if (trimmed.length > 2000) {
        return { path: "", message: "Text value is too long (max 2000 characters)" };
      }
      return trimmed;
    }
    case "number": {
      const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
      if (!Number.isFinite(parsed)) {
        return { path: "", message: "Expected a number" };
      }
      return parsed;
    }
    case "date": {
      if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
        return { path: "", message: "Expected an ISO date" };
      }
      return value;
    }
    case "dropdown": {
      if (typeof value !== "string" || !options.includes(value)) {
        return { path: "", message: `Expected one of: ${options.join(", ")}` };
      }
      return value;
    }
    case "checkbox": {
      if (typeof value === "boolean") {
        return value;
      }
      if (value === "true" || value === "false") {
        return value === "true";
      }
      return { path: "", message: "Expected true or false" };
    }
    default:
      return { path: "", message: "Unsupported field type" };
  }
}

export function validateCustomFieldValues(
  definitions: CustomFieldRow[],
  raw: Record<string, unknown>,
  options: { partial: boolean },
): Record<string, unknown> {
  const errors: FieldError[] = [];
  const result: Record<string, unknown> = {};

  for (const definition of definitions) {
    const hasKey = Object.prototype.hasOwnProperty.call(raw, definition.key);
    const value = hasKey ? raw[definition.key] : undefined;

    if (!hasKey) {
      if (!options.partial && definition.required) {
        errors.push({ path: `customFields.${definition.key}`, message: "This field is required" });
      }
      continue;
    }

    if (isEmpty(value)) {
      if (!options.partial && definition.required) {
        errors.push({ path: `customFields.${definition.key}`, message: "This field is required" });
      }
      continue;
    }

    const validated = validateValue(
      definition.type,
      (definition.options as string[]) ?? [],
      value,
    );

    if (validated !== null && typeof validated === "object") {
      errors.push({ path: `customFields.${definition.key}`, message: validated.message });
      continue;
    }

    result[definition.key] = validated;
  }

  if (errors.length > 0) {
    throw ApiError.validationFailed("Custom field values are invalid", errors);
  }

  return result;
}

export function mergeCustomFieldValues(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  return { ...current, ...next };
}

const STANDARD_FIELD_GETTERS: Record<string, (opportunity: Opportunity) => unknown> = {
  title: (o) => o.title,
  contactId: (o) => o.contactId,
  companyId: (o) => o.companyId,
  value: (o) => o.value,
  currency: (o) => o.currency,
  ownerId: (o) => o.ownerId,
  source: (o) => o.source,
  tags: (o) => o.tags,
};

export function missingRequiredKeys(
  opportunity: Opportunity,
  customFields: Record<string, unknown>,
  requiredKeys: string[],
): string[] {
  return requiredKeys.filter((key) => {
    const getter = STANDARD_FIELD_GETTERS[key];
    if (getter) {
      const value = getter(opportunity);
      if (Array.isArray(value)) {
        return value.length === 0;
      }
      return isEmpty(value);
    }
    return isEmpty(customFields[key]);
  });
}
