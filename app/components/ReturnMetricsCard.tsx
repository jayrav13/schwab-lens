import type { PortfolioState } from "@/lib/model/types";
import { computeReturnMetrics } from "@/lib/model/metrics/returns";

type Props = { state: PortfolioState };

function formatPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

export function ReturnMetricsCard({ state }: Props) {
  const r = computeReturnMetrics(state.navSeries, state.externalFlows, state.config);
  const hasHonestSeed = state.config.seedValue > 0 && state.config.seedDate !== "";
  const muted = "text-gray-400 dark:text-gray-500";
  const color = (n: number) =>
    n >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400";

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200 mb-0.5">
        Return metrics
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Total and annualized return, best and worst month. External flows
        subtracted from performance.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile
          label="Total return"
          value={hasHonestSeed ? formatPct(r.totalReturnPct) : "—"}
          valueClass={hasHonestSeed ? color(r.totalReturnPct) : muted}
          sub={hasHonestSeed ? `${r.daysSinceSeed} days` : "no seed configured"}
        />
        <Tile
          label="Annualized"
          value={hasHonestSeed ? formatPct(r.annualizedPct) : "—"}
          valueClass={hasHonestSeed ? color(r.annualizedPct) : muted}
          sub={hasHonestSeed ? "(365-day basis)" : "no seed configured"}
        />
        <Tile
          label="Best month"
          value={hasHonestSeed && r.bestMonth ? formatPct(r.bestMonth.returnPct) : "—"}
          valueClass={hasHonestSeed && r.bestMonth ? color(r.bestMonth.returnPct) : muted}
          sub={hasHonestSeed ? (r.bestMonth?.month ?? "") : ""}
        />
        <Tile
          label="Worst month"
          value={hasHonestSeed && r.worstMonth ? formatPct(r.worstMonth.returnPct) : "—"}
          valueClass={hasHonestSeed && r.worstMonth ? color(r.worstMonth.returnPct) : muted}
          sub={hasHonestSeed ? (r.worstMonth?.month ?? "") : ""}
        />
      </div>

      {hasHonestSeed && r.monthly.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
            Monthly
          </div>
          {r.monthly.map((m) => (
            <div
              key={m.month}
              className="flex justify-between py-1.5 border-b border-gray-100 dark:border-neutral-800 last:border-0 text-[13px]"
            >
              <span>{m.month}</span>
              <span className={`tabular-nums font-semibold ${color(m.returnPct)}`}>
                {formatPct(m.returnPct)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub: string;
  valueClass: string;
}) {
  return (
    <div className="rounded border border-gray-100 dark:border-neutral-800 p-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className={`text-lg font-bold ${valueClass}`}>{value}</div>
      <div className="text-[10px] text-gray-400 dark:text-gray-500">{sub}</div>
    </div>
  );
}
