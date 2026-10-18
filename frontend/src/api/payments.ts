import { api } from "../lib/api-client";
import { paymentKeys } from "../lib/query-keys";
import { useApiMutation, useApiQuery } from "./helpers";
import type {
  CreatePaymentRequestInput,
  Page,
  Payment,
  PaymentRequest,
} from "@leadflow/shared";

export function usePaymentRequests(page: number, pageSize = 25) {
  const query = { page, pageSize };
  return useApiQuery<Page<PaymentRequest>>(paymentKeys.requests(query), "/payment-requests", query, {
    refetchInterval: 20_000,
  });
}

export function usePayments(page: number, pageSize = 25) {
  const query = { page, pageSize };
  return useApiQuery<Page<Payment>>(paymentKeys.payments(query), "/payments", query, {
    refetchInterval: 20_000,
  });
}

export function useCreatePaymentRequest(opportunityId: string) {
  return useApiMutation<CreatePaymentRequestInput, PaymentRequest>(
    (input) => api.post<PaymentRequest>(`/opportunities/${opportunityId}/payment-requests`, input),
    { invalidate: [["payment-requests"], ["payments"], ["opportunities"], ["contacts"], ["dashboard"]] },
  );
}
