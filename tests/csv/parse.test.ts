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
