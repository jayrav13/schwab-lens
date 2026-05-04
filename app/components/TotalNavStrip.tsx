import { Sparkline } from "@/app/components/Sparkline";
import { HomePeriodSelector } from "@/app/components/HomePeriodSelector";
import { formatCurrency } from "@/lib/util/money";
import type { HomeView } from "@/lib/server/home";

type Props = {
  view: HomeView;
};

export function TotalNavStrip({ view }: Props) {
  const { total, period, accounts } = view;
  const hasTwr = total.twr !== null;
  const positive = hasTwr ? total.twr! >= 0 : null;
  const accountCount = accounts.length;

  return (
    <section className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 mb-6">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Total NAV
          </div>
          <div className="text-3xl font-bold tabular-nums">
            {formatCurrency(total.nav)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {accountCount} account{accountCount === 1 ? "" : "s"} ·{" "}
            {period.requestedStart} → {period.requestedEnd}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <HomePeriodSelector active={period.key} />
          <div
            className={`text-sm font-semibold tabular-nums ${
              hasTwr
                ? positive
                  ? "text-emerald-600"
                  : "text-red-600"
                : "text-gray-400 dark:text-gray-500"
            }`}
          >
            {hasTwr
              ? `${positive ? "+" : ""}${(total.twr! * 100).toFixed(2)}%`
              : "—"}
            <span className="text-[10px] font-normal text-gray-500 dark:text-gray-400 ml-1">
              {period.key} TWR
            </span>
          </div>
        </div>
      </div>
      <div className="w-full">
        <Sparkline
          points={total.navSeries}
          width={1200}
          height={64}
          positive={positive}
          className="w-full h-16"
        />
      </div>
      {hasTwr && (
        <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
          NAV-weighted across accounts.
        </div>
      )}
    </section>
  );
}
