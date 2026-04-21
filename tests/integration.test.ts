import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseSchwabCsv } from "@/lib/csv/parse";
import { buildPortfolio } from "@/lib/model/portfolio";
import { loadDashboard } from "@/lib/server/dashboard";

describe("integration: real sanitized CSV", () => {
  const csv = readFileSync(
    path.join(__dirname, "fixtures", "real-sanitized.csv"),
    "utf8",
  );
  const txs = parseSchwabCsv(csv);
  const state = buildPortfolio(txs, {
    seedDate: "2026-01-15",
    seedValue: 12345,
  });

  it("parses all 174 data rows", () => {
    expect(txs.length).toBe(174);
  });

  it("final NAV is approximately $28,609.85", () => {
    expect(state.navSeries.at(-1)!.nav).toBeCloseTo(28609.85, 1);
  });

  it("5 open option contracts remain", () => {
    expect(state.openOptionPositions).toHaveLength(5);
  });

  it("open share positions are HL, SOFI, CLSK only", () => {
    const tickers = state.openSharePositions.map((p) => p.ticker).sort();
    expect(tickers).toEqual(["CLSK", "HL", "SOFI"]);
  });

  it("net premium is approximately $3,609", () => {
    expect(state.premiumTotals.net).toBeCloseTo(3609, 0);
  });

  it("no warnings (clean history)", () => {
    expect(state.warnings).toEqual([]);
  });
});

describe("loadDashboard", () => {
  it("returns a tagged-union result reflecting local data/ state", () => {
    const result = loadDashboard();
    expect(["ready", "no-csv", "no-config", "parse-error"]).toContain(
      result.kind,
    );
  });
});
