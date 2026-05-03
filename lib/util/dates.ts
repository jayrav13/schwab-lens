const MDY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export function parseTradeDate(raw: string): string {
  if (!raw) throw new Error("parseTradeDate: empty input");

  const asOfMatch = raw.match(/as of (\d{1,2}\/\d{1,2}\/\d{4})/);
  const source = asOfMatch ? asOfMatch[1] : raw.trim().split(/\s+/)[0];

  const m = source.match(MDY);
  if (!m) throw new Error(`parseTradeDate: cannot parse "${raw}"`);

  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

export function yesterdayInET(now: Date = new Date()): string {
  const dayMs = 24 * 60 * 60 * 1000;
  const y = new Date(now.getTime() - dayMs);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(y);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function effectiveToday(
  latestSnapDate: string | null,
  now: Date = new Date(),
): string {
  const fallback = yesterdayInET(now);
  return latestSnapDate !== null && latestSnapDate > fallback
    ? latestSnapDate
    : fallback;
}
