import { cn } from "../../lib/cn";
import { formatCountdown } from "../../lib/format";

export function Countdown({
  to,
  now,
  className,
}: {
  to: string;
  now: number;
  className?: string;
}) {
  const deadline = new Date(to).getTime();
  const remaining = deadline - now;
  const overdue = remaining <= 0;
  const seconds = remaining / 1000;

  const tone = overdue
    ? "text-red-600"
    : seconds < 60
      ? "text-red-600"
      : seconds < 180
        ? "text-amber-600"
        : "text-emerald-600";

  return (
    <span
      className={cn("font-mono text-sm font-semibold tabular-nums", tone, className)}
      title={overdue ? "Acknowledgement overdue" : "Time left to acknowledge"}
    >
      {overdue ? "Overdue " : ""}
      {formatCountdown(remaining)}
    </span>
  );
}
