import { describe, it, expect, afterEach } from "vitest";
import { unlinkSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDb, closeDb } from "@/lib/db/connection";

const TEST_DB = path.join(os.tmpdir(), `test-connection-${process.pid}.db`);

afterEach(() => {
  closeDb();
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

describe("getDb", () => {
  it("opens a database file at the given path", () => {
    const db = getDb(TEST_DB);
    expect(db.open).toBe(true);
  });

  it("returns the same instance on second call with same path", () => {
    const a = getDb(TEST_DB);
    const b = getDb(TEST_DB);
    expect(a).toBe(b);
  });
});
