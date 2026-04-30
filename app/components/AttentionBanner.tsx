import type { Warning } from "@/lib/model/types";

function describe(w: Warning): string {
  switch (w.kind) {
    case "UnknownAction":
      return `${w.count} row(s) with unrecognized action "${w.rawAction}" — excluded from cash math.`;
    case "CashDrift":
      return `Cash balance drift: walk-forward says $${w.actual.toFixed(2)}, Σ(amount) says $${w.expected.toFixed(2)}.`;
    case "NegativeShareEndOfDay":
      return `${w.ticker} share position is negative (${w.shares}) after ${w.date}.`;
    case "UnpairedAssignment":
      return `Assignment on ${w.date} (${w.contractKey}) has no matching Buy/Sell share row.`;
    case "MissingHistoricalPrices":
      return `Historical closes unavailable for ${w.ticker} — Portfolio Value excludes this ticker's contribution on missing dates. (${w.reason})`;
    case "MissingSeed":
      return `No starting NAV configured — period and "since seed" returns are unavailable. Run \`npm run account:configure\` to set a seed date and value.`;
  }
}

type Props = { warnings: Warning[] };

export function AttentionBanner({ warnings }: Props) {
  if (warnings.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 p-4 mb-4">
      <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">
        Needs attention
      </h3>
      <ul className="list-disc list-inside text-sm text-amber-900 dark:text-amber-200">
        {warnings.map((w, i) => (
          <li key={i}>{describe(w)}</li>
        ))}
      </ul>
    </div>
  );
}
