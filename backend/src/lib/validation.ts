import { idSchema } from "@leadflow/shared";
import type { Request } from "express";
import type { ZodTypeAny, z } from "zod";
import { ApiError } from "./errors";

export function parseBody<T extends ZodTypeAny>(schema: T, req: Request): z.infer<T> {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    throw ApiError.validationFailed("Request body is invalid", result.error.issues);
  }
  return result.data;
}

export function parseQuery<T extends ZodTypeAny>(schema: T, req: Request): z.infer<T> {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    throw ApiError.validationFailed("Query parameters are invalid", result.error.issues);
  }
  return result.data;
}

export function parseIdParam(req: Request, name = "id"): string {
  const result = idSchema.safeParse(req.params[name]);
  if (!result.success) {
    throw ApiError.notFound("Resource not found");
  }
  return result.data;
}
