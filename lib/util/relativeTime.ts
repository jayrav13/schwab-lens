const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function daysBetweenIso(fromIso: string, toIso: string): number {
  return Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / DAY);
}

export function formatRelativeFromNow(thenIso: string, nowIso: string): string {
  const diff = Date.parse(nowIso) - Date.parse(thenIso);
  if (Number.isNaN(diff)) return "—";
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return plural(Math.floor(diff / MINUTE), "minute");
  if (diff < DAY) return plural(Math.floor(diff / HOUR), "hour");
  if (diff < 2 * DAY) return "yesterday";
  if (diff < WEEK) return plural(Math.floor(diff / DAY), "day");
  if (diff < MONTH) return plural(Math.floor(diff / WEEK), "week");
  if (diff < YEAR) return plural(Math.floor(diff / MONTH), "month");
  return plural(Math.floor(diff / YEAR), "year");
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}
