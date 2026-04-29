import { describe, it, expect } from "vitest";
import {
  transactionFromRow,
  positionsSnapshotFromRows,
  actionFromCanonical,
} from "@/lib/model/fromDb";
import type { TransactionRow } from "@/lib/db/repos/transactions";
import type { PositionSnapshotRow } from "@/lib/db/repos/positionSnapshots";

const baseTxRow: TransactionRow = {
  id: 1,
  account_id: 1,
  trade_date: "2026-01-05",
  action_canonical: "BUY",
  action_raw: "Buy",
  symbol: "ACME",
  description: "ACME CORP",
  quantity: 100,
  price: 50,
  fees: 0,
  amount: -5000,
  raw: JSON.stringify({
    Date: "01/05/2026",
    Action: "Buy",
    Symbol: "ACME",
    Description: "ACME CORP",
    Quantity: "100",
    Price: "$50.00",
    "Fees & Comm": "$0.00",
    Amount: "-$5000.00",
  }),
  source_file: "demo.csv",
  content_hash: "abc",
};

describe("actionFromCanonical", () => {
  it("maps BUY to Buy", () => {
    expect(actionFromCanonical("BUY", "Buy")).toBe("Buy");
  });

  it("maps SELL_TO_OPEN to SellToOpen", () => {
    expect(actionFromCanonical("SELL_TO_OPEN", "Sell to Open")).toBe(
      "SellToOpen",
    );
  });

  it("maps DIVIDEND to QualifiedDividend", () => {
    expect(actionFromCanonical("DIVIDEND", "Qualified Dividend")).toBe(
      "QualifiedDividend",
    );
  });

  it("maps INTEREST to BankInterest", () => {
    expect(actionFromCanonical("INTEREST", "Bank Interest")).toBe(
      "BankInterest",
    );
  });

  it("maps JOURNAL to Journal", () => {
    expect(actionFromCanonical("JOURNAL", "Journal")).toBe("Journal");
  });

  it("falls back to Unknown for UNKNOWN", () => {
    expect(actionFromCanonical("UNKNOWN", "Some weird action")).toBe(
      "Unknown",
    );
  });
});

describe("transactionFromRow", () => {
  it("maps a Buy row to a legacy Transaction with ticker", () => {
    const tx = transactionFromRow(baseTxRow);
    expect(tx.tradeDate).toBe("2026-01-05");
    expect(tx.action).toBe("Buy");
    expect(tx.ticker).toBe("ACME");
    expect(tx.option).toBeUndefined();
    expect(tx.quantity).toBe(100);
    expect(tx.price).toBe(50);
    expect(tx.fees).toBe(0);
    expect(tx.amount).toBe(-5000);
    expect(tx.rawAction).toBe("Buy");
  });

  it("maps a Sell-to-Open option row to a Transaction with option leg", () => {
    const tx = transactionFromRow({
      ...baseTxRow,
      action_canonical: "SELL_TO_OPEN",
      action_raw: "Sell to Open",
      symbol: "ACME 03/15/2026 100.00 P",
      description: "PUT ACME CORP $100 EXP 03/15/26",
      quantity: 1,
      price: 1.5,
      amount: 150,
    });
    expect(tx.action).toBe("SellToOpen");
    expect(tx.ticker).toBeUndefined();
    expect(tx.option).toEqual({
      ticker: "ACME",
      expiry: "2026-03-15",
      strike: 100,
      type: "Put",
    });
  });

  it("preserves raw fields for downstream warning rendering", () => {
    const tx = transactionFromRow(baseTxRow);
    expect(tx.raw.Symbol).toBe("ACME");
    expect(tx.raw.Action).toBe("Buy");
  });

  it("treats null quantity as 0", () => {
    const tx = transactionFromRow({ ...baseTxRow, quantity: null });
    expect(tx.quantity).toBe(0);
  });
});

describe("positionsSnapshotFromRows", () => {
  const snapDate = "2026-04-25";
  const equityRow: PositionSnapshotRow = {
    id: 1,
    account_id: 1,
    as_of: snapDate,
    symbol: "ACME",
    description: "ACME CORP",
    quantity: 100,
    price: 50,
    market_value: 5000,
    cost_basis: 4500,
    asset_type: "equity",
    raw: JSON.stringify({}),
    source_file: "snap.csv",
    content_hash: "h",
  };
  const optionRow: PositionSnapshotRow = {
    ...equityRow,
    id: 2,
    symbol: "ACME 03/15/2026 100.00 P",
    description: "PUT ACME CORP",
    quantity: -1,
    price: 1.5,
    market_value: -150,
    cost_basis: 0,
    asset_type: "option",
  };
  const cashRow: PositionSnapshotRow = {
    ...equityRow,
    id: 3,
    symbol: "Cash & Cash Investments",
    description: null,
    quantity: null,
    price: null,
    market_value: 1234.56,
    cost_basis: null,
    asset_type: "cash",
  };

  it("groups rows by asset type", () => {
    const snap = positionsSnapshotFromRows(snapDate, [
      equityRow,
      optionRow,
      cashRow,
    ]);
    expect(snap.asOf).toBe(snapDate);
    expect(snap.cash).toBeCloseTo(1234.56, 2);
    expect(snap.shares).toHaveLength(1);
    expect(snap.shares[0].ticker).toBe("ACME");
    expect(snap.options).toHaveLength(1);
    expect(snap.options[0].underlying).toBe("ACME");
    expect(snap.options[0].callPut).toBe("P");
  });

  it("computes totalValue from row market_values", () => {
    const snap = positionsSnapshotFromRows(snapDate, [equityRow, cashRow]);
    expect(snap.totalValue).toBeCloseTo(5000 + 1234.56, 2);
  });
});
