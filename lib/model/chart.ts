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
