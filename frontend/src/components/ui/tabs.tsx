import { cn } from "../../lib/cn";

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ key: T; label: string; count?: number }>;
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1 border-b border-slate-200">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
            active === tab.key
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700",
          )}
        >
          {tab.label}
          {tab.count !== undefined ? (
            <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
              {tab.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
