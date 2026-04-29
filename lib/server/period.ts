export type PeriodKey = "1M" | "3M" | "YTD" | "1Y" | "All";

const VALID: ReadonlySet<PeriodKey> = new Set(["1M", "3M", "YTD", "1Y", "All"]);

export function parsePeriodKey(input: string | undefined): PeriodKey {
  if (input && (VALID as Set<string>).has(input)) return input as PeriodKey;
  return "YTD";
}

export type ResolvedPeriod = {
  key: PeriodKey;
  start: string;
  end: string;
  clampedToSeed: boolean;
};

export function resolvePeriod(
  key: PeriodKey,
  today: string,
  seedDate: string,
): ResolvedPeriod {
  const end = today;
  let rawStart: string;

  if (key === "All") {
    rawStart = seedDate;
  } else if (key === "YTD") {
    rawStart = `${today.slice(0, 4)}-01-01`;
  } else if (key === "1M") {
    rawStart = subtractMonths(today, 1);
  } else if (key === "3M") {
    rawStart = subtractMonths(today, 3);
  } else {
    rawStart = subtractMonths(today, 12);
  }

  const clampedToSeed = rawStart < seedDate;
  const start = clampedToSeed ? seedDate : rawStart;

  return { key, start, end, clampedToSeed };
}

function subtractMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCMonth(date.getUTCMonth() - months);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
