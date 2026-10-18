import { api } from "../lib/api-client";
import { appointmentKeys } from "../lib/query-keys";
import { useApiMutation, useApiQuery } from "./helpers";
import type {
  Appointment,
  BusySlot,
  CreateAppointmentInput,
  Page,
  UpdateAppointmentInput,
} from "@leadflow/shared";

export type AppointmentListQuery = {
  page: number;
  pageSize: number;
  userId?: string;
  from?: string;
  to?: string;
};

export function useAppointments(query: AppointmentListQuery) {
  return useApiQuery<Page<Appointment>>(appointmentKeys.list(query), "/appointments", query, {
    refetchInterval: 30_000,
  });
}

export function useBusySlots(userId: string | undefined, from: string, to: string, enabled: boolean) {
  const query = { from, to };
  return useApiQuery<BusySlot[]>(
    appointmentKeys.busy(userId ?? "none", from, to),
    `/users/${userId}/busy`,
    query,
    { enabled: Boolean(userId) && enabled },
  );
}

export function useCreateAppointment() {
  return useApiMutation<CreateAppointmentInput, Appointment>(
    (input) => api.post<Appointment>("/appointments", input),
    { invalidate: [["appointments"], ["contacts"], ["dashboard"]] },
  );
}

export function useUpdateAppointment() {
  return useApiMutation<{ id: string; input: UpdateAppointmentInput }, Appointment>(
    ({ id, input }) => api.patch<Appointment>(`/appointments/${id}`, input),
    { invalidate: [["appointments"], ["contacts"]] },
  );
}

export function useDeleteAppointment() {
  return useApiMutation<string, void>((id) => api.delete<void>(`/appointments/${id}`), {
    invalidate: [["appointments"], ["contacts"]],
  });
}
