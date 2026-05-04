import type { BenchmarkResult } from "@/lib/model/types";

export type ComputeBenchmarkInput = {
  ticker: string;
  closes: Array<{ date: string; close: number }>;
  fromDate: string;
  toDate: string;
};

export function computeBenchmark(
  input: ComputeBenchmarkInput,
): BenchmarkResult | null {
  if (input.closes.length < 2) return null;

  // Snap from to first close ≥ fromDate. Snap to to last close ≤ toDate.
  const sorted = [...input.closes].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );

  const fromIdx = sorted.findIndex((c) => c.date >= input.fromDate);
  if (fromIdx === -1) return null;

  let toIdx = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].date <= input.toDate) {
      toIdx = i;
      break;
    }
  }
  if (toIdx === -1 || toIdx <= fromIdx) return null;

  const fromClose = sorted[fromIdx].close;
  const toClose = sorted[toIdx].close;
  if (!Number.isFinite(fromClose) || fromClose <= 0) return null;
  if (!Number.isFinite(toClose)) return null;

  return {
    ticker: input.ticker,
    fromDate: sorted[fromIdx].date,
    fromClose,
    toDate: sorted[toIdx].date,
    toClose,
    twr: (toClose - fromClose) / fromClose,
  };
}
