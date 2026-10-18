import { QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiClientError } from "./api-client";
import { authKeys } from "./query-keys";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiClientError && error.code === "unauthorized") {
        queryClient.setQueryData(authKeys.me, null);
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        if (error instanceof ApiClientError && error.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});
