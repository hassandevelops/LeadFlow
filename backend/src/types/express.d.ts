import type { AuthContext } from "./auth";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

export {};
