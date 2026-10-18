import { z } from "zod";

export const API_PREFIX = "/api/v1";
export const WEBHOOK_PREFIX = "/api/webhooks";
export const WS_PATH = "/ws";

export const SESSION_COOKIE_NAME = "lf_session";
export const CSRF_COOKIE_NAME = "lf_csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";

export const ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "validation_failed",
  "conflict",
  "too_many_requests",
  "provider_error",
  "internal",
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const API_ERROR_STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation_failed: 400,
  conflict: 409,
  too_many_requests: 429,
  provider_error: 502,
  internal: 500,
};

export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export function isApiError(value: unknown): value is ApiError {
  return apiErrorSchema.safeParse(value).success;
}

export type Page<T> = {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
};

export function pageSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
  });
}

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.string().trim().max(120).optional(),
  q: z.string().trim().max(200).optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
