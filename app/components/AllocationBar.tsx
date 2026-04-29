import type {
  AllocationSlice,
  EquityAllocationRow,
} from "@/lib/server/accountOverview";

const BUCKET_COLOR: Record<string, string> = {
  EQUITY: "bg-blue-500",
  OPTION: "bg-purple-500",
  CASH: "bg-emerald-500",
  OTHER: "bg-gray-400",
};

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function AllocationBar({
  bar,
  equityRows,
}: {
  bar: AllocationSlice[];
  equityRows: EquityAllocationRow[];
}) {
  if (bar.length === 0) {
    return (
      <section className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-4">
        <h2 className="text-sm font-semibold mb-2">Allocation</h2>
        <div className="text-sm text-gray-500">
          Allocation unavailable — no holdings.
        </div>
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-4">
      <h2 className="text-sm font-semibold mb-2">Allocation</h2>

      <div className="flex h-6 w-full rounded overflow-hidden">
        {bar.map((s) => (
          <div
            key={s.bucket}
            className={`${BUCKET_COLOR[s.bucket] ?? "bg-gray-400"} flex items-center justify-center text-[10px] text-white`}
            style={{ width: `${s.pct * 100}%` }}
            title={`${s.bucket} ${fmtPct(s.pct)} (${fmtMoney(s.value)})`}
          >
            {s.pct >= 0.08 ? `${s.bucket} ${fmtPct(s.pct)}` : ""}
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
        {bar.map((s) => (
          <span key={s.bucket} className="inline-flex items-center gap-1">
            <span
              className={`inline-block w-2 h-2 rounded ${BUCKET_COLOR[s.bucket] ?? "bg-gray-400"}`}
            />
            {s.bucket} · {fmtPct(s.pct)} · {fmtMoney(s.value)}
          </span>
        ))}
      </div>

      {equityRows.length > 0 && (
        <div className="mt-4">
          <div className="text-xs uppercase text-gray-500 mb-1">
            Equity breakdown
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                <th className="py-1 pr-3">Symbol</th>
                <th className="py-1 pr-3 text-right">Value</th>
                <th className="py-1 pr-3 text-right">% of equity</th>
              </tr>
            </thead>
            <tbody>
              {equityRows.map((r) => (
                <tr
                  key={r.symbol}
                  className="border-t border-gray-100 dark:border-neutral-800"
                >
                  <td className="py-1 pr-3 font-mono">{r.symbol}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {fmtMoney(r.value)}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {fmtPct(r.pctOfEquity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
