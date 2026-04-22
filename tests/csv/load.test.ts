import { describe, it, expect } from "vitest";
import { mkdtempSync, copyFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadTransactionsFromDir } from "@/lib/csv/load";

function tmpDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "txs-load-"));
}

const fixturesDir = path.join(
  __dirname,
  "..",
  "fixtures",
  "transactions-overlap",
);

describe("loadTransactionsFromDir", () => {
  it("returns empty array when dir missing or empty", () => {
    expect(loadTransactionsFromDir(path.join(os.tmpdir(), "nope-" + Date.now()))).toEqual([]);
    expect(loadTransactionsFromDir(tmpDir())).toEqual([]);
  });

  it("unions and deduplicates across overlapping exports", () => {
    const dir = tmpDir();
    copyFileSync(path.join(fixturesDir, "overlap-a.csv"), path.join(dir, "a.csv"));
    copyFileSync(path.join(fixturesDir, "overlap-b.csv"), path.join(dir, "b.csv"));

    const txs = loadTransactionsFromDir(dir);
    expect(txs).toHaveLength(3);

    expect(txs[0].tradeDate).toBe("2026-02-05");
    expect(txs[1].tradeDate).toBe("2026-02-10");
    expect(txs[2].tradeDate).toBe("2026-02-15");
  });

  it("is idempotent under ordering — b.csv first gives same result", () => {
    const dir = tmpDir();
    copyFileSync(path.join(fixturesDir, "overlap-b.csv"), path.join(dir, "a.csv"));
    copyFileSync(path.join(fixturesDir, "overlap-a.csv"), path.join(dir, "b.csv"));
    const txs = loadTransactionsFromDir(dir);
    expect(txs).toHaveLength(3);
  });
});
