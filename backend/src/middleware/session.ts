import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, SESSION_COOKIE_NAME } from "@leadflow/shared";
import { RedisStore } from "connect-redis";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import session from "express-session";
import { timingSafeEqual } from "node:crypto";
import { env, isProduction, sessionIdleMs } from "../config/env";
import { ApiError } from "../lib/errors";
import { redis } from "../lib/redis";
import { randomToken } from "../lib/strings";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_EXEMPT_PREFIXES = ["/public/"];

export function createSessionMiddleware(): RequestHandler {
  const store = new RedisStore({ client: redis, prefix: "lf:sess:" });
  return session({
    name: SESSION_COOKIE_NAME,
    secret: env.SESSION_SECRET,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      path: "/",
      maxAge: sessionIdleMs,
    },
  });
}

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  const csrfCookie = req.cookies?.[CSRF_COOKIE_NAME] as string | undefined;

  if (!csrfCookie) {
    res.cookie(CSRF_COOKIE_NAME, randomToken(), {
      httpOnly: false,
      sameSite: "lax",
      secure: isProduction,
      path: "/",
      maxAge: sessionIdleMs,
    });
    next();
    return;
  }

  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  if (CSRF_EXEMPT_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
    next();
    return;
  }

  const header = req.get(CSRF_HEADER_NAME);
  if (!header || !safeEqual(header, csrfCookie)) {
    throw ApiError.forbidden("Missing or invalid CSRF token", { reason: "csrf_token_invalid" });
  }

  next();
}

export function startSession(req: Request, userId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((regenerateError) => {
      if (regenerateError) {
        reject(regenerateError);
        return;
      }
      req.session.userId = userId;
      req.session.save((saveError) => {
        if (saveError) {
          reject(saveError);
          return;
        }
        resolve();
      });
    });
  });
}

export function endSession(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) {
        reject(error);
        return;
      }
      res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
      resolve();
    });
  });
}
