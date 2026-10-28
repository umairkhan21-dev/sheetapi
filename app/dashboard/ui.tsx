import type { ReactNode } from "react";

export const fieldClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20 disabled:cursor-not-allowed disabled:opacity-60";

export const labelClass = "block text-sm font-medium text-slate-900";

export const primaryButtonClass =
  "inline-flex items-center justify-center rounded-full bg-gradient-to-r from-green-500 to-green-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_15px_-3px_rgb(22_163_74/0.25),0_4px_6px_-4px_rgb(22_163_74/0.25)] hover:from-green-600 hover:to-green-700 disabled:cursor-not-allowed disabled:opacity-60";

export const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60";

export const dangerButtonClass =
  "inline-flex items-center justify-center rounded-lg bg-red-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60";

export const apiListColumnsClass =
  "md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(9.5rem,0.95fr)_minmax(0,0.9fr)_8rem_minmax(10rem,auto)]";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-medium tracking-tight text-slate-900">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function StatusBadge({
  tone,
  children,
}: {
  tone: "success" | "neutral";
  children: ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "bg-green-50 text-green-800 ring-green-600/15"
      : "bg-slate-100 text-slate-700 ring-slate-500/15";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${toneClass}`}
    >
      {children}
    </span>
  );
}

export function Notice({
  tone,
  children,
}: {
  tone: "error" | "success" | "info";
  children: ReactNode;
}) {
  const toneClass = {
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-green-200 bg-green-50 text-green-900",
    info: "border-slate-200 bg-white text-slate-700",
  }[tone];

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg border px-3 py-2 text-sm ${toneClass}`}
    >
      {children}
    </div>
  );
}

export function formatTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const time = Date.parse(value);

  if (!Number.isFinite(time)) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(time);
}
