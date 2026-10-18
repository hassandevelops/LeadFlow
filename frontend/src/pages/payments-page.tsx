import { useState } from "react";
import { Link } from "react-router";
import { PAYMENT_REQUEST_STATUSES, type PaymentRequestStatus } from "@leadflow/shared";
import { useContacts } from "../api/crm";
import { usePaymentRequests, usePayments } from "../api/payments";
import { StatusBadge } from "../components/ui/badge";
import { Card, CardHeader, PageHeader } from "../components/ui/card";
import { Select } from "../components/ui/field";
import { Pagination } from "../components/ui/pagination";
import { EmptyState, ErrorBlock, LoadingBlock } from "../components/ui/states";
import { TD, TH, TR, TableWrap } from "../components/ui/table";
import { formatDateTime, formatMoney, humanize } from "../lib/format";

type Tab = "requests" | "payments";

export function PaymentsPage() {
  const [tab, setTab] = useState<Tab>("requests");
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [status, setStatus] = useState("");
  const requestsQuery = usePaymentRequests(page, pageSize);
  const paymentsQuery = usePayments(page, pageSize);
  const contactsQuery = useContacts({ page: 1, pageSize: 100 });

  const contactsById = new Map(
    (contactsQuery.data?.data ?? []).map((contact) => [contact.id, contact]),
  );

  function switchTab(next: Tab) {
    setTab(next);
    setPage(1);
    setStatus("");
  }

  const requestRows = (requestsQuery.data?.data ?? []).filter((request) =>
    status === "" ? true : request.status === status,
  );
  const paymentRows = (paymentsQuery.data?.data ?? []).filter((payment) =>
    status === "" ? true : payment.status === status,
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Payments"
        description="Checkout links, payment status and revenue."
      />

      <Card>
        <CardHeader
          title="Transactions"
          actions={
            <Select
              className="w-40"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {(tab === "requests" ? PAYMENT_REQUEST_STATUSES : ["succeeded", "refunded", "partially_refunded"]).map(
                (option) => (
                  <option key={option} value={option}>
                    {humanize(option)}
                  </option>
                ),
              )}
            </Select>
          }
        />
        <div className="flex gap-1 border-b border-slate-200 px-5 pt-2">
          {(
            [
              { key: "requests", label: "Payment requests" },
              { key: "payments", label: "Payments" },
            ] as Array<{ key: Tab; label: string }>
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => switchTab(item.key)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                tab === item.key
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "requests" ? (
          <>
            {requestsQuery.isPending ? <LoadingBlock /> : null}
            {requestsQuery.isError ? (
              <ErrorBlock
                error={requestsQuery.error}
                onRetry={() => void requestsQuery.refetch()}
              />
            ) : null}
            {requestsQuery.data && requestRows.length === 0 ? (
              <EmptyState
                title="No payment requests"
                description="Request a payment from an opportunity to see it here."
              />
            ) : null}
            {requestsQuery.data && requestRows.length > 0 ? (
              <>
                <TableWrap>
                  <thead>
                    <tr>
                      <TH>Contact</TH>
                      <TH>Amount</TH>
                      <TH>Status</TH>
                      <TH>Checkout link</TH>
                      <TH>Created</TH>
                      <TH>Updated</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {requestRows.map((request) => (
                      <TR key={request.id}>
                        <TD>
                          <Link
                            to={`/contacts/${request.contactId}`}
                            className="font-medium text-slate-900 underline-offset-2 hover:underline"
                          >
                            {contactsById.get(request.contactId)?.name ?? "Unknown contact"}
                          </Link>
                        </TD>
                        <TD className="font-medium">
                          {formatMoney(request.amount, request.currency)}
                        </TD>
                        <TD>
                          <StatusBadge status={request.status} />
                        </TD>
                        <TD>
                          {request.checkoutUrl ? (
                            <a
                              href={request.checkoutUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block max-w-56 truncate text-xs text-blue-600 hover:underline"
                            >
                              {request.checkoutUrl}
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </TD>
                        <TD className="text-xs text-slate-500">
                          {formatDateTime(request.createdAt)}
                        </TD>
                        <TD className="text-xs text-slate-500">
                          {formatDateTime(request.updatedAt)}
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </TableWrap>
                <Pagination
                  page={page}
                  pageSize={pageSize}
                  total={requestsQuery.data.total}
                  onPageChange={setPage}
                />
              </>
            ) : null}
          </>
        ) : (
          <>
            {paymentsQuery.isPending ? <LoadingBlock /> : null}
            {paymentsQuery.isError ? (
              <ErrorBlock error={paymentsQuery.error} onRetry={() => void paymentsQuery.refetch()} />
            ) : null}
            {paymentsQuery.data && paymentRows.length === 0 ? (
              <EmptyState
                title="No payments yet"
                description="Completed checkouts appear here."
              />
            ) : null}
            {paymentsQuery.data && paymentRows.length > 0 ? (
              <>
                <TableWrap>
                  <thead>
                    <tr>
                      <TH>Reference</TH>
                      <TH>Amount</TH>
                      <TH>Status</TH>
                      <TH>Refunded</TH>
                      <TH>Paid at</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentRows.map((payment) => (
                      <TR key={payment.id}>
                        <TD>
                          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                            {payment.providerRef}
                          </code>
                        </TD>
                        <TD className="font-medium">
                          {formatMoney(payment.amount, payment.currency)}
                        </TD>
                        <TD>
                          <StatusBadge status={payment.status} />
                        </TD>
                        <TD>
                          {payment.refundedAmount > 0
                            ? formatMoney(payment.refundedAmount, payment.currency)
                            : "—"}
                        </TD>
                        <TD className="text-xs text-slate-500">
                          {payment.paidAt ? formatDateTime(payment.paidAt) : "—"}
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </TableWrap>
                <Pagination
                  page={page}
                  pageSize={pageSize}
                  total={paymentsQuery.data.total}
                  onPageChange={setPage}
                />
              </>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}
