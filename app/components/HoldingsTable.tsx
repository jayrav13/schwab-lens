import type { HoldingRow } from "@/lib/server/accountOverview";

function fmtMoney(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
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
  if (rows.length === 0) {
    return (
      <section className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-4">
        <h2 className="text-sm font-semibold mb-2">Holdings</h2>
        <div className="text-sm text-gray-500">No holdings yet.</div>
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-4 overflow-x-auto">
      <h2 className="text-sm font-semibold mb-2">Holdings</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-gray-500 dark:text-gray-400">
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
              <td className="py-1 pr-3 font-mono">{r.symbol}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{fmtQty(r.qty)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{fmtMoney(r.avgCost)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{fmtMoney(r.price)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{fmtMoney(r.value)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{fmtPctPlain(r.pctOfAccount)}</td>
              <td
                className={`py-1 pr-3 text-right tabular-nums ${
                  r.dayChangePct === null
                    ? "text-gray-500"
                    : r.dayChangePct >= 0
                      ? "text-emerald-600"
                      : "text-rose-600"
                }`}
              >
                {fmtPct(r.dayChangePct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-[10px] text-gray-400">
        Equities and ETFs only. See the Options tab for derivatives.
      </div>
    </section>
  );
}
