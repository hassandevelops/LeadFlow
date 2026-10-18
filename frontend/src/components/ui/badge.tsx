import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export type BadgeTone = "slate" | "green" | "amber" | "red" | "blue" | "violet";

const TONES: Record<BadgeTone, string> = {
  slate: "bg-slate-100 text-slate-700",
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700",
  blue: "bg-blue-100 text-blue-800",
  violet: "bg-violet-100 text-violet-800",
};

export function Badge({
  tone = "slate",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const STATUS_TONES: Record<string, BadgeTone> = {
  available: "green",
  busy: "amber",
  on_leave: "violet",
  offline: "slate",
  queued: "slate",
  sent: "blue",
  delivered: "green",
  failed: "red",
  received: "violet",
  pending: "amber",
  paid: "green",
  expired: "slate",
  abandoned: "slate",
  succeeded: "green",
  refunded: "violet",
  partially_refunded: "amber",
  scheduled: "blue",
  cancelled: "slate",
  synced: "green",
  needs_reconnect: "red",
  not_connected: "slate",
  connected: "green",
  error: "red",
  success: "green",
  failure: "red",
  rejected: "amber",
  unacknowledged: "red",
  escalated_twice: "red",
  idle: "amber",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? "slate"}>{status.replaceAll("_", " ")}</Badge>;
}
