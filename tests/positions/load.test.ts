import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadPositionsFromDir } from "@/lib/positions/load";

function tmpDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "positions-load-"));
}

function fixture(name: string): string {
  return readFileSync(
    path.join(__dirname, "..", "fixtures", "positions", name),
    "utf8",
  );
}

describe("loadPositionsFromDir", () => {
  it("returns empty array when the directory does not exist", () => {
    const missing = path.join(os.tmpdir(), "does-not-exist-" + Date.now());
    expect(loadPositionsFromDir(missing)).toEqual([]);
  });

  it("returns empty array when the directory is empty", () => {
    expect(loadPositionsFromDir(tmpDir())).toEqual([]);
  });

  it("loads and sorts snapshots by asOf ascending", () => {
    const dir = tmpDir();
    writeFileSync(
      path.join(dir, "Demo-Positions-2026-03-11-090000.csv"),
      fixture("positions-day-2.csv"),
    );
    writeFileSync(
      path.join(dir, "Demo-Positions-2026-03-10-090000.csv"),
      fixture("positions-day-1.csv"),
    );
    const snapshots = loadPositionsFromDir(dir);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].asOf).toBe("2026-03-10T09:00");
    expect(snapshots[1].asOf).toBe("2026-03-11T09:00");
  });

  it("throws when two snapshots have identical asOf", () => {
    const dir = tmpDir();
    writeFileSync(
      path.join(dir, "a.csv"),
      fixture("positions-day-1.csv"),
    );
    writeFileSync(
      path.join(dir, "b.csv"),
      fixture("positions-day-1.csv"),
    );
    expect(() => loadPositionsFromDir(dir)).toThrow(/duplicate asOf/);
  });

  it("throws when filename timestamp disagrees with header asOf", () => {
    const dir = tmpDir();
    writeFileSync(
      path.join(dir, "Demo-Positions-2026-03-20-090000.csv"),
      fixture("positions-day-1.csv"),
    );
    expect(() => loadPositionsFromDir(dir)).toThrow(/disagree/);
  });
});
