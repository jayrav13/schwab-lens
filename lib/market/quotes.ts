import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

export type Quote = {
  ticker: string;
  price: number;
  asOf: string;   // ISO timestamp when quote was fetched
  stale?: boolean; // true if served from cache after a failed live fetch
};

export type QuoteResult =
  | { kind: "ok"; quote: Quote }
  | { kind: "error"; ticker: string; message: string };

type CacheFile = {
  quotes: Record<string, Quote>;
};

const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes

function cachePath(): string {
  return path.join(process.cwd(), ".cache", "quotes.json");
}

function readCache(): CacheFile {
  const p = cachePath();
  if (!existsSync(p)) return { quotes: {} };
  try {
    return JSON.parse(readFileSync(p, "utf8")) as CacheFile;
  } catch {
    return { quotes: {} };
  }
}

function writeCache(cache: CacheFile): void {
  const p = cachePath();
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(cache, null, 2));
}

function isFresh(quote: Quote, ttlMs: number): boolean {
  const age = Date.now() - Date.parse(quote.asOf);
  return age >= 0 && age < ttlMs;
}

/**
 * Fetch the current quote for each ticker, using the file cache when fresh.
 *
 * Injected `fetchOne` lets tests mock without hitting the network.
 * Default impl uses yahoo-finance2.
 */
export async function fetchQuotes(
  tickers: string[],
  opts: {
    ttlMs?: number;
    fetchOne?: (ticker: string) => Promise<{ price: number }>;
  } = {},
): Promise<QuoteResult[]> {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const fetcher = opts.fetchOne ?? defaultYahooFetch;

  const cache = readCache();
  const results: QuoteResult[] = [];
  let cacheDirty = false;

  for (const ticker of Array.from(new Set(tickers))) {
    const cached = cache.quotes[ticker];
    if (cached && isFresh(cached, ttlMs)) {
      results.push({ kind: "ok", quote: { ...cached, stale: false } });
      continue;
    }

    try {
      const { price } = await fetcher(ticker);
      const quote: Quote = {
        ticker,
        price,
        asOf: new Date().toISOString(),
        stale: false,
      };
      cache.quotes[ticker] = { ticker, price, asOf: quote.asOf };
      cacheDirty = true;
      results.push({ kind: "ok", quote });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (cached) {
        // Fall back to stale cache
        results.push({
          kind: "ok",
          quote: { ...cached, stale: true },
        });
      } else {
        results.push({ kind: "error", ticker, message });
      }
    }
  }

  if (cacheDirty) writeCache(cache);
  return results;
}

type YahooLike = {
  quote: (symbol: string) => Promise<{ regularMarketPrice?: number }>;
};

let yahooInstance: YahooLike | null = null;

async function getYahoo(): Promise<YahooLike> {
  if (yahooInstance) return yahooInstance;
  const yf = await import("yahoo-finance2");
  const YahooFinance = yf.default as unknown as new (opts?: {
    suppressNotices?: string[];
  }) => YahooLike;
  yahooInstance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  return yahooInstance;
}

async function defaultYahooFetch(ticker: string): Promise<{ price: number }> {
  // yahoo-finance2 v3+ requires an instance; handles cookie/crumb dance internally.
  const yahoo = await getYahoo();
  const q = await yahoo.quote(ticker);
  const price = q.regularMarketPrice;
  if (typeof price !== "number" || !Number.isFinite(price)) {
    throw new Error(`No price returned for ${ticker}`);
  }
  return { price };
}
