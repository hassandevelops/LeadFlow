import { ApiError } from "./errors";

export type SortDirection = "asc" | "desc";

export function parseSort(
  sort: string | undefined,
  allowedFields: readonly string[],
  fallbackField: string,
): Record<string, SortDirection> {
  if (!sort) {
    return { [fallbackField]: "asc" };
  }

  const [field, direction] = sort.split(":");
  if (!field || !allowedFields.includes(field)) {
    throw ApiError.validationFailed("Invalid sort field", { allowed: allowedFields });
  }

  return { [field]: direction === "desc" ? "desc" : "asc" };
}
