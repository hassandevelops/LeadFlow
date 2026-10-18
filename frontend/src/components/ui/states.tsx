import type { ReactNode } from "react";
import { isApiClientError } from "../../lib/api-client";
import { Button } from "./button";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800 ${className ?? ""}`}
    />
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
      <Spinner />
      {label}
    </div>
  );
}

export function ErrorBlock({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const message = isApiClientError(error)
    ? error.message
    : error instanceof Error
      ? error.message
      : "Something went wrong";
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
      <p className="text-sm font-medium text-red-700">{message}</p>
      {isApiClientError(error) && error.code === "too_many_requests" ? (
        <p className="text-xs text-slate-500">You are sending requests too quickly. Try again shortly.</p>
      ) : null}
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description ? <p className="max-w-sm text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
