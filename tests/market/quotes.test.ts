import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fetchQuotes } from "@/lib/market/quotes";

const cacheDir = path.join(process.cwd(), ".cache");

describe("fetchQuotes", () => {
  beforeEach(() => {
    if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true });
  });

  afterEach(() => {
    if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true });
  });

  it("fetches uncached tickers via the injected fetcher", async () => {
    const calls: string[] = [];
    const results = await fetchQuotes(["AAA", "BBB"], {
      fetchOne: async (t) => {
        calls.push(t);
        return { price: t === "AAA" ? 10 : 20 };
      },
    });
    expect(calls.sort()).toEqual(["AAA", "BBB"]);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.kind === "ok")).toBe(true);
  });

  it("uses the cache on the second call within TTL", async () => {
    const first = await fetchQuotes(["AAA"], {
      fetchOne: async () => ({ price: 10 }),
    });
    expect(first[0].kind).toBe("ok");

    let called = false;
    const second = await fetchQuotes(["AAA"], {
      fetchOne: async () => {
        called = true;
        return { price: 999 };
      },
      ttlMs: 60_000,
    });
    expect(called).toBe(false);
    if (second[0].kind === "ok") {
      expect(second[0].quote.price).toBe(10);
      expect(second[0].quote.stale).toBe(false);
    }
  });

  it("returns stale cached quote when the live fetch fails", async () => {
    await fetchQuotes(["AAA"], { fetchOne: async () => ({ price: 10 }) });

    // Force a cache miss by setting TTL to 0 so the cached entry is "expired"
    const results = await fetchQuotes(["AAA"], {
      ttlMs: 0,
      fetchOne: async () => {
        throw new Error("network down");
      },
    });
    expect(results[0].kind).toBe("ok");
    if (results[0].kind === "ok") {
      expect(results[0].quote.stale).toBe(true);
      expect(results[0].quote.price).toBe(10);
    }
  });

  it("returns error when no cache and fetch fails", async () => {
    const results = await fetchQuotes(["AAA"], {
      fetchOne: async () => {
        throw new Error("boom");
      },
    });
    expect(results[0].kind).toBe("error");
  });

  it("persists the cache to .cache/quotes.json", async () => {
    await fetchQuotes(["AAA"], { fetchOne: async () => ({ price: 42 }) });
    const cacheFile = path.join(cacheDir, "quotes.json");
    expect(existsSync(cacheFile)).toBe(true);
    const parsed = JSON.parse(readFileSync(cacheFile, "utf8"));
    expect(parsed.quotes.AAA.price).toBe(42);
  });
});
