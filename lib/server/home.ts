import type Database from "better-sqlite3";
import { getDb } from "@/lib/db/connection";
import { listAccounts, type Account } from "@/lib/db/repos/accounts";
import { listTransactionsByAccount } from "@/lib/db/repos/transactions";
import { getAllSnapshotsByAccount } from "@/lib/db/repos/positionSnapshots";
import { transactionFromRow } from "@/lib/model/fromDb";
import { navSeriesFromSnapshots } from "@/lib/model/metrics/navSeries";
import { computeTwr } from "@/lib/model/metrics/twr";
import { resolvePeriod, type PeriodKey } from "@/lib/server/period";
import { effectiveToday } from "@/lib/util/dates";
import { daysBetweenIso } from "@/lib/util/relativeTime";
import type { Transaction } from "@/lib/csv/types";
import type { NavPoint } from "@/lib/model/types";

// Cards older than this read as "stale" — exports for non-primary accounts
// may be infrequent and we don't want a stale Roth IRA card to look fresh.
export const STALE_THRESHOLD_DAYS = 7;

export type AccountSummary = {
  account: Account;
  hasData: boolean;
  nav: number;
  navSeries: NavPoint[];
  twr: number | null;
  effectiveStart: { date: string; nav: number } | null;
  effectiveEnd: { date: string; nav: number } | null;
  clamped: boolean;
  staleness: {
    daysSinceLastSeen: number;
    isStale: boolean;
    referenceTime: string;
  };
};

export type HomeView = {
  accounts: AccountSummary[];
  total: {
    nav: number;
    twr: number | null;
    navSeries: NavPoint[];
  };
  period: {
    key: PeriodKey;
    requestedStart: string;
    requestedEnd: string;
  };
  loadedAt: string;
};

export type LoadHomeOpts = {
  db?: Database.Database;
  period?: PeriodKey;
  today?: string;
  // Wall-clock reference for staleness ("are exports recent?"). Distinct from
  // `today`, which is snapshot-anchored for TWR calculations. Defaults to now.
  now?: string;
};

type LoadedAccount = {
  account: Account;
  transactions: Transaction[];
  navSeries: NavPoint[];
  earliestSnap: string | null;
  latestSnap: string | null;
};

export async function loadHomeView(opts: LoadHomeOpts = {}): Promise<HomeView> {
  const db = opts.db ?? getDb();
  const accounts = listAccounts(db);
  const periodKey: PeriodKey = opts.period ?? "1M";
  const loadedAt = new Date().toISOString();
  const now = opts.now ?? loadedAt;

  const loaded: LoadedAccount[] = accounts.map((account) => {
    const txRows = listTransactionsByAccount(db, account.id);
    const snapshotRows = getAllSnapshotsByAccount(db, account.id);
    const navSeries = navSeriesFromSnapshots(snapshotRows);
    return {
      account,
      transactions: txRows.map(transactionFromRow),
      navSeries,
      earliestSnap: navSeries[0]?.date ?? null,
      latestSnap: navSeries.at(-1)?.date ?? null,
    };
  });

  const globalLatest =
    loaded
      .map((l) => l.latestSnap)
      .filter((d): d is string => d !== null)
      .sort()
      .at(-1) ?? null;
  const today = opts.today ?? effectiveToday(globalLatest);
  // For the strip's window we want the union of all account histories, so
  // anchor the period's seed on the earliest data date across accounts. Falls
  // back to today when no account has any data yet.
  const earliestAcrossAccounts =
    loaded
      .map((l) => l.earliestSnap)
      .filter((d): d is string => d !== null)
      .sort()[0] ?? today;
  const globalPeriod = resolvePeriod(periodKey, today, earliestAcrossAccounts);

  const summaries: AccountSummary[] = loaded.map((l) =>
    summarizeAccount(l, periodKey, today, now),
  );

  const totalNav = summaries.reduce((s, a) => s + a.nav, 0);
  const totalTwr = navWeightedTwr(summaries);
  const totalNavSeries = buildTotalNavSeries(
    loaded.map((l) => l.navSeries),
    globalPeriod.start,
    globalPeriod.end,
  );

  return {
    accounts: summaries,
    total: { nav: totalNav, twr: totalTwr, navSeries: totalNavSeries },
    period: {
      key: periodKey,
      requestedStart: globalPeriod.start,
      requestedEnd: globalPeriod.end,
    },
    loadedAt,
  };
}

