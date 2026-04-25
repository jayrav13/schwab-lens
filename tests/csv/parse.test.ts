import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseSchwabCsv } from "@/lib/csv/parse";

function fixture(name: string): string {
  return readFileSync(path.join(__dirname, "..", "fixtures", name), "utf8");
}

describe("parseSchwabCsv — other option actions", () => {
  const txs = parseSchwabCsv(fixture("option-actions.csv"));

  it("parses Buy to Close with negative amount", () => {
    const btc = txs[0];
    expect(btc.action).toBe("BuyToClose");
    expect(btc.option?.type).toBe("Call");
    expect(btc.option?.strike).toBe(21);
    expect(btc.amount).toBe(-8.02);
    expect(btc.fees).toBe(0.02);
  });

  it("parses Expired with empty money fields and 'as of' trade date", () => {
    const exp = txs[1];
    expect(exp.action).toBe("Expired");
    expect(exp.tradeDate).toBe("2026-04-17");
    expect(exp.amount).toBe(0);
    expect(exp.fees).toBe(0);
    expect(exp.price).toBeUndefined();
  });

  it("parses Assigned with empty money fields and 'as of' trade date", () => {
    const asgn = txs[2];
    expect(asgn.action).toBe("Assigned");
    expect(asgn.tradeDate).toBe("2026-01-30");
    expect(asgn.option?.ticker).toBe("CLSK");
    expect(asgn.quantity).toBe(2);
    expect(asgn.amount).toBe(0);
  });
});

describe("parseSchwabCsv — stock Buy/Sell", () => {
  const txs = parseSchwabCsv(fixture("stock-actions.csv"));

  it("parses a stock Buy row", () => {
    const t = txs[0];
    expect(t.action).toBe("Buy");
    expect(t.ticker).toBe("AG");
    expect(t.option).toBeUndefined();
    expect(t.quantity).toBe(100);
    expect(t.price).toBe(25);
    expect(t.amount).toBe(-2500);
  });

  it("parses a stock Sell row", () => {
    const t = txs[1];
    expect(t.action).toBe("Sell");
    expect(t.ticker).toBe("AG");
    expect(t.option).toBeUndefined();
    expect(t.quantity).toBe(100);
    expect(t.amount).toBe(2499.98);
    expect(t.fees).toBe(0.02);
  });
});

describe("parseSchwabCsv — cash rows", () => {
  const txs = parseSchwabCsv(fixture("cash-rows.csv"));

  it("maps Journal and Wire Sent actions", () => {
    expect(txs[0].action).toBe("Journal");
    expect(txs[0].amount).toBe(5000);
    expect(txs[1].action).toBe("WireSent");
    expect(txs[1].amount).toBe(-5000);
  });

  it("maps Misc Cash Entry and Service Fee", () => {
    expect(txs[2].action).toBe("MiscCashEntry");
    expect(txs[3].action).toBe("ServiceFee");
    expect(txs[3].amount).toBe(-15);
  });

  it("maps Qualified Dividend and retains ticker", () => {
    expect(txs[4].action).toBe("QualifiedDividend");
    expect(txs[4].ticker).toBe("HL");
    expect(txs[4].amount).toBe(0.75);
  });

  it("maps Bank Interest and Credit Interest with empty tickers", () => {
    expect(txs[5].action).toBe("BankInterest");
    expect(txs[5].ticker).toBeUndefined();
    expect(txs[6].action).toBe("CreditInterest");
  });
});

describe("parseSchwabCsv — Sell to Open", () => {
  it("parses one STO row", () => {
    const txs = parseSchwabCsv(fixture("simple-sto.csv"));
    expect(txs).toHaveLength(1);
    const t = txs[0];
    expect(t.tradeDate).toBe("2026-04-20");
    expect(t.action).toBe("SellToOpen");
    expect(t.option).toEqual({
      ticker: "IREN",
      expiry: "2026-04-24",
      strike: 42.5,
      type: "Put",
    });
    expect(t.ticker).toBe("IREN");
    expect(t.quantity).toBe(1);
    expect(t.price).toBe(0.4);
    expect(t.fees).toBe(0.66);
    expect(t.amount).toBe(39.34);
  });
});

describe("parseSchwabCsv — unknown action", () => {
  it("maps an unknown action to 'Unknown' and preserves the raw label", () => {
    const txs = parseSchwabCsv(fixture("unknown-action.csv"));
    expect(txs).toHaveLength(1);
    expect(txs[0].action).toBe("Unknown");
    expect(txs[0].rawAction).toBe("Merger Adjustment");
    expect(txs[0].amount).toBe(123.45);
  });
});
