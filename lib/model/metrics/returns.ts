import type { NavPoint, Config, FlowPoint } from "@/lib/model/types";

export type MonthReturn = { month: string; startNav: number; endNav: number; returnPct: number };
export type ReturnMetrics = {
  totalReturnPct: number;
  annualizedPct: number;
  daysSinceSeed: number;
  bestMonth: MonthReturn | null;
  worstMonth: MonthReturn | null;
  monthly: MonthReturn[];
};

export function computeReturnMetrics(
  navSeries: NavPoint[],
  externalFlows: FlowPoint[],
  config: Config,
): ReturnMetrics {
  const finalNav = navSeries.at(-1)?.nav ?? config.seedValue;
  const cumulativeExternal = externalFlows.reduce((a, f) => a + f.signedAmount, 0);
  const totalReturnPct =
    (finalNav - config.seedValue - cumulativeExternal) / config.seedValue;

  const seedMs = Date.parse(config.seedDate);
  const lastMs = Date.parse(navSeries.at(-1)?.date ?? config.seedDate);
  const daysSinceSeed = Math.max(1, Math.round((lastMs - seedMs) / 86_400_000));
  const annualizedPct = totalReturnPct * (365 / daysSinceSeed);

  // Monthly: snap NAV to last point <= end of month for each month from seed to final.
  const monthly: MonthReturn[] = [];
  if (navSeries.length >= 2) {
    const byMonth = new Map<string, number>();
    byMonth.set(config.seedDate.slice(0, 7), config.seedValue);
    for (const p of navSeries) {
      byMonth.set(p.date.slice(0, 7), p.nav);
    }
    const months = [...byMonth.keys()].sort();
    for (let i = 1; i < months.length; i++) {
      const start = byMonth.get(months[i - 1])!;
      const end = byMonth.get(months[i])!;
      monthly.push({
        month: months[i],
        startNav: start,
        endNav: end,
        returnPct: (end - start) / start,
      });
    }
  }

  const bestMonth =
    monthly.length === 0
      ? null
      : monthly.reduce((a, b) => (b.returnPct > a.returnPct ? b : a));
  const worstMonth =
    monthly.length === 0
      ? null
      : monthly.reduce((a, b) => (b.returnPct < a.returnPct ? b : a));

  return {
    totalReturnPct,
    annualizedPct,
    daysSinceSeed,
    bestMonth,
    worstMonth,
    monthly,
  };
}
