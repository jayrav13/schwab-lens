import type { PortfolioState } from "@/lib/model/types";
import { formatCurrency } from "@/lib/util/money";

type Props = { state: PortfolioState; asOfDate: string };

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function formatExpiry(e: string): string {
  return `${e.slice(5, 7)}/${e.slice(8, 10)}`;
}

export function OpenPositionsCard({ state, asOfDate }: Props) {
  const opts = state.openOptionPositions;
  const shares = state.openSharePositions;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 mb-0.5">
        Open positions
      </h3>
      <p className="text-xs text-gray-500 mb-3">
        {opts.length} contract(s) · {shares.length} share lot(s) · no live
        quotes in v1
      </p>

      <div className="text-[11px] uppercase tracking-wide text-gray-400 mt-2 mb-1">
        Short options
      </div>
      {opts.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">None open.</p>
      ) : (
        opts.map((o) => {
          const dte = daysBetween(asOfDate, o.contract.expiry);
          const entry = o.entries[o.entries.length - 1];
          return (
            <div
              key={`${o.contract.ticker}-${o.contract.expiry}-${o.contract.strike}-${o.contract.type}`}
              className="flex justify-between py-1.5 border-b border-gray-100 last:border-0 text-[13px]"
            >
              <div>
                <strong>{o.contract.ticker}</strong>{" "}
                {formatExpiry(o.contract.expiry)} $
                {o.contract.strike.toFixed(2)} {o.contract.type[0]}
                <div className="text-[11px] text-gray-500">
                  {o.quantityOpen} ct · opened{" "}
                  {formatExpiry(entry.date)}
                </div>
              </div>
              <div className="text-right">
                <strong className="text-emerald-700">
                  +{formatCurrency(o.netPremiumCollected)}
                </strong>
                <div className="text-[11px] text-gray-500">
                  {dte}d to expiry
                </div>
              </div>
            </div>
          );
        })
      )}

      <div className="text-[11px] uppercase tracking-wide text-gray-400 mt-4 mb-1">
        Share holdings
      </div>
      {shares.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">None held.</p>
      ) : (
        shares.map((s) => (
          <div
            key={s.ticker}
            className="flex justify-between py-1.5 border-b border-gray-100 last:border-0 text-[13px]"
          >
            <div>
              <strong>{s.ticker}</strong>
              <div className="text-[11px] text-gray-500">assigned share lot</div>
            </div>
            <div className="text-right">
              <strong>{s.shares} sh</strong>
              <div className="text-[11px] text-gray-500">
                @ {formatCurrency(s.weightedCostBasis)} ·{" "}
                {formatCurrency(s.shares * s.weightedCostBasis)}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
