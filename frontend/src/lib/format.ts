const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
const timeFormatter = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short" });

export function formatDate(value: string | Date): string {
  return dateFormatter.format(typeof value === "string" ? new Date(value) : value);
}

export function formatDateTime(value: string | Date): string {
  return dateTimeFormatter.format(typeof value === "string" ? new Date(value) : value);
}

export function formatTime(value: string | Date): string {
  return timeFormatter.format(typeof value === "string" ? new Date(value) : value);
}

export function formatWeekday(value: string | Date): string {
  return weekdayFormatter.format(typeof value === "string" ? new Date(value) : value);
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${Math.round(seconds % 60)}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function formatCountdown(remainingMs: number): string {
  const abs = Math.abs(remainingMs);
  const seconds = Math.floor(abs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export function timeAgo(value: string | Date, now = Date.now()): string {
  const time = typeof value === "string" ? new Date(value).getTime() : value.getTime();
  const diffSeconds = Math.round((now - time) / 1000);
  if (diffSeconds < 45) return "just now";
  const minutes = Math.round(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(new Date(time));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join("") || "?";
}

export function humanize(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function toDateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toDateTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${toDateInputValue(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function startOfWeek(date: Date): Date {
  const copy = startOfDay(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(copy, diff);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
