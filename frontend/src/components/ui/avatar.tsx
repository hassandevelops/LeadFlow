import { initials } from "../../lib/format";
import { cn } from "../../lib/cn";

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
