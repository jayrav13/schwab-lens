import { describe, it, expect } from "vitest";
import type { ClosedTrade } from "@/lib/model/metrics/trades";
import {
  filterTrades,
  sortTrades,
  parseTradesQuery,
  serializeTradesQuery,
  type TradesFilter,
  type TradesSort,
} from "@/lib/model/filters/trades";

function trade(
  ticker: string,
  closeDate: string,
  outcome: ClosedTrade["outcome"],
  netPnL: number,
  daysHeld = 7,
  openDate = "2025-12-31",
): ClosedTrade {
  return {
    contract: { ticker, expiry: closeDate, strike: 100, type: "Put" },
    openDate,
    openPrice: 1,
    closeDate,
    closePrice: 0,
    qty: 1,
    outcome,
    daysHeld,
    netPnL,
  };
}

const TRADES: ClosedTrade[] = [
  trade("AAPL", "2026-02-10", "ClosedProfit", 50, 5),
  trade("AAPL", "2026-03-10", "Assigned", -120, 30),
  trade("NVDA", "2026-03-15", "Expired", 25, 14),
  trade("SPY",  "2026-04-01", "ClosedLoss", -40, 3),
];

const EMPTY: TradesFilter = { tickers: new Set(), outcomes: new Set() };
const DEFAULT_SORT: TradesSort = { key: "closeDate", dir: "desc" };

describe("filterTrades", () => {
  it("returns all trades when filter is empty", () => {
    expect(filterTrades(TRADES, EMPTY)).toHaveLength(4);
  });

  it("filters by ticker set", () => {
    const res = filterTrades(TRADES, { ...EMPTY, tickers: new Set(["AAPL"]) });
    expect(res.map((t) => t.contract.ticker)).toEqual(["AAPL", "AAPL"]);
  });

  it("filters by outcome set", () => {
    const res = filterTrades(TRADES, {
      ...EMPTY,
      outcomes: new Set(["Expired", "Assigned"]),
    });
    expect(res.map((t) => t.outcome).sort()).toEqual(["Assigned", "Expired"]);
  });

  it("filters by from/to date range inclusively on closeDate", () => {
    const res = filterTrades(TRADES, {
      ...EMPTY,
      from: "2026-03-10",
      to: "2026-03-15",
    });
    expect(res.map((t) => t.closeDate)).toEqual(["2026-03-10", "2026-03-15"]);
  });

  it("combines all axes with AND", () => {
    const res = filterTrades(TRADES, {
      tickers: new Set(["AAPL"]),
      outcomes: new Set(["ClosedProfit"]),
      from: "2025-12-31",
      to: "2026-12-31",
    });
    expect(res).toHaveLength(1);
    expect(res[0].closeDate).toBe("2026-02-10");
  });
});

describe("sortTrades", () => {
  it("sorts by closeDate desc by default, tie-breaks by openDate asc", () => {
    const a = trade("X", "2026-04-01", "Expired", 1, 1, "2025-12-31");
    const b = trade("X", "2026-04-01", "Expired", 1, 1, "2026-02-01");
    const res = sortTrades([b, a], DEFAULT_SORT);
    expect(res.map((t) => t.openDate)).toEqual(["2025-12-31", "2026-02-01"]);
  });

  it("sorts by closeDate asc", () => {
    const res = sortTrades(TRADES, { key: "closeDate", dir: "asc" });
    expect(res.map((t) => t.closeDate)).toEqual([
      "2026-02-10",
      "2026-03-10",
      "2026-03-15",
      "2026-04-01",
    ]);
  });

  it("sorts by daysHeld asc", () => {
    const res = sortTrades(TRADES, { key: "daysHeld", dir: "asc" });
    expect(res.map((t) => t.daysHeld)).toEqual([3, 5, 14, 30]);
  });

  it("sorts by netPnL desc", () => {
    const res = sortTrades(TRADES, { key: "netPnL", dir: "desc" });
    expect(res.map((t) => t.netPnL)).toEqual([50, 25, -40, -120]);
  });
});

describe("parseTradesQuery", () => {
  it("returns empty filter and default sort when params are absent", () => {
    const { filter, sort } = parseTradesQuery(new URLSearchParams(""));
    expect(filter).toEqual({ tickers: new Set(), outcomes: new Set() });
    expect(sort).toEqual({ key: "closeDate", dir: "desc" });
  });

  it("parses all params", () => {
    const sp = new URLSearchParams(
      "ticker=AAPL,NVDA&outcome=Expired,Assigned&from=2025-12-31&to=2026-04-23&sort=netPnL:asc",
    );
    const { filter, sort } = parseTradesQuery(sp);
    expect(filter.tickers).toEqual(new Set(["AAPL", "NVDA"]));
    expect(filter.outcomes).toEqual(new Set(["Expired", "Assigned"]));
    expect(filter.from).toBe("2025-12-31");
    expect(filter.to).toBe("2026-04-23");
    expect(sort).toEqual({ key: "netPnL", dir: "asc" });
  });

  it("ignores malformed outcomes, dates, and sort", () => {
    const sp = new URLSearchParams(
      "outcome=Foo,Expired&from=notadate&sort=bogus:weird",
    );
    const { filter, sort } = parseTradesQuery(sp);
    expect(filter.outcomes).toEqual(new Set(["Expired"]));
    expect(filter.from).toBeUndefined();
    expect(sort).toEqual({ key: "closeDate", dir: "desc" });
  });
});

describe("serializeTradesQuery", () => {
  it("omits default sort and empty filters", () => {
    const qs = serializeTradesQuery(EMPTY, DEFAULT_SORT).toString();
    expect(qs).toBe("");
  });

  it("serializes non-default values", () => {
    const qs = serializeTradesQuery(
      {
        tickers: new Set(["AAPL", "NVDA"]),
        outcomes: new Set(["Expired"]),
        from: "2025-12-31",
      },
      { key: "netPnL", dir: "asc" },
    );
    const s = qs.toString();
    expect(s).toContain("ticker=AAPL%2CNVDA");
    expect(s).toContain("outcome=Expired");
    expect(s).toContain("from=2025-12-31");
    expect(s).toContain("sort=netPnL%3Aasc");
    expect(s).not.toContain("to=");
  });

  it("round-trips through parse", () => {
    const f: TradesFilter = {
      tickers: new Set(["AAPL"]),
      outcomes: new Set(["Assigned", "Expired"]),
      from: "2025-12-31",
      to: "2026-04-23",
    };
    const s: TradesSort = { key: "daysHeld", dir: "asc" };
    const qs = serializeTradesQuery(f, s);
    const back = parseTradesQuery(qs);
    expect(back.filter.tickers).toEqual(f.tickers);
    expect(back.filter.outcomes).toEqual(f.outcomes);
    expect(back.filter.from).toBe(f.from);
    expect(back.filter.to).toBe(f.to);
    expect(back.sort).toEqual(s);
  });
});
