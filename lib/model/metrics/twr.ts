import type { Transaction } from "@/lib/csv/types";
import type {
  NavPoint,
  TwrFlow,
  TwrResult,
  TwrSegment,
  Warning,
} from "@/lib/model/types";
import { externalFlowsBetween } from "@/lib/model/metrics/cashflow";

export type ComputeTwrInput = {
  navPoints: NavPoint[];
  transactions: Transaction[];
  period: { from: string; to: string };
  seed: { date: string; value: number } | null;
};

export function computeTwr(input: ComputeTwrInput): TwrResult {
  const warnings: Warning[] = [];
  const segments: TwrSegment[] = [];

  // Resolve effective endpoints. Happy path: start = first snapshot ≥ from,
  // end = last snapshot ≤ to. Edge cases (seed backfill, clamping, single
  // snapshot, etc.) handled in subsequent tasks.
  const inPeriod = input.navPoints.filter(
    (p) => p.date >= input.period.from && p.date <= input.period.to,
  );

  const effectiveStart = inPeriod[0] ?? null;
  const effectiveEnd = inPeriod[inPeriod.length - 1] ?? null;

  if (
    !effectiveStart ||
    !effectiveEnd ||
    effectiveStart.date === effectiveEnd.date
  ) {
    return {
      twr: null,
      effectiveStart,
      effectiveEnd,
      clamped: false,
      segments,
      warnings,
    };
  }

  // Build sub-periods from consecutive snapshot points.
  let chained = 1;
  for (let i = 0; i < inPeriod.length - 1; i++) {
    const a = inPeriod[i];
    const b = inPeriod[i + 1];
    const intervalDays = daysBetween(a.date, b.date);
    if (intervalDays <= 0) continue;

    // Flows in (a.date, b.date]: per spec, a flow on a snapshot date belongs
    // to the OPENING of the next interval (so it lands here when its date is
    // strictly greater than a.date and ≤ b.date).
    const rawFlows = externalFlowsBetween(input.transactions, a.date, b.date);
    const flows: TwrFlow[] = rawFlows
      .filter((f) => f.date > a.date)
      .map((f) => ({
        date: f.date,
        amount: f.signedAmount,
        weight: (intervalDays - daysBetween(a.date, f.date)) / intervalDays,
      }));

    const flowsTotal = flows.reduce((s, f) => s + f.amount, 0);
    const weightedFlows = flows.reduce((s, f) => s + f.amount * f.weight, 0);
    const denom = a.nav + weightedFlows;
    const r = (b.nav - a.nav - flowsTotal) / denom;

    segments.push({
      fromDate: a.date,
      toDate: b.date,
      fromNav: a.nav,
      toNav: b.nav,
      flows,
      flowsTotal,
      weightedFlows,
      return: r,
    });

    chained *= 1 + r;
  }

  return {
    twr: chained - 1,
    effectiveStart,
    effectiveEnd,
    clamped: false,
    segments,
    warnings,
  };
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000,
  );
}
