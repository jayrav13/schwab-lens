import { notFound } from "next/navigation";
import { loadAccountOverviewView } from "@/lib/server/accountOverview";
import type { PeriodKey } from "@/lib/server/period";

export const dynamic = "force-dynamic";

const VALID_PERIODS: PeriodKey[] = ["1M", "3M", "YTD", "1Y", "All"];

export default async function DebugTwrPage({
  params,
  searchParams,
}: {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { uuid } = await params;
  const { period: rawPeriod } = await searchParams;
  const period: PeriodKey =
    typeof rawPeriod === "string" && (VALID_PERIODS as string[]).includes(rawPeriod)
      ? (rawPeriod as PeriodKey)
      : "YTD";

  const data = await loadAccountOverviewView(uuid, { period });
  if (data === null) notFound();
  if (data.kind !== "ready") {
    return (
      <main className="p-6 max-w-7xl mx-auto font-mono text-sm">
        <p>No data for this account.</p>
      </main>
    );
  }

  const nav = data.nav;
  const seg = nav.computation.segments;

  return (
    <main className="p-6 max-w-7xl mx-auto font-mono text-xs">
      <h1 className="text-lg font-bold mb-2">
        TWR debug · {data.account.label} · {period}
      </h1>
      <div className="mb-4 text-gray-600 dark:text-gray-400">
        <div>Effective start: {nav.effectiveStart?.date ?? "(none)"} (NAV {nav.effectiveStart?.nav.toLocaleString() ?? "—"})</div>
        <div>Effective end: {nav.effectiveEnd?.date ?? "(none)"} (NAV {nav.effectiveEnd?.nav.toLocaleString() ?? "—"})</div>
        <div>Clamped: {String(nav.clamped)}</div>
        <div>TWR: {nav.twr === null ? "null" : (nav.twr * 100).toFixed(4) + "%"}</div>
        <div>Benchmark: {nav.benchmark ? `${nav.benchmark.ticker} ${(nav.benchmark.twr * 100).toFixed(4)}% (${nav.benchmark.fromDate} → ${nav.benchmark.toDate})` : "(none)"}</div>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-300 dark:border-neutral-700">
            <th className="text-left px-2 py-1">From</th>
            <th className="text-right px-2 py-1">From NAV</th>
            <th className="text-left px-2 py-1">To</th>
            <th className="text-right px-2 py-1">To NAV</th>
            <th className="text-right px-2 py-1">Flows ($)</th>
            <th className="text-right px-2 py-1">Weighted</th>
            <th className="text-right px-2 py-1">r_i</th>
            <th className="text-left px-2 py-1">Flow detail</th>
          </tr>
        </thead>
        <tbody>
          {seg.map((s, i) => (
            <tr
              key={i}
              className="border-b border-gray-100 dark:border-neutral-800"
            >
              <td className="px-2 py-1">{s.fromDate}</td>
              <td className="px-2 py-1 text-right tabular-nums">{s.fromNav.toLocaleString()}</td>
              <td className="px-2 py-1">{s.toDate}</td>
              <td className="px-2 py-1 text-right tabular-nums">{s.toNav.toLocaleString()}</td>
              <td className="px-2 py-1 text-right tabular-nums">{s.flowsTotal.toLocaleString()}</td>
              <td className="px-2 py-1 text-right tabular-nums">{s.weightedFlows.toFixed(2)}</td>
              <td className="px-2 py-1 text-right tabular-nums">
                {(s.return * 100).toFixed(4)}%
              </td>
              <td className="px-2 py-1">
                {s.flows
                  .map((f) => `${f.date}: ${f.amount} (w=${f.weight.toFixed(3)})`)
                  .join("; ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {data.warnings.length > 0 && (
        <div className="mt-6">
          <h2 className="font-bold mb-1">Warnings</h2>
          <ul className="list-disc pl-5">
            {data.warnings.map((w, i) => (
              <li key={i}>{JSON.stringify(w)}</li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
