import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LoginInput, SessionUser, SignupInput } from "@leadflow/shared";
import { api, hasErrorCode } from "../lib/api-client";
import { env } from "../lib/env";
import { authKeys } from "../lib/query-keys";
import { connectSocket, disconnectSocket } from "../lib/socket";
import { AuthContext, type AuthContextValue } from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: authKeys.me,
    queryFn: async (): Promise<SessionUser | null> => {
      try {
        return await api.get<SessionUser>("/auth/me");
      } catch (error) {
        if (hasErrorCode(error, "unauthorized")) return null;
        throw error;
      }
    },
    retry: false,
  });

  const { mutateAsync: performLogin } = useMutation({
    mutationFn: (input: LoginInput) => api.post<SessionUser>("/auth/login", input),
  });

  const { mutateAsync: performSignup } = useMutation({
    mutationFn: (input: SignupInput) => api.post<SessionUser>("/auth/signup", input),
  });

  const { mutateAsync: performLogout } = useMutation({
    mutationFn: () => api.post<void>("/auth/logout"),
  });

  const login = useCallback(
    async (input: LoginInput) => {
      const user = await performLogin(input);
      queryClient.setQueryData(authKeys.me, user);
    },
    [performLogin, queryClient],
  );

  const signup = useCallback(
    async (input: SignupInput) => {
      const user = await performSignup(input);
      queryClient.setQueryData(authKeys.me, user);
    },
    [performSignup, queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await performLogout();
    } finally {
      disconnectSocket();
      queryClient.clear();
      queryClient.setQueryData(authKeys.me, null);
    }
  }, [performLogout, queryClient]);

  const user = sessionQuery.data ?? null;
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId || env.enableMocks) {
      disconnectSocket();
      return;
    }
    connectSocket();
    return () => disconnectSocket();
  }, [userId]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading: sessionQuery.isPending, login, signup, logout }),
    [user, sessionQuery.isPending, login, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
