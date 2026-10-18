import "dotenv/config";
import { z } from "zod";

const blankAsUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), schema);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  APP_URL: z.string().url().default("http://localhost:5173"),
  API_URL: z.string().url().default("http://localhost:4000"),
  PUBLIC_WEBHOOK_URL: blankAsUndefined(z.string().optional()),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  SESSION_IDLE_HOURS: z.coerce.number().int().min(1).max(8760).default(72),
  ENCRYPTION_KEY: blankAsUndefined(z.string().min(32).optional()),
  STRIPE_SECRET_KEY: blankAsUndefined(z.string().optional()),
  STRIPE_WEBHOOK_SECRET: blankAsUndefined(z.string().optional()),
  STRIPE_STUB: blankAsUndefined(z.string().optional()),
  GREEN_ID: blankAsUndefined(z.string().optional()),
  GREEN_TOKEN: blankAsUndefined(z.string().optional()),
  GOOGLE_CLIENT_ID: blankAsUndefined(z.string().optional()),
  GOOGLE_CLIENT_SECRET: blankAsUndefined(z.string().optional()),
  GOOGLE_REDIRECT_URI: blankAsUndefined(z.string().url().optional()),
  RESEND_API_KEY: blankAsUndefined(z.string().optional()),
  RESEND_FROM_EMAIL: blankAsUndefined(z.string().optional()),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === "production";
export const stripeStubEnabled =
  env.NODE_ENV !== "production" && (env.STRIPE_STUB === "1" || env.STRIPE_STUB === "true");
export const sessionIdleMs = env.SESSION_IDLE_HOURS * 60 * 60 * 1000;
