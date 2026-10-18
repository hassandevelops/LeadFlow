import { API_ERROR_STATUS } from "@leadflow/shared";
import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";

function tooManyRequests(req: Request, res: Response): void {
  res.status(API_ERROR_STATUS.too_many_requests).json({
    error: {
      code: "too_many_requests",
      message: "Too many attempts, please try again later",
    },
  });
}

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyRequests,
});

export const signupRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyRequests,
});

export const publicFormRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooManyRequests,
});
