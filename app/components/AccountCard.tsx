import Link from "next/link";
import { Sparkline } from "@/app/components/Sparkline";
import { formatCurrency } from "@/lib/util/money";
import type { AccountSummary } from "@/lib/server/home";

type Props = {
  summary: AccountSummary;
};

export function AccountCard({ summary }: Props) {
  const { account, nav, twr, navSeries, hasData, clamped } = summary;
  const hasTwr = twr !== null;
  const positive = hasTwr ? twr! >= 0 : null;

  return (
    <Link
      href={`/accounts/${account.uuid}/overview`}
      className="block rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 hover:border-gray-300 dark:hover:border-neutral-700 hover:shadow-sm transition"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            {account.label}
          </div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
            ···{account.externalId}
          </div>
        </div>
        <div
          className={`text-xs font-semibold tabular-nums ${
            hasTwr
              ? positive
                ? "text-emerald-600"
                : "text-red-600"
              : "text-gray-400 dark:text-gray-500"
          }`}
        >
          {hasTwr
            ? `${positive ? "+" : ""}${(twr! * 100).toFixed(2)}%`
            : hasData
              ? "—"
              : "no data"}
        </div>
      </div>
      <div className="text-2xl font-bold tabular-nums mb-2">
        {formatCurrency(nav)}
      </div>
      <Sparkline
        points={navSeries}
        width={240}
        height={36}
        positive={positive}
        className="w-full h-9"
      />
      {clamped && (
        <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
          period clamped to earliest data
        </div>
      )}
    </Link>
  );
}
