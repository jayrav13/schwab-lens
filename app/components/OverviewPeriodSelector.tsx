import Link from "next/link";
import type { NavStripData } from "@/lib/server/accountOverview";
import type { PeriodKey } from "@/lib/server/period";

const PERIODS: PeriodKey[] = ["1M", "3M", "YTD", "1Y", "All"];

type Props = {
  uuid: string;
  nav: NavStripData;
};

export function OverviewPeriodSelector({ uuid, nav }: Props) {
  const { computation, effectiveStart, clamped } = nav;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-2 mb-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-1">
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
      <details className="relative text-xs text-gray-500 dark:text-gray-400">
        <summary className="cursor-pointer select-none">ⓘ How is this computed?</summary>
        <div className="absolute right-0 mt-2 w-80 rounded-md border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 shadow-lg z-10 text-left">
          <div>Period: <code>{computation.period}</code></div>
          <div>Requested start: <code>{computation.requestedStart}</code></div>
          <div>Requested end: <code>{computation.requestedEnd}</code></div>
          <div>
            Effective start: <code>{effectiveStart?.date ?? "—"}</code>
            {clamped ? " (clamped)" : ""}
          </div>
          <div className="mt-2 text-[10px] text-gray-400">
            Snapshot-aligned TWR — see /_debug/twr for the full chain.
          </div>
        </div>
      </details>
    </div>
  );
}
