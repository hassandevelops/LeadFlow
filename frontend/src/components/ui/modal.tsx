import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const sizes = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  } as const;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-label={title}
      className={cn(
        "m-auto max-h-[calc(100vh-4rem)] w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40",
        sizes[size],
      )}
    >
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
      </div>
      <div className="px-5 py-4">{children}</div>
      {footer ? (
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">{footer}</div>
      ) : null}
    </dialog>
  );
}
