import { Prisma } from "@prisma/client";
import { API_ERROR_STATUS, type ErrorCode } from "@leadflow/shared";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return API_ERROR_STATUS[this.code];
  }

  static unauthorized(message = "Authentication required", details?: unknown): ApiError {
    return new ApiError("unauthorized", message, details);
  }

  static forbidden(message = "You do not have permission to perform this action", details?: unknown): ApiError {
    return new ApiError("forbidden", message, details);
  }

  static notFound(message = "Resource not found", details?: unknown): ApiError {
    return new ApiError("not_found", message, details);
  }

  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError("conflict", message, details);
  }

  static validationFailed(message = "Request is invalid", details?: unknown): ApiError {
    return new ApiError("validation_failed", message, details);
  }

  static tooManyRequests(message = "Too many requests, try again later", details?: unknown): ApiError {
    return new ApiError("too_many_requests", message, details);
  }

  static providerError(message: string, details?: unknown): ApiError {
    return new ApiError("provider_error", message, details);
  }

  static internal(message = "Something went wrong", details?: unknown): ApiError {
    return new ApiError("internal", message, details);
  }
}

function isJsonParseError(error: unknown): error is SyntaxError & { status: number; body: unknown } {
  return (
    error instanceof SyntaxError &&
    "status" in error &&
    (error as { status?: number }).status === 400 &&
    "body" in error
  );
}

function fromPrismaError(error: Prisma.PrismaClientKnownRequestError): ApiError {
  switch (error.code) {
    case "P2002": {
      const target = Array.isArray(error.meta?.target) ? (error.meta?.target as string[]).join(", ") : undefined;
      return ApiError.conflict("A record with these values already exists", target ? { target } : undefined);
    }
    case "P2003":
      return ApiError.conflict("The change conflicts with related records", { relation: error.meta?.field_name });
    case "P2025":
      return ApiError.notFound("Resource not found");
    default:
      return ApiError.internal("Unexpected database error", { prismaCode: error.code });
  }
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    res.end();
    return;
  }

  let apiError: ApiError;

  if (error instanceof ApiError) {
    apiError = error;
  } else if (error instanceof ZodError) {
    apiError = ApiError.validationFailed("Request is invalid", error.issues);
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    apiError = fromPrismaError(error);
  } else if (error instanceof Prisma.PrismaClientValidationError) {
    apiError = ApiError.internal("Unexpected database error");
  } else if (isJsonParseError(error)) {
    apiError = ApiError.validationFailed("Request body is not valid JSON");
  } else {
    apiError = ApiError.internal();
  }

  if (apiError.status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, error);
  }

  res.status(apiError.status).json({
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details === undefined ? {} : { details: apiError.details }),
    },
  });
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`No route matches ${req.method} ${req.baseUrl}${req.path}`));
}
