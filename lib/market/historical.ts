import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export type HistoricalClose = { date: string; close: number };

export type HistoricalFetchResult =
  | { kind: "ok"; closes: HistoricalClose[]; stale?: boolean }
  | { kind: "error"; ticker: string; message: string };

type CacheFile = Record<string, number>;

function defaultCacheDir(): string {
  return path.join(process.cwd(), ".cache", "market", "historical");
}

function cachePath(cacheDir: string, ticker: string): string {
  return path.join(cacheDir, `${ticker}.json`);
}

function readCache(cacheDir: string, ticker: string): CacheFile {
  const p = cachePath(cacheDir, ticker);
  if (!existsSync(p)) return {};
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as CacheFile;
    }
    return {};
  } catch {
    return {};
  }
}

function writeCacheAtomic(
  cacheDir: string,
  ticker: string,
  cache: CacheFile,
): void {
  mkdirSync(cacheDir, { recursive: true });
  const p = cachePath(cacheDir, ticker);
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(cache, null, 2));
  renameSync(tmp, p);
}

function datesInRange(
  cache: CacheFile,
  fromDate: string,
  toDate: string,
): string[] {
  return Object.keys(cache)
    .filter((d) => d >= fromDate && d <= toDate)
    .sort();
}

function slice(
  cache: CacheFile,
  fromDate: string,
  toDate: string,
): HistoricalClose[] {
  return datesInRange(cache, fromDate, toDate).map((date) => ({
    date,
    close: cache[date],
  }));
}

export async function loadHistoricalCloses(
  ticker: string,
  fromDate: string,
  toDate: string,
  opts: {
    cacheDir?: string;
    fetchRange?: (
      ticker: string,
      fromDate: string,
      toDate: string,
    ) => Promise<HistoricalClose[]>;
  } = {},
): Promise<HistoricalFetchResult> {
  const cacheDir = opts.cacheDir ?? defaultCacheDir();
  const fetcher = opts.fetchRange ?? defaultYahooHistorical;

  const cache = readCache(cacheDir, ticker);

  const cachedInRange = datesInRange(cache, fromDate, toDate);
  const maxCached = cachedInRange.at(-1);
  const needsFetch = !maxCached || maxCached < toDate;

  if (!needsFetch) {
    return { kind: "ok", closes: slice(cache, fromDate, toDate) };
  }

  const fetchStart = maxCached ?? fromDate;
  try {
    const fetched = await fetcher(ticker, fetchStart, toDate);
    for (const { date, close } of fetched) {
      cache[date] = close;
    }
    writeCacheAtomic(cacheDir, ticker, cache);
    return { kind: "ok", closes: slice(cache, fromDate, toDate) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (cachedInRange.length > 0) {
      return {
        kind: "ok",
        stale: true,
        closes: slice(cache, fromDate, toDate),
      };
    }
    return { kind: "error", ticker, message };
  }
}

type YahooLike = {
  historical: (
    symbol: string,
    opts: { period1: string; period2: string; interval: "1d" },
  ) => Promise<Array<{ date: Date; close: number }>>;
};

let yahooInstance: YahooLike | null = null;

async function getYahoo(): Promise<YahooLike> {
  if (yahooInstance) return yahooInstance;
  const yf = await import("yahoo-finance2");
  const YahooFinance = yf.default as unknown as new (opts?: {
    suppressNotices?: string[];
  }) => YahooLike;
  yahooInstance = new YahooFinance({
    suppressNotices: ["yahooSurvey", "ripHistorical"],
  });
  return yahooInstance;
}

async function defaultYahooHistorical(
  ticker: string,
  fromDate: string,
  toDate: string,
): Promise<HistoricalClose[]> {
  const yahoo = await getYahoo();
  const rows = await yahoo.historical(ticker, {
    period1: fromDate,
    period2: toDate,
    interval: "1d",
  });
  return rows
    .filter((r) => Number.isFinite(r.close))
    .map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      close: r.close,
    }));
}
