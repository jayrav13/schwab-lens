import { describe, it, expect } from "vitest";
import path from "node:path";
import { openDb, type Db } from "@/lib/db/connect";
import { runMigrations } from "@/lib/db/migrate";
import { upsertAccount } from "@/lib/db/repos/accounts";
import { configureAccount } from "@/lib/scripts/accountConfigure";
import { formatAccountShow } from "@/lib/scripts/accountShow";

function freshDb(): Db {
  const db = openDb(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

describe("formatAccountShow", () => {
  it("includes every configurable field for an unconfigured account", () => {
    const db = freshDb();
    upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "Demo" });
    const out = formatAccountShow(db, "schwab:999");
    expect(out).toContain("brokerage_slug:");
    expect(out).toContain("external_id:");
    expect(out).toContain("label:                 Demo");
    expect(out).toContain("seed_date:             (unset)");
    expect(out).toContain("seed_value:            (unset)");
    expect(out).toContain("benchmark:             (unset)");
    expect(out).toContain("expected_real_return:  (unset)");
    expect(out).toContain("target_value:          (unset)");
    expect(out).toContain("account_group:         (unset)");
  });

  it("shows configured field values", () => {
    const db = freshDb();
    upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "Demo" });
    configureAccount(db, {
      account: "schwab:999",
      seedDate: "2026-01-15",
      seedValue: 12345,
      benchmark: "SPY",
      expectedRealReturn: 0.07,
      targetValue: 1_000_000,
      accountGroup: "Managed",
    });
    const out = formatAccountShow(db, "schwab:999");
    expect(out).toContain("seed_date:             2026-01-15");
    expect(out).toContain("seed_value:            12345");
    expect(out).toContain("benchmark:             SPY");
    expect(out).toContain("expected_real_return:  0.07");
    expect(out).toContain("target_value:          1000000");
    expect(out).toContain("account_group:         Managed");
  });

  it("throws for unknown account", () => {
    expect(() => formatAccountShow(freshDb(), "schwab:000")).toThrow(/No account/);
  });

  it("throws on malformed --account", () => {
    expect(() => formatAccountShow(freshDb(), "bad-format")).toThrow(/format/i);
  });
});
