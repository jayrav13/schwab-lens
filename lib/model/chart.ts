import type { NavPoint } from "./types";

export type RangePreset = "1M" | "3M" | "6M" | "YTD" | "All";

const DAY_MS = 24 * 60 * 60 * 1000;

function windowStartMs(preset: RangePreset, asOfDate: string): number | null {
  const asOfMs = Date.parse(asOfDate);
  switch (preset) {
    case "1M":
      return asOfMs - 30 * DAY_MS;
    case "3M":
      return asOfMs - 90 * DAY_MS;
    case "6M":
      return asOfMs - 180 * DAY_MS;
    case "YTD": {
      const year = asOfDate.slice(0, 4);
      return Date.parse(`${year}-01-01`);
    }
    case "All":
      return null;
  }
}

export function filterSeriesByRange(
  series: NavPoint[],
  preset: RangePreset,
  asOfDate: string,
): NavPoint[] {
  if (series.length === 0) return [];
  if (preset === "All") return series;
  const startMs = windowStartMs(preset, asOfDate);
  if (startMs === null) return series;
  return series.filter((p) => Date.parse(p.date) >= startMs);
}

export function nearestPointByMs(
  series: NavPoint[],
  targetMs: number,
): NavPoint | null {
  if (series.length === 0) return null;
  let lo = 0;
  let hi = series.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (Date.parse(series[mid].date) < targetMs) lo = mid + 1;
    else hi = mid;
  }
  const cand = [series[lo]];
  if (lo > 0) cand.unshift(series[lo - 1]);
  let best = cand[0];
  let bestDelta = Math.abs(Date.parse(best.date) - targetMs);
  for (let i = 1; i < cand.length; i++) {
    const delta = Math.abs(Date.parse(cand[i].date) - targetMs);
    if (delta < bestDelta) {
      best = cand[i];
      bestDelta = delta;
    }
  }
  return best;
}
