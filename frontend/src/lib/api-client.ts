import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  apiErrorSchema,
  type ErrorCode,
} from "@leadflow/shared";
import { env } from "./env";

export class ApiClientError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ErrorCode, status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

export function hasErrorCode(error: unknown, code: ErrorCode): boolean {
  return isApiClientError(error) && error.code === code;
}

export type QueryValue = string | number | boolean | null | undefined | Array<string | number>;

export type ApiRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
};

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${env.apiUrl}${normalizedPath}`, window.location.origin);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
    } else {
      url.searchParams.append(key, String(value));
    }
  }

  return url.toString();
}

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  const entry = document.cookie.split("; ").find((cookie) => cookie.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : null;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return apiRequestUrl<T>(`${env.apiUrl}${normalizedPath}`, options);
}

export async function apiRequestUrl<T>(
  url: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { method = "GET", body, query } = options;
  const resolved = new URL(url, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) resolved.searchParams.append(key, String(item));
    } else {
      resolved.searchParams.append(key, String(value));
    }
  }

  const headers: Record<string, string> = { Accept: "application/json" };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (method !== "GET") {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken) {
      headers[CSRF_HEADER_NAME] = csrfToken;
    }
  }

  const response = await fetch(resolved.toString(), {
    method,
    headers,
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: options.signal,
  });

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  const payload: unknown = response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiClientError(code, response.status, message, details);
    }
    throw new ApiClientError("internal", response.status, "Unexpected API error response", payload);
  }

  return payload as T;
}

export async function apiDownload(
  path: string,
  query?: Record<string, QueryValue>,
): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(buildUrl(path, query), {
    headers: { Accept: "text/csv, application/octet-stream" },
    credentials: "include",
  });

  if (!response.ok) {
    const payload: unknown = response.headers.get("content-type")?.includes("application/json")
      ? await response.json()
      : await response.text();
    const parsed = apiErrorSchema.safeParse(payload);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiClientError(code, response.status, message, details);
    }
    throw new ApiClientError("internal", response.status, "Download failed", payload);
  }

  const disposition = response.headers.get("content-disposition") ?? "";
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const blob = await response.blob();
  return { blob, filename: match?.[1] ?? "export.csv" };
}

export const api = {
  get: <T>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "DELETE" }),
};
