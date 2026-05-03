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

  // Resolve effective start: seed backfill if requested from <= seedDate,
  // else first snapshot >= from.
  const inPeriod = input.navPoints.filter(
    (p) => p.date >= input.period.from && p.date <= input.period.to,
  );

  const useSeed =
    input.seed !== null && input.period.from <= input.seed.date;

  const effectiveStart: { date: string; nav: number } | null = useSeed
    ? { date: input.seed!.date, nav: input.seed!.value }
    : inPeriod[0] ?? null;

  const effectiveEnd = inPeriod[inPeriod.length - 1] ?? null;

  const clamped =
    !useSeed &&
    effectiveStart !== null &&
    effectiveStart.date > input.period.from;

  if (clamped && effectiveStart) {
    warnings.push({ kind: "Clamped", earliestDate: effectiveStart.date });
  }

  if (!effectiveStart || !effectiveEnd) {
    return {
      twr: null,
      effectiveStart,
      effectiveEnd,
      clamped,
      segments,
      warnings,
    };
  }

  if (effectiveStart.date === effectiveEnd.date) {
    warnings.push({ kind: "InsufficientSnapshots", count: 1 });
    return {
      twr: null,
      effectiveStart,
      effectiveEnd,
      clamped,
      segments,
      warnings,
    };
  }

  // Build the chain of points: effectiveStart, then any snapshots after
  // effectiveStart.date and ≤ effectiveEnd.date.
  const chainPoints: NavPoint[] = [
    effectiveStart,
    ...inPeriod.filter((p) => p.date > effectiveStart.date),
  ];

  let firstNonZero = 0;
  while (firstNonZero < chainPoints.length && chainPoints[firstNonZero].nav === 0) {
    firstNonZero++;
  }
  const live = chainPoints.slice(firstNonZero);

  if (live.length < 2) {
    warnings.push({ kind: "InsufficientSnapshots", count: live.length });
    return {
      twr: null,
      effectiveStart,
      effectiveEnd,
      clamped,
      segments,
      warnings,
    };
  }

  // Build sub-periods from consecutive snapshot points.
  let chained = 1;
  for (let i = 0; i < live.length - 1; i++) {
    const a = live[i];
    const b = live[i + 1];
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

    if (denom <= 0) {
      warnings.push({ kind: "NegativeNav", date: a.date, nav: a.nav });
      return {
        twr: null,
        effectiveStart,
        effectiveEnd,
        clamped,
        segments,
        warnings,
      };
    }

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
    clamped,
    segments,
    warnings,
  };
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000,
  );
}