function summarizeAccount(
  l: LoadedAccount,
  periodKey: PeriodKey,
  today: string,
  now: string,
): AccountSummary {
  const daysSinceLastSeen = Math.max(
    0,
    daysBetweenIso(l.account.lastSeenAt, now),
  );
  const staleness = {
    daysSinceLastSeen,
    isStale: daysSinceLastSeen > STALE_THRESHOLD_DAYS,
    referenceTime: now,
  };

  const hasData = l.transactions.length > 0 || l.navSeries.length > 0;
  if (!hasData) {
    return {
      account: l.account,
      hasData: false,
      nav: 0,
      navSeries: [],
      twr: null,
      effectiveStart: null,
      effectiveEnd: null,
      clamped: false,
      staleness,
    };
  }

  const seedAsOf = l.account.seedDate ?? l.earliestSnap ?? today;
  const period = resolvePeriod(periodKey, today, seedAsOf);

  const seed =
    l.account.seedDate !== null && l.account.seedValue !== null
      ? { date: l.account.seedDate, value: l.account.seedValue }
      : null;

  const twrResult = computeTwr({
    navPoints: l.navSeries,
    transactions: l.transactions,
    period: { from: period.start, to: period.end },
    seed,
  });

  const within = l.navSeries.filter(
    (p) => p.date >= period.start && p.date <= period.end,
  );
  // Prepend the chosen anchor (seed or first snapshot in window) so the card
  // sparkline begins at the same point the TWR chain begins.
  const sparkline =
    twrResult.effectiveStart &&
    (within.length === 0 || within[0].date !== twrResult.effectiveStart.date)
      ? [twrResult.effectiveStart, ...within]
      : within;

  return {
    account: l.account,
    hasData: true,
    nav: l.navSeries.at(-1)?.nav ?? 0,
    navSeries: sparkline,
    twr: twrResult.twr,
    effectiveStart: twrResult.effectiveStart,
    effectiveEnd: twrResult.effectiveEnd,
    clamped: period.clampedToSeed || twrResult.clamped,
    staleness,
  };
}

// NAV-weighted average of per-account TWRs. Weight is each account's effective
// start NAV (the value being earned-against). Accounts without a valid TWR or
// without a positive start NAV contribute nothing.
function navWeightedTwr(summaries: AccountSummary[]): number | null {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const s of summaries) {
    if (s.twr === null || s.effectiveStart === null) continue;
    if (s.effectiveStart.nav <= 0) continue;
    weightedSum += s.twr * s.effectiveStart.nav;
    totalWeight += s.effectiveStart.nav;
  }
  return totalWeight === 0 ? null : weightedSum / totalWeight;
}

function buildTotalNavSeries(
  navSeriesByAccount: NavPoint[][],
  start: string,
  end: string,
): NavPoint[] {
  const dateSet = new Set<string>();
  for (const series of navSeriesByAccount) {
    for (const p of series) {
      if (p.date >= start && p.date <= end) dateSet.add(p.date);
    }
  }
  if (dateSet.size === 0) return [];
  const dates = Array.from(dateSet).sort();
  return dates.map((date) => {
    let total = 0;
    for (const series of navSeriesByAccount) {
      total += navAtOrBefore(series, date);
    }
    return { date, nav: total };
  });
}

function navAtOrBefore(series: NavPoint[], date: string): number {
  let last = 0;
  for (const p of series) {
    if (p.date <= date) last = p.nav;
    else break;
  }
  return last;
}

export async function loadAccounts(
  opts: { db?: Database.Database } = {},
): Promise<Account[]> {
  const db = opts.db ?? getDb();
  return listAccounts(db);
}
