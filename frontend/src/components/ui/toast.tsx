import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";

type ToastVariant = "info" | "success" | "error";

type ToastItem = {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  show: (toast: { title: string; description?: string; variant?: ToastVariant }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  info: "border-slate-300 bg-white",
  success: "border-emerald-300 bg-emerald-50",
  error: "border-red-300 bg-red-50",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback<ToastContextValue["show"]>(
    ({ title, description, variant = "info" }) => {
      const id = nextId++;
      setToasts((current) => [...current, { id, title, description, variant }]);
      window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto rounded-lg border px-4 py-3 shadow-lg",
              VARIANT_CLASSES[toast.variant],
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-slate-900">{toast.title}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className="text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>
            {toast.description ? (
              <p className="mt-0.5 text-xs text-slate-600">{toast.description}</p>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
