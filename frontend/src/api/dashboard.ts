import { api } from "../lib/api-client";
import { dashboardKeys } from "../lib/query-keys";
import { useApiMutation, useApiQuery } from "./helpers";
import type {
  DashboardMetrics,
  DashboardQuery,
  DashboardWidgetPreferences,
} from "@leadflow/shared";

export function useDashboard(query: DashboardQuery, enabled = true) {
  return useApiQuery<DashboardMetrics>(dashboardKeys.metrics(query), "/dashboard", query, {
    enabled,
    refetchInterval: 25_000,
  });
}

export function useDashboardPreferences() {
  return useApiQuery<DashboardWidgetPreferences>(
    dashboardKeys.preferences,
    "/dashboard/preferences",
  );
}

export function useUpdateDashboardPreferences() {
  return useApiMutation<DashboardWidgetPreferences, DashboardWidgetPreferences>(
    (input) => api.patch<DashboardWidgetPreferences>("/dashboard/preferences", input),
    { invalidate: [dashboardKeys.preferences] },
  );
}
