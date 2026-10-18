import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { api, type QueryValue } from "../lib/api-client";

export function useApiQuery<T>(
  queryKey: QueryKey,
  path: string,
  query?: Record<string, QueryValue>,
  options?: { enabled?: boolean; refetchInterval?: number | false; staleTime?: number },
) {
  return useQuery<T, Error>({
    queryKey,
    queryFn: ({ signal }) => api.get<T>(path, { query, signal }),
    ...(options?.enabled === undefined ? {} : { enabled: options.enabled }),
    ...(options?.refetchInterval === undefined ? {} : { refetchInterval: options.refetchInterval }),
    ...(options?.staleTime === undefined ? {} : { staleTime: options.staleTime }),
  });
}

export function useApiMutation<TInput, TOutput>(
  mutationFn: (input: TInput) => Promise<TOutput>,
  options?: {
    invalidate?: QueryKey[];
    onSuccess?: (data: TOutput, input: TInput) => void;
  },
) {
  const queryClient = useQueryClient();
  return useMutation<TOutput, Error, TInput>({
    mutationFn,
    onSuccess: (data, input) => {
      for (const key of options?.invalidate ?? []) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      options?.onSuccess?.(data, input);
    },
  });
}
