import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "../../lib/cn";

const CONTROL_CLASS =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500";

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      <span className="mt-1 block">{children}</span>
      {hint && !error ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
      {error ? (
        <span role="alert" className="mt-1 block text-xs text-red-600">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cn(CONTROL_CLASS, className)} />;
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cn(CONTROL_CLASS, "min-h-20", className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cn(CONTROL_CLASS, className)}>
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn("flex items-center gap-2 text-sm text-slate-700", className)}>
      <input
        type="checkbox"
        {...rest}
        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
      />
      {label}
    </label>
  );
}
