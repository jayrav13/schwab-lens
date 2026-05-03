import { describe, it, expect } from "vitest";
import { navSeriesFromSnapshots } from "@/lib/model/metrics/navSeries";
import type { PositionSnapshotRow } from "@/lib/db/repos/positionSnapshots";

function row(overrides: Partial<PositionSnapshotRow>): PositionSnapshotRow {
  return {
    id: 1,
    account_id: 1,
    as_of: "2026-01-05",
    symbol: "ACME",
    description: null,
    quantity: 100,
    price: 50,
    market_value: 5000,
    cost_basis: 5000,
    asset_type: "equity",
    raw: "{}",
    source_file: "snap.csv",
    content_hash: "h1",
    ...overrides,
  };
}

describe("navSeriesFromSnapshots", () => {
  it("returns an empty series for empty input", () => {
    expect(navSeriesFromSnapshots([])).toEqual([]);
  });

  it("sums market_value across rows with the same date", () => {
    const rows = [
      row({ id: 1, as_of: "2026-01-05", symbol: "ACME", market_value: 5000 }),
      row({ id: 2, as_of: "2026-01-05", symbol: "BETA", market_value: 3000 }),
    ];
    expect(navSeriesFromSnapshots(rows)).toEqual([
      { date: "2026-01-05", nav: 8000 },
    ]);
  });

  it("returns one point per unique date, sorted asc", () => {
    const rows = [
      row({ id: 1, as_of: "2026-03-01", symbol: "ACME", market_value: 1500 }),
      row({ id: 2, as_of: "2026-01-15", symbol: "ACME", market_value: 1000 }),
      row({ id: 3, as_of: "2026-02-10", symbol: "ACME", market_value: 1200 }),
    ];
    expect(navSeriesFromSnapshots(rows)).toEqual([
      { date: "2026-01-15", nav: 1000 },
      { date: "2026-02-10", nav: 1200 },
      { date: "2026-03-01", nav: 1500 },
    ]);
  });

  it("treats null market_value as 0", () => {
    const rows = [
      row({ id: 1, as_of: "2026-01-15", symbol: "ACME", market_value: 1000 }),
      row({ id: 2, as_of: "2026-01-15", symbol: "Cash", market_value: null }),
    ];
    expect(navSeriesFromSnapshots(rows)).toEqual([
      { date: "2026-01-15", nav: 1000 },
    ]);
  });

  it("re-ingest with later id replaces earlier rows for the same (date, symbol)", () => {
    const rows = [
      row({ id: 1, as_of: "2026-01-15", symbol: "ACME", market_value: 1000 }),
      row({ id: 2, as_of: "2026-01-15", symbol: "ACME", market_value: 1100 }),
    ];
    expect(navSeriesFromSnapshots(rows)).toEqual([
      { date: "2026-01-15", nav: 1100 },
    ]);
  });
});
