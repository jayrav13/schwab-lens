import type { MarkToMarket } from "@/lib/model/metrics/mark_to_market";
import { formatCurrency } from "@/lib/util/money";

type Props = { markToMarket: MarkToMarket };

export function MarkToMarketCard({ markToMarket }: Props) {
  const { rows, missingQuotes, optionRows } = markToMarket;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200 mb-0.5">
        Mark-to-market by ticker
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Held shares priced at the current market. Quotes cached 15 min.
        {missingQuotes.length > 0
          ? ` Falling back to cost basis for: ${missingQuotes.join(", ")}.`
          : ""}
      </p>

      {rows.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 py-2">No shares held.</p>
      ) : (
        rows.map((r) => {
          const pnlColor =
            r.unrealized >= 0
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-red-700 dark:text-red-400";
          const sign = r.unrealized >= 0 ? "+" : "−";
          return (
            <div
              key={r.ticker}
              className="flex justify-between py-1.5 border-b border-gray-100 dark:border-neutral-800 last:border-0 text-[13px]"
            >
              <div>
                <strong>{r.ticker}</strong>{" "}
                <span className="text-gray-500 dark:text-gray-400">
                  · {r.shares} sh @ {formatCurrency(r.costBasis)}
                </span>
                <div className="text-[11px] text-gray-500 dark:text-gray-400">
                  {r.marketPrice === null
                    ? "quote unavailable — using cost basis"
                    : `market ${formatCurrency(r.marketPrice)}${r.quoteStale ? " (stale)" : ""}`}
                </div>
              </div>
              <div className="text-right">
                <strong>{formatCurrency(r.marketValue)}</strong>
                <div className={`text-[11px] font-semibold tabular-nums ${pnlColor}`}>
                  {sign}
                  {formatCurrency(Math.abs(r.unrealized))} ({sign}
                  {(Math.abs(r.unrealizedPct) * 100).toFixed(2)}%)
                </div>
              </div>
            </div>
          );
        })
      )}

      {optionRows && optionRows.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-200 dark:border-neutral-800">
          <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">
            Open option contracts (Schwab marks)
          </div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[11px] text-gray-500 dark:text-gray-400">
                <th className="py-1 font-normal">Contract</th>
                <th className="py-1 text-right font-normal">Qty</th>
                <th className="py-1 text-right font-normal">Mark</th>
                <th className="py-1 text-right font-normal">Value</th>
                <th className="py-1 text-right font-normal">Δ</th>
                <th className="py-1 text-right font-normal">Θ</th>
              </tr>
            </thead>
            <tbody>
              {optionRows.map((o) => (
                <tr
                  key={`${o.underlying}|${o.expiry}|${o.strike}|${o.callPut}`}
                  className="border-t border-gray-100 dark:border-neutral-800"
                >
                  <td className="py-1">
                    {o.underlying} {o.expiry} {o.strike} {o.callPut}
                  </td>
                  <td className="py-1 text-right tabular-nums">{o.quantity}</td>
                  <td className="py-1 text-right tabular-nums">
                    {formatCurrency(o.price)}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {formatCurrency(o.marketValue)}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {o.delta?.toFixed(2) ?? "—"}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {o.theta?.toFixed(2) ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
