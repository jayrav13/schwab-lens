import Link from "next/link";
import type { PeriodKey } from "@/lib/server/period";

const PERIODS: PeriodKey[] = ["1M", "3M", "YTD", "1Y", "All"];

type Props = {
  active: PeriodKey;
};

export function HomePeriodSelector({ active }: Props) {
  return (
    <div className="flex items-center gap-1">
      {PERIODS.map((p) => {
        const isActive = p === active;
        return (
          <Link
            key={p}
            href={p === "1M" ? "/" : `/?period=${p}`}
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
  );
}
