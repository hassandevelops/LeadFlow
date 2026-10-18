import { API_PREFIX } from "@leadflow/shared";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express, type RequestHandler } from "express";
import helmet from "helmet";
import { env, isProduction } from "./config/env";
import { errorHandler, notFoundHandler } from "./lib/errors";
import { loadAuthContext } from "./middleware/auth";
import { csrfProtection } from "./middleware/session";
import { apiRouter } from "./routes";
import { googleRouter } from "./routes/integrations/google";
import { stripeWebhooksRouter } from "./routes/webhooks/stripe";
import { twilioWebhooksRouter } from "./routes/webhooks/twilio";

export function createApp(sessionMiddleware: RequestHandler): Express {
  const app = express();

  app.disable("x-powered-by");
  if (isProduction) {
    app.set("trust proxy", 1);
  }

  app.use(helmet());
  app.use(cors({ origin: env.APP_URL, credentials: true }));
  app.use("/api", express.urlencoded({ extended: false }), twilioWebhooksRouter);
  app.use(
    "/api/webhooks/stripe",
    express.raw({ type: "application/json" }),
    stripeWebhooksRouter,
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(sessionMiddleware);
  app.use(loadAuthContext);

  app.use("/api/integrations/google", googleRouter);
  app.use(API_PREFIX, csrfProtection, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
