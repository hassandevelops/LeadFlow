import { env } from "../lib/env";
import { api, apiRequestUrl } from "../lib/api-client";
import { integrationKeys } from "../lib/query-keys";
import { useApiMutation, useApiQuery } from "./helpers";
import type {
  ConnectResendInput,
  ConnectStripeInput,
  ConnectTwilioInput,
  IntegrationEvent,
  IntegrationProvider,
  IntegrationState,
  Page,
} from "@leadflow/shared";

export type ConnectPayload =
  | ({ provider: "twilio_whatsapp" } & ConnectTwilioInput)
  | ({ provider: "stripe" } & ConnectStripeInput)
  | ({ provider: "resend" } & ConnectResendInput);

export function useIntegrations() {
  return useApiQuery<IntegrationState[]>(integrationKeys.list, "/integrations", undefined, {
    refetchInterval: 30_000,
  });
}

export function useConnectIntegration() {
  return useApiMutation<ConnectPayload, IntegrationState>(
    ({ provider, ...input }) =>
      api.post<IntegrationState>(`/integrations/${provider}/connect`, input),
    { invalidate: [integrationKeys.list, ["appointments"]] },
  );
}

export function useDisconnectIntegration() {
  return useApiMutation<IntegrationProvider, void>(
    (provider) => api.delete<void>(`/integrations/${provider}`),
    { invalidate: [integrationKeys.list] },
  );
}

export function useIntegrationEvents(provider: string, page: number, pageSize = 15) {
  const query = { page, pageSize };
  return useApiQuery<Page<IntegrationEvent>>(
    integrationKeys.events(provider, page),
    `/integrations/${provider}/events`,
    query,
  );
}

export function useConnectGoogleCalendar() {
  return useApiMutation<void, IntegrationState | null>(
    async () => {
      if (env.enableMocks) {
        return apiRequestUrl<IntegrationState>(`${env.googleIntegrationUrl}/connect`);
      }
      window.location.assign(`${env.googleIntegrationUrl}/connect`);
      return null;
    },
    { invalidate: [integrationKeys.list, ["appointments"]] },
  );
}

export function useDisconnectGoogleCalendar() {
  return useApiMutation<void, void>(
    () => apiRequestUrl<void>(env.googleIntegrationUrl, { method: "DELETE" }),
    { invalidate: [integrationKeys.list] },
  );
}
