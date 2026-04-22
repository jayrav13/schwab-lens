import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parsePositionsCsv } from "@/lib/positions/parse";

function fixture(name: string): string {
  return readFileSync(
    path.join(__dirname, "..", "fixtures", "positions", name),
    "utf8",
  );
}

describe("parsePositionsCsv", () => {
  const snap = parsePositionsCsv(
    fixture("positions-basic.csv"),
    "positions-basic.csv",
  );

  it("parses asOf from the header line", () => {
    expect(snap.asOf).toBe("2026-03-15T15:14");
  });

  it("parses cash from the Cash & Cash Investments row", () => {
    expect(snap.cash).toBe(10200);
  });

  it("parses total value from the Positions Total row", () => {
    expect(snap.totalValue).toBe(15000);
  });

  it("parses share lots", () => {
    expect(snap.shares).toEqual([
      {
        ticker: "ACME",
        quantity: 100,
        price: 50,
        marketValue: 5000,
        costBasis: 48,
      },
    ]);
  });

  it("parses short option contracts", () => {
    expect(snap.options).toHaveLength(2);
    const call = snap.options.find((o) => o.callPut === "C")!;
    expect(call).toMatchObject({
      underlying: "ACME",
      expiry: "2026-04-17",
      strike: 55,
      callPut: "C",
      quantity: -1,
      price: 1.2,
      marketValue: -120,
    });
    expect(call.delta).toBeCloseTo(0.35);
    expect(call.theta).toBeCloseTo(-0.02);
  });

  it("stores the source filename", () => {
    expect(snap.sourceFile).toBe("positions-basic.csv");
  });

  it("throws a clear error when the cash row is missing", () => {
    expect(() =>
      parsePositionsCsv(
        fixture("positions-missing-cash.csv"),
        "positions-missing-cash.csv",
      ),
    ).toThrow(/Cash & Cash Investments/);
  });
});
