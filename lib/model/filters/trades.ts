import type { ClosedTrade, TradeOutcome } from "@/lib/model/metrics/trades";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ALL_OUTCOMES: ReadonlySet<TradeOutcome> = new Set([
  "Expired",
  "Assigned",
  "ClosedProfit",
  "ClosedLoss",
]);

export type TradesFilter = {
  tickers: Set<string>;
  outcomes: Set<TradeOutcome>;
  from?: string;
  to?: string;
};

export type TradesSortKey = "closeDate" | "daysHeld" | "netPnL";
export type SortDir = "asc" | "desc";
export type TradesSort = { key: TradesSortKey; dir: SortDir };

const DEFAULT_SORT: TradesSort = { key: "closeDate", dir: "desc" };

export function filterTrades(
  trades: ClosedTrade[],
  f: TradesFilter,
): ClosedTrade[] {
  return trades.filter((t) => {
    if (f.tickers.size > 0 && !f.tickers.has(t.contract.ticker)) return false;
    if (f.outcomes.size > 0 && !f.outcomes.has(t.outcome)) return false;
    if (f.from != null && t.closeDate < f.from) return false;
    if (f.to != null && t.closeDate > f.to) return false;
    return true;
  });
}

export function sortTrades(
  trades: ClosedTrade[],
  s: TradesSort,
): ClosedTrade[] {
  const sign = s.dir === "asc" ? 1 : -1;
  return [...trades].sort((a, b) => {
    let diff = 0;
    if (s.key === "closeDate") {
      diff = a.closeDate < b.closeDate ? -1 : a.closeDate > b.closeDate ? 1 : 0;
    } else if (s.key === "daysHeld") {
      diff = a.daysHeld - b.daysHeld;
    } else {
      diff = a.netPnL - b.netPnL;
    }
    if (diff !== 0) return sign * diff;
    return a.openDate < b.openDate ? -1 : a.openDate > b.openDate ? 1 : 0;
  });
}

export function parseTradesQuery(sp: URLSearchParams): {
  filter: TradesFilter;
  sort: TradesSort;
} {
  const tickers = new Set(
    (sp.get("ticker") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  );
  const outcomes = new Set<TradeOutcome>(
    (sp.get("outcome") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is TradeOutcome => ALL_OUTCOMES.has(s as TradeOutcome)),
  );
  const fromRaw = sp.get("from") ?? undefined;
  const toRaw = sp.get("to") ?? undefined;
  const from = fromRaw && ISO_DATE.test(fromRaw) ? fromRaw : undefined;
  const to = toRaw && ISO_DATE.test(toRaw) ? toRaw : undefined;

  const sortRaw = sp.get("sort") ?? "";
  const [rawKey, rawDir] = sortRaw.split(":");
  const validKey: TradesSortKey | null =
    rawKey === "closeDate" || rawKey === "daysHeld" || rawKey === "netPnL"
      ? rawKey
      : null;
  const validDir: SortDir | null =
    rawDir === "asc" || rawDir === "desc" ? rawDir : null;
  const sort: TradesSort =
    validKey && validDir ? { key: validKey, dir: validDir } : DEFAULT_SORT;

  return { filter: { tickers, outcomes, from, to }, sort };
}

export function serializeTradesQuery(
  f: TradesFilter,
  s: TradesSort,
): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.tickers.size > 0) {
    sp.set("ticker", Array.from(f.tickers).sort().join(","));
  }
  if (f.outcomes.size > 0) {
    sp.set("outcome", Array.from(f.outcomes).sort().join(","));
  }
  if (f.from) sp.set("from", f.from);
  if (f.to) sp.set("to", f.to);
  if (s.key !== DEFAULT_SORT.key || s.dir !== DEFAULT_SORT.dir) {
    sp.set("sort", `${s.key}:${s.dir}`);
  }
  return sp;
}
