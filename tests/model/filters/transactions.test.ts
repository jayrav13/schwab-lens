import { describe, it, expect } from "vitest";
import type { Transaction, Action, RawCsvRow } from "@/lib/csv/types";
import {
  filterTransactions,
  sortTransactions,
  parseTransactionsQuery,
  serializeTransactionsQuery,
  type TransactionsFilter,
  type TransactionsSort,
} from "@/lib/model/filters/transactions";

const EMPTY_RAW: RawCsvRow = {
  Date: "",
  Action: "",
  Symbol: "",
  Description: "",
  Quantity: "",
  Price: "",
  "Fees & Comm": "",
  Amount: "",
};

function tx(
  tradeDate: string,
  action: Action,
  ticker: string | undefined,
  amount: number,
  description = "",
): Transaction {
  return {
    tradeDate,
    action,
    ticker,
    quantity: 0,
    fees: 0,
    amount,
    raw: { ...EMPTY_RAW, Date: tradeDate, Action: action, Description: description },
    rawAction: action,
  };
}

const TXS: Transaction[] = [
  tx("2026-01-10", "SellToOpen", "AAPL", 120, "sold calls"),
  tx("2026-02-15", "BuyToClose", "AAPL", -40, "bought back"),
  tx("2026-03-01", "QualifiedDividend", "NVDA", 2.5, "ORD DIVIDEND"),
  tx("2026-03-20", "BankInterest", undefined, 0.25, "CREDIT INTEREST"),
];

const EMPTY: TransactionsFilter = {
  actions: new Set(),
  tickers: new Set(),
  q: "",
};
const DEFAULT_SORT: TransactionsSort = { key: "tradeDate", dir: "desc" };

describe("filterTransactions", () => {
  it("returns all when filter is empty", () => {
    expect(filterTransactions(TXS, EMPTY)).toHaveLength(4);
  });

  it("filters by action set", () => {
    const res = filterTransactions(TXS, {
      ...EMPTY,
      actions: new Set(["SellToOpen", "BuyToClose"]),
    });
    expect(res).toHaveLength(2);
  });

  it("filters by ticker set (missing ticker excluded when set is non-empty)", () => {
    const res = filterTransactions(TXS, { ...EMPTY, tickers: new Set(["NVDA"]) });
    expect(res.map((t) => t.ticker)).toEqual(["NVDA"]);
  });

  it("filters by from/to range on tradeDate inclusively", () => {
    const res = filterTransactions(TXS, {
      ...EMPTY,
      from: "2026-02-01",
      to: "2026-03-10",
    });
    expect(res.map((t) => t.tradeDate)).toEqual(["2026-02-15", "2026-03-01"]);
  });

  it("searches ticker + description case-insensitively", () => {
    const res = filterTransactions(TXS, { ...EMPTY, q: "INTEREST" });
    expect(res).toHaveLength(1);
    expect(res[0].action).toBe("BankInterest");
  });

  it("combines all axes with AND", () => {
    const res = filterTransactions(TXS, {
      actions: new Set(["QualifiedDividend", "BankInterest"]),
      tickers: new Set(),
      from: "2026-03-01",
      to: "2026-03-31",
      q: "dividend",
    });
    expect(res).toHaveLength(1);
    expect(res[0].ticker).toBe("NVDA");
  });
});

describe("sortTransactions", () => {
  it("sorts by tradeDate desc by default", () => {
    const res = sortTransactions(TXS, DEFAULT_SORT);
    expect(res.map((t) => t.tradeDate)).toEqual([
      "2026-03-20",
      "2026-03-01",
      "2026-02-15",
      "2026-01-10",
    ]);
  });

  it("sorts by amount asc", () => {
    const res = sortTransactions(TXS, { key: "amount", dir: "asc" });
    expect(res.map((t) => t.amount)).toEqual([-40, 0.25, 2.5, 120]);
  });
});

describe("parseTransactionsQuery / serializeTransactionsQuery", () => {
  it("defaults to empty filter + default sort", () => {
    const { filter, sort } = parseTransactionsQuery(new URLSearchParams(""));
    expect(filter).toEqual({ actions: new Set(), tickers: new Set(), q: "" });
    expect(sort).toEqual(DEFAULT_SORT);
  });

  it("parses all params and ignores unknown actions", () => {
    const sp = new URLSearchParams(
      "action=SellToOpen,BogusAction,BuyToClose&ticker=AAPL&from=2026-01-01&to=2026-04-23&q=dividend&sort=amount:asc",
    );
    const { filter, sort } = parseTransactionsQuery(sp);
    expect(filter.actions).toEqual(new Set(["SellToOpen", "BuyToClose"]));
    expect(filter.tickers).toEqual(new Set(["AAPL"]));
    expect(filter.from).toBe("2026-01-01");
    expect(filter.to).toBe("2026-04-23");
    expect(filter.q).toBe("dividend");
    expect(sort).toEqual({ key: "amount", dir: "asc" });
  });

  it("round-trips", () => {
    const f: TransactionsFilter = {
      actions: new Set(["SellToOpen"]),
      tickers: new Set(["AAPL", "NVDA"]),
      from: "2026-01-01",
      to: "2026-04-23",
      q: "hello",
    };
    const s: TransactionsSort = { key: "tradeDate", dir: "asc" };
    const back = parseTransactionsQuery(serializeTransactionsQuery(f, s));
    expect(back.filter.actions).toEqual(f.actions);
    expect(back.filter.tickers).toEqual(f.tickers);
    expect(back.filter.from).toBe(f.from);
    expect(back.filter.to).toBe(f.to);
    expect(back.filter.q).toBe(f.q);
    expect(back.sort).toEqual(s);
  });
});
