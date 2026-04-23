import { describe, it, expect, afterEach, beforeEach } from "vitest";
import {
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { loadHistoricalCloses } from "@/lib/market/historical";

const cacheDir = path.join(process.cwd(), ".cache", "market", "historical-test");

describe("loadHistoricalCloses", () => {
  beforeEach(() => {
    if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true });
  });

  afterEach(() => {
    if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true });
  });

  it("fetches the full range and writes a per-ticker cache when none exists", async () => {
    const calls: Array<{ ticker: string; from: string; to: string }> = [];
    const result = await loadHistoricalCloses("AAA", "2026-01-02", "2026-01-06", {
      cacheDir,
      fetchRange: async (ticker, from, to) => {
        calls.push({ ticker, from, to });
        return [
          { date: "2026-01-02", close: 10 },
          { date: "2026-01-05", close: 11 },
          { date: "2026-01-06", close: 12 },
        ];
      },
    });

    expect(calls).toEqual([
      { ticker: "AAA", from: "2026-01-02", to: "2026-01-06" },
    ]);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.closes).toEqual([
      { date: "2026-01-02", close: 10 },
      { date: "2026-01-05", close: 11 },
      { date: "2026-01-06", close: 12 },
    ]);

    const cacheFile = path.join(cacheDir, "AAA.json");
    expect(existsSync(cacheFile)).toBe(true);
    expect(JSON.parse(readFileSync(cacheFile, "utf8"))).toEqual({
      "2026-01-02": 10,
      "2026-01-05": 11,
      "2026-01-06": 12,
    });
  });

  it("skips the fetcher when the cache already covers the requested toDate", async () => {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      path.join(cacheDir, "BBB.json"),
      JSON.stringify({ "2026-01-02": 20, "2026-01-06": 25 }),
    );

    let called = false;
    const result = await loadHistoricalCloses("BBB", "2026-01-02", "2026-01-06", {
      cacheDir,
      fetchRange: async () => {
        called = true;
        return [];
      },
    });

    expect(called).toBe(false);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.closes).toEqual([
      { date: "2026-01-02", close: 20 },
      { date: "2026-01-06", close: 25 },
    ]);
  });

  it("fetches only the tail when cache is partial", async () => {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      path.join(cacheDir, "CCC.json"),
      JSON.stringify({ "2026-01-02": 30, "2026-01-05": 31 }),
    );

    const calls: Array<{ from: string; to: string }> = [];
    const result = await loadHistoricalCloses("CCC", "2026-01-02", "2026-01-08", {
      cacheDir,
      fetchRange: async (_t, from, to) => {
        calls.push({ from, to });
        return [
          { date: "2026-01-05", close: 31 },
          { date: "2026-01-06", close: 32 },
          { date: "2026-01-07", close: 33 },
          { date: "2026-01-08", close: 34 },
        ];
      },
    });

    expect(calls).toEqual([{ from: "2026-01-05", to: "2026-01-08" }]);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.closes).toEqual([
      { date: "2026-01-02", close: 30 },
      { date: "2026-01-05", close: 31 },
      { date: "2026-01-06", close: 32 },
      { date: "2026-01-07", close: 33 },
      { date: "2026-01-08", close: 34 },
    ]);
  });

  it("treats a malformed cache file as empty and refetches", async () => {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(path.join(cacheDir, "DDD.json"), "{not valid json");

    const result = await loadHistoricalCloses("DDD", "2026-01-02", "2026-01-03", {
      cacheDir,
      fetchRange: async () => [{ date: "2026-01-02", close: 40 }],
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.closes).toEqual([{ date: "2026-01-02", close: 40 }]);
  });

  it("returns an error when the fetcher throws and no cache exists", async () => {
    const result = await loadHistoricalCloses("EEE", "2026-01-02", "2026-01-03", {
      cacheDir,
      fetchRange: async () => {
        throw new Error("network down");
      },
    });

    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.ticker).toBe("EEE");
    expect(result.message).toMatch(/network down/);
  });

  it("returns stale cache when the fetcher throws but cache has data in range", async () => {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      path.join(cacheDir, "FFF.json"),
      JSON.stringify({ "2026-01-02": 50 }),
    );

    const result = await loadHistoricalCloses("FFF", "2026-01-02", "2026-01-05", {
      cacheDir,
      fetchRange: async () => {
        throw new Error("rate limited");
      },
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.stale).toBe(true);
    expect(result.closes).toEqual([{ date: "2026-01-02", close: 50 }]);
  });

  it("writes cache atomically via a .tmp sibling + rename", async () => {
    await loadHistoricalCloses("GGG", "2026-01-02", "2026-01-02", {
      cacheDir,
      fetchRange: async () => [{ date: "2026-01-02", close: 60 }],
    });

    expect(existsSync(path.join(cacheDir, "GGG.json"))).toBe(true);
    expect(existsSync(path.join(cacheDir, "GGG.json.tmp"))).toBe(false);
  });
});
