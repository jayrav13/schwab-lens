import type { HoldingRow } from "@/lib/server/accountOverview";
import { formatCurrency } from "@/lib/util/money";

function fmtMoney(n: number | null): string {
  if (n === null) return "—";
  return formatCurrency(n);
}

function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
}

function fmtPctPlain(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtQty(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function HoldingsTable({ rows }: { rows: HoldingRow[] }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 overflow-x-auto">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200 mb-0.5">
        Holdings
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        {rows.length === 0
          ? "No equity or ETF holdings yet."
          : `${rows.length} ticker${rows.length === 1 ? "" : "s"} · equities and ETFs only · derivatives on the Options tab.`}
      </p>

      {rows.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
              <th className="py-1 pr-3">Symbol</th>
              <th className="py-1 pr-3 text-right">Qty</th>
              <th className="py-1 pr-3 text-right">Avg cost</th>
              <th className="py-1 pr-3 text-right">Price</th>
              <th className="py-1 pr-3 text-right">Value</th>
              <th className="py-1 pr-3 text-right">% of acct</th>
              <th className="py-1 pr-3 text-right">Day Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.symbol}
                className="border-t border-gray-100 dark:border-neutral-800"
              >
                <td className="py-1.5 pr-3 font-mono text-[13px]">{r.symbol}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{fmtQty(r.qty)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{fmtMoney(r.avgCost)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{fmtMoney(r.price)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums font-semibold">
                  {fmtMoney(r.value)}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{fmtPctPlain(r.pctOfAccount)}</td>
                <td
                  className={`py-1.5 pr-3 text-right tabular-nums ${
                    r.dayChangePct === null
                      ? "text-gray-400 dark:text-gray-500"
                      : r.dayChangePct >= 0
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-red-700 dark:text-red-400"
                  }`}
                >
                  {fmtPct(r.dayChangePct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
