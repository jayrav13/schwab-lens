import { describe, it, expect } from "vitest";
import { openDb } from "@/lib/db/connect";

describe("openDb", () => {
  it("opens an in-memory database that responds to a trivial query", () => {
    const db = openDb(":memory:");
    const row = db.prepare("SELECT 1 + 1 AS two").get() as { two: number };
    expect(row.two).toBe(2);
    db.close();
  });

  it("enables foreign keys by default", () => {
    const db = openDb(":memory:");
    const row = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
    expect(row.foreign_keys).toBe(1);
    db.close();
  });
});
