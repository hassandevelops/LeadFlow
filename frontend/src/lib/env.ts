import { API_PREFIX, WS_PATH } from "@leadflow/shared";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export const env = {
  apiUrl: trimTrailingSlash(import.meta.env.VITE_API_URL ?? API_PREFIX),
  wsUrl: trimTrailingSlash(import.meta.env.VITE_WS_URL ?? window.location.origin),
  wsPath: WS_PATH,
  enableMocks: import.meta.env.VITE_ENABLE_MOCKS === "true",
  googleIntegrationUrl: trimTrailingSlash(
    import.meta.env.VITE_GOOGLE_INTEGRATIONS_URL ?? "/api/integrations/google",
  ),
} as const;
