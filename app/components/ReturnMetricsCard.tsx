import type { TwrResult } from "@/lib/model/types";

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function annualize(twr: number, days: number): number {
  if (days <= 0) return twr;
  return Math.pow(1 + twr, 365 / days) - 1;
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(to) - Date.parse(from)) / 86_400_000,
  );
}

export function ReturnMetricsCard({ twr }: { twr: TwrResult }) {
  if (twr.twr === null || !twr.effectiveStart || !twr.effectiveEnd) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200 mb-1">
          Return
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          TWR cannot be computed for the current window — see warnings above.
        </p>
      </div>
    );
  }

  const days = daysBetween(twr.effectiveStart.date, twr.effectiveEnd.date);
  const ann = annualize(twr.twr, days);
  const pos = twr.twr >= 0;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200 mb-1">
        Return
      </h3>
      <div
        className={`text-3xl font-bold ${pos ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}
      >
        {pos ? "+" : ""}
        {fmtPct(twr.twr)}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
        TWR · {days} days · annualized {fmtPct(ann)}
      </div>
      <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
        From {twr.effectiveStart.date} (NAV ${twr.effectiveStart.nav.toLocaleString()}) to {twr.effectiveEnd.date} (NAV ${twr.effectiveEnd.nav.toLocaleString()})
      </div>
      {twr.clamped && (
        <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
          Period clamped — earliest available data is {twr.effectiveStart.date}.
        </div>
      )}
    </div>
  );
}
