import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseSchwabCsv } from "@/lib/csv/parse";

function fixture(name: string): string {
  return readFileSync(path.join(__dirname, "..", "fixtures", name), "utf8");
}

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
