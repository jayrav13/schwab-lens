import Link from "next/link";
import type { NavStripData } from "@/lib/server/accountOverview";
import type { PeriodKey } from "@/lib/server/period";

type Props = {
  uuid: string;
  label: string;
  nav: NavStripData;
};

const PERIODS: PeriodKey[] = ["1M", "3M", "YTD", "1Y", "All"];

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
}

export function OverviewNavStrip({ uuid, label, nav }: Props) {
  const { current, changeAmount, changePct, computation } = nav;
  const positive = changeAmount >= 0;
  return (
    <section className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-4">
      <div className="flex items-baseline justify-between gap-4">
        <div className="text-lg font-semibold">{label}</div>
        <details className="relative text-xs text-gray-500 dark:text-gray-400">
          <summary className="cursor-pointer select-none list-none">ⓘ How is this computed?</summary>
          <div className="absolute right-0 mt-2 w-80 rounded-md border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 shadow-lg z-10 text-left space-y-1">
            <div>Period: <code>{computation.period}</code></div>
            <div>Requested start: <code>{computation.requestedStart}</code></div>
            <div>
              Effective start: <code>{computation.effectiveStart}</code>
              {computation.clampedToSeed ? " (clamped to seed)" : ""}
            </div>
            <div>End: <code>{computation.end}</code></div>
            <div>
              Seed: <code>{fmtMoney(computation.seedValue)}</code> on <code>{computation.seedDate}</code>
            </div>
            <div>Formula: <code>{computation.formula}</code></div>
            <div className="mt-2 text-[10px] text-gray-400">
              Snapshot-aligned TWR is tracked separately — see #2.
            </div>
          </div>
        </details>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-4 flex-wrap">
        <div className="text-3xl font-bold tabular-nums">{fmtMoney(current)}</div>
        <div
          className={`text-sm tabular-nums ${
            positive ? "text-emerald-600" : "text-rose-600"
          }`}
        >
          {positive ? "+" : ""}
          {fmtMoney(changeAmount)} ({fmtPct(changePct)}) {computation.period}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1">
        {PERIODS.map((p) => {
          const isActive = p === computation.period;
          return (
            <Link
              key={p}
              href={`/accounts/${uuid}/overview?period=${p}`}
              className={`px-2 py-1 rounded text-xs ${
                isActive
                  ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                  : "bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-neutral-700"
              }`}
            >
              {p}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
