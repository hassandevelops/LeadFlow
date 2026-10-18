import { authKeys, userKeys } from "../lib/query-keys";
import { api } from "../lib/api-client";
import { useApiMutation, useApiQuery } from "./helpers";
import type {
  Availability,
  InviteUserInput,
  Page,
  PublicUser,
  SessionUser,
  UpdateEmployeeStatusInput,
  UpdateUserPermissionsInput,
  UpdateUserRoleInput,
} from "@leadflow/shared";
import { useQueryClient } from "@tanstack/react-query";

export type UserListQuery = { page: number; pageSize: number; q?: string };

export function useUsers(query: UserListQuery) {
  return useApiQuery<Page<PublicUser>>(userKeys.list(query), "/users", query);
}

export function useAvailability() {
  return useApiQuery<Availability[]>(userKeys.availability, "/availability", undefined, {
    staleTime: 15_000,
  });
}

export function useInviteUser() {
  return useApiMutation<InviteUserInput, PublicUser>(
    (input) => api.post<PublicUser>("/users/invite", input),
    { invalidate: [userKeys.list(), userKeys.availability] },
  );
}

export function useUpdateUserRole() {
  return useApiMutation<{ id: string; input: UpdateUserRoleInput }, PublicUser>(
    ({ id, input }) => api.patch<PublicUser>(`/users/${id}/role`, input),
    { invalidate: [userKeys.list(), userKeys.availability] },
  );
}

export function useUpdateUserPermissions() {
  return useApiMutation<{ id: string; input: UpdateUserPermissionsInput }, PublicUser>(
    ({ id, input }) => api.patch<PublicUser>(`/users/${id}/permissions`, input),
    { invalidate: [userKeys.list()] },
  );
}

export function useUpdateMyStatus() {
  const queryClient = useQueryClient();
  return useApiMutation<UpdateEmployeeStatusInput, PublicUser>(
    (input) => api.patch<PublicUser>("/users/me/status", input),
    {
      invalidate: [userKeys.availability],
      onSuccess: (data) => {
        queryClient.setQueryData<SessionUser | null>(authKeys.me, (previous) =>
          previous ? { ...previous, employeeStatus: data.employeeStatus } : previous,
        );
      },
    },
  );
}
