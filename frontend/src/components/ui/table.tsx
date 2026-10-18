import type { HTMLAttributes, ReactNode, ThHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function TH({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      {...rest}
      className={cn(
        "border-b border-slate-200 px-4 py-2.5 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase",
        className,
      )}
    />
  );
}

export function TD({ className, ...rest }: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      {...rest}
      className={cn("border-b border-slate-100 px-4 py-3 align-middle text-slate-700", className)}
    />
  );
}

export function TR({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr {...rest} className={cn("hover:bg-slate-50", className)} />;
}
