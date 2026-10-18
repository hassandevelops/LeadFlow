import { hasPermission, type Permission } from "@leadflow/shared";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { userPermissions } from "../lib/serialize";
import type { AuthContext } from "../types/auth";

export async function loadAuthContext(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const userId = req.session.userId;
  if (!userId) {
    next();
    return;
  }

  const record = await prisma.user.findUnique({
    where: { id: userId },
    include: { workspace: true },
  });

  if (!record) {
    next();
    return;
  }

  const { workspace, ...user } = record;
  req.auth = {
    user,
    workspace,
    workspaceId: workspace.id,
    role: user.role,
    permissions: userPermissions(user),
  };

  next();
}

export function authOf(req: Request): AuthContext {
  if (!req.auth) {
    throw ApiError.unauthorized();
  }
  return req.auth;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) {
    throw ApiError.unauthorized();
  }
  next();
}

export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      throw ApiError.unauthorized();
    }
    if (!hasPermission(req.auth.permissions, permission)) {
      throw ApiError.forbidden(`Missing permission: ${permission}`, { permission });
    }
    next();
  };
}

export function requireAnyPermission(permissions: readonly Permission[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      throw ApiError.unauthorized();
    }
    if (!permissions.some((permission) => hasPermission(req.auth!.permissions, permission))) {
      throw ApiError.forbidden(`Missing permission: one of ${permissions.join(", ")}`, {
        permissions,
      });
    }
    next();
  };
}
