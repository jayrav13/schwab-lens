import type {
  ClosedTrade,
  PortfolioState,
  TradeOutcome,
} from "@/lib/model/types";
import { formatCurrency } from "@/lib/util/money";

type Props = { state: PortfolioState };

function outcomeBadgeClasses(outcome: TradeOutcome): string {
  if (outcome === "ClosedLoss") {
    return "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300";
  }
  return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
}

function outcomeLabel(outcome: TradeOutcome): string {
  switch (outcome) {
    case "Expired":
      return "Expired";
    case "Assigned":
      return "Assigned";
    case "ClosedProfit":
      return "Profit";
    case "ClosedLoss":
      return "Loss";
  }
}

function formatContract(c: ClosedTrade["contract"]): string {
  return `${c.ticker} $${c.strike.toFixed(2)} ${c.type[0]}`;
}

function sortedDesc(trades: ClosedTrade[]): ClosedTrade[] {
  return [...trades].sort((a, b) => {
    if (a.closeDate !== b.closeDate) return a.closeDate < b.closeDate ? 1 : -1;
    if (a.openDate !== b.openDate) return a.openDate < b.openDate ? -1 : 1;
    return 0;
  });
}

export function TradeHistoryCard({ state }: Props) {
  const trades = sortedDesc(state.closedTrades ?? []);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200 mb-0.5">
        Closed trades
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Every option contract that has been closed, expired, or assigned —
        one row per FIFO-matched slice.
      </p>
      {trades.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 py-2">
          No closed trades yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-neutral-800">
                <th className="py-1.5 pr-3">Contract</th>
                <th className="py-1.5 pr-3">Opened</th>
                <th className="py-1.5 pr-3">Closed</th>
                <th className="py-1.5 pr-3 text-right">Qty</th>
                <th className="py-1.5 pr-3 text-right">Held</th>
                <th className="py-1.5 pr-3">Outcome</th>
                <th className="py-1.5 text-right">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t, i) => (
                <tr
                  key={i}
                  className="border-b border-gray-100 dark:border-neutral-800 last:border-0"
                >
                  <td className="py-1.5 pr-3">
                    <div className="font-semibold">
                      {formatContract(t.contract)}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">
                      exp {t.contract.expiry.slice(5)}
                    </div>
                  </td>
                  <td className="py-1.5 pr-3">
                    <div>{t.openDate.slice(5)}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">
                      ${t.openPrice.toFixed(2)}
                    </div>
                  </td>
                  <td className="py-1.5 pr-3">
                    <div>{t.closeDate.slice(5)}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">
                      {t.outcome === "Expired" || t.outcome === "Assigned"
                        ? "—"
                        : `$${t.closePrice.toFixed(2)}`}
                    </div>
                  </td>
                  <td className="py-1.5 pr-3 text-right">{t.qty}</td>
                  <td className="py-1.5 pr-3 text-right">{t.daysHeld}d</td>
                  <td className="py-1.5 pr-3">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${outcomeBadgeClasses(t.outcome)}`}
                    >
                      {outcomeLabel(t.outcome)}
                    </span>
                  </td>
                  <td
                    className={`py-1.5 text-right font-semibold ${t.netPnL >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}
                  >
                    {t.netPnL >= 0 ? "+" : "−"}
                    {formatCurrency(Math.abs(t.netPnL))}
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
