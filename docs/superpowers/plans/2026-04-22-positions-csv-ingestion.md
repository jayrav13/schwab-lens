# Positions CSV Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Schwab's Positions CSV into the Demo dashboard as a snapshot source alongside the existing Transactions CSV stream, so that the earliest snapshot seeds the portfolio and the latest snapshot anchors current cash, share marks, and option marks.

**Architecture:** `data/` gains two subdirectories (`transactions/` and `positions/`). A new positions parser + multi-file loader reads all snapshots, sorted by `asOf`. The transactions loader grows a dedup step so overlapping exports are idempotent. The portfolio builder accepts a `Seed` (earliest snapshot → `Seed`, or `Config` fallback). Mark-to-market prefers snapshot prices and gains an options section. A user-level Claude skill (`/ingest`) moves downloaded CSVs into the right subdir.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, Vitest, Papaparse. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-22-positions-csv-ingestion-design.md`

**Branch strategy:** Per CLAUDE.md, use `fix/<N>-positions-csv-ingestion` where `<N>` is a GitHub issue number. Open an issue first ("Integrate Positions CSV") if you want PR tracking. For solo work this can also land directly on `main` in small commits (matches the repo's existing docs-only pattern). Each task below ends with a commit; sequence commits however you prefer.

**Pre-flight (before Task 1):**
- Confirm clean working tree: `git status`
- Create working branch if using PR flow: `git checkout -b fix/N-positions-csv-ingestion`
- Confirm tests pass on the base: `npm test`

---

## File Structure

**Create:**
- `lib/positions/types.ts` — `PositionsSnapshot`, `SnapshotShare`, `SnapshotOption`, `Seed`
- `lib/positions/parse.ts` — parse one Positions CSV → `PositionsSnapshot`
- `lib/positions/load.ts` — read all `data/positions/*.csv` → sorted `PositionsSnapshot[]`
- `lib/positions/seed.ts` — `buildSeedFromSnapshot(snapshot)` → `Seed`
- `lib/csv/load.ts` — read all `data/transactions/*.csv`, parse, union, dedup → `Transaction[]`
- `tests/positions/parse.test.ts`
- `tests/positions/load.test.ts`
- `tests/positions/seed.test.ts`
- `tests/csv/load.test.ts`
- `tests/fixtures/positions/positions-basic.csv`
- `tests/fixtures/positions/positions-missing-cash.csv`
- `tests/fixtures/positions/positions-day-1.csv`
- `tests/fixtures/positions/positions-day-2.csv`
- `tests/fixtures/transactions-overlap/overlap-a.csv`
- `tests/fixtures/transactions-overlap/overlap-b.csv`
- `~/.claude/skills/ingest/SKILL.md`

**Modify:**
- `lib/model/types.ts` — add `Seed` import re-export; keep `Config` unchanged
- `lib/model/portfolio.ts` — accept `Seed` parameter, pass to sub-metrics
- `lib/model/cash.ts` — accept `Seed` instead of `Config`
- `lib/model/metrics/nav.ts` — accept `Seed` instead of `Config`, seed shares from `Seed.initialShares`
- `lib/model/metrics/positions.ts` — accept `Seed`, seed state maps from `Seed.initialShares` / `Seed.initialOptions`
- `lib/model/metrics/mark_to_market.ts` — accept optional `PositionsSnapshot`, prefer snapshot prices, add options rows
- `lib/server/dashboard.ts` — use new loaders, build `Seed`, thread `latestSnapshot` into MTM
- `app/components/MarkToMarketCard.tsx` — render options section when present
- `tests/model/cash.test.ts`, `tests/model/portfolio.test.ts`, `tests/model/metrics/nav.test.ts`, `tests/model/metrics/positions.test.ts`, `tests/model/metrics/mark_to_market.test.ts` — update signatures to pass `Seed`

**Key interfaces defined once, referenced throughout the plan:**

```ts
// lib/positions/types.ts
export type SnapshotShare = {
  ticker: string;
  quantity: number;
  price: number;
  marketValue: number;
  costBasis: number; // $/share (weighted)
};

export type SnapshotOption = {
  underlying: string;
  expiry: string;       // YYYY-MM-DD
  strike: number;
  callPut: "C" | "P";
  quantity: number;     // negative = short
  price: number;
  marketValue: number;
  delta: number | null;
  theta: number | null;
  intrinsicValue: number | null;
};

export type PositionsSnapshot = {
  asOf: string;         // ISO date+time: YYYY-MM-DDTHH:MM
  cash: number;
  totalValue: number;
  shares: SnapshotShare[];
  options: SnapshotOption[];
  sourceFile: string;   // filename, for debug
};

import type { OpenOption } from "@/lib/model/types";

export type Seed = {
  asOf: string;         // YYYY-MM-DD (used for seed NAV/cash point)
  cash: number;
  initialShares: Array<{ ticker: string; shares: number; costBasis: number }>;
  initialOptions: OpenOption[];
};
```

---

## Task 1: Positions types module

**Files:**
- Create: `lib/positions/types.ts`

- [ ] **Step 1: Create the types file**

Write `lib/positions/types.ts`:

```ts
import type { OpenOption } from "@/lib/model/types";

export type SnapshotShare = {
  ticker: string;
  quantity: number;
  price: number;
  marketValue: number;
  costBasis: number;
};

export type SnapshotOption = {
  underlying: string;
  expiry: string;
  strike: number;
  callPut: "C" | "P";
  quantity: number;
  price: number;
  marketValue: number;
  delta: number | null;
  theta: number | null;
  intrinsicValue: number | null;
};

export type PositionsSnapshot = {
  asOf: string;
  cash: number;
  totalValue: number;
  shares: SnapshotShare[];
  options: SnapshotOption[];
  sourceFile: string;
};

export type Seed = {
  asOf: string;
  cash: number;
  initialShares: Array<{ ticker: string; shares: number; costBasis: number }>;
  initialOptions: OpenOption[];
};
```

- [ ] **Step 2: Typecheck passes**

Run: `npm run typecheck`
Expected: exits 0 with no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/positions/types.ts
git commit -m "Add Positions module type definitions

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Positions CSV parser

**Files:**
- Create: `lib/positions/parse.ts`
- Create: `tests/positions/parse.test.ts`
- Create: `tests/fixtures/positions/positions-basic.csv`
- Create: `tests/fixtures/positions/positions-missing-cash.csv`

- [ ] **Step 1: Write the basic fictional fixture**

Write `tests/fixtures/positions/positions-basic.csv` (FULLY FICTIONAL per CLAUDE.md hygiene rule — no real tickers from any real portfolio):

```csv
"Positions for account Demo ...999 as of 03:14 PM ET, 2026/03/15"

"Symbol","Description","Qty (Quantity)","Price","Price Chng % (Price Change %)","Price Chng $ (Price Change $)","Delta","ITM (In The Money)","Mkt Val (Market Value)","Theta","Day Chng % (Day Change %)","Day Chng $ (Day Change $)","Cost Basis","Gain $ (Gain/Loss $)","Gain % (Gain/Loss %)","Ratings","Reinvest?","Reinvest Capital Gains?","% of Acct (% of Account)","Intr Val (Intrinsic Value)","Asset Type",
"ACME","ACME CORPORATION","100","50.00","0.00%","0.00","N/A","-","$5,000.00","N/A","0.00%","$0.00","$4,800.00","$200.00","4.17%","B","No","N/A","33.33%","-","Equity",
"ACME 04/17/2026 55.00 C","CALL ACME CORP $55 EXP 04/17/26","-1","1.20","0.00%","0.00","0.3500","OTM","-$120.00","-0.0200","0.00%","$0.00","-$75.00","-$45.00","-60.00%","-","N/A","N/A","-","-$5.00","Option",
"ACME 04/17/2026 45.00 P","PUT ACME CORP $45 EXP 04/17/26","-1","0.80","0.00%","0.00","-0.2500","OTM","-$80.00","-0.0300","0.00%","$0.00","-$40.00","-$40.00","-100.00%","-","N/A","N/A","-","-$5.00","Option",
"Cash & Cash Investments","--","--","--","--","--","--","--","$10,200.00","--","0.00%","$0.00","--","--","--","--","--","--","66.67%","--","Cash and Money Market",
"Positions Total","","--","--","--","--","--","--","$15,000.00","--","0.00%","$0.00","$4,685.00","$115.00","0.77%","--","--","--","--","--","--",
```

- [ ] **Step 2: Write the missing-cash fictional fixture**

Write `tests/fixtures/positions/positions-missing-cash.csv` (same header, no cash row):

```csv
"Positions for account Demo ...999 as of 03:14 PM ET, 2026/03/15"

"Symbol","Description","Qty (Quantity)","Price","Price Chng % (Price Change %)","Price Chng $ (Price Change $)","Delta","ITM (In The Money)","Mkt Val (Market Value)","Theta","Day Chng % (Day Change %)","Day Chng $ (Day Change $)","Cost Basis","Gain $ (Gain/Loss $)","Gain % (Gain/Loss %)","Ratings","Reinvest?","Reinvest Capital Gains?","% of Acct (% of Account)","Intr Val (Intrinsic Value)","Asset Type",
"ACME","ACME CORPORATION","100","50.00","0.00%","0.00","N/A","-","$5,000.00","N/A","0.00%","$0.00","$4,800.00","$200.00","4.17%","B","No","N/A","33.33%","-","Equity",
"Positions Total","","--","--","--","--","--","--","$5,000.00","--","0.00%","$0.00","$4,800.00","$200.00","4.17%","--","--","--","--","--","--",
```

- [ ] **Step 3: Write the failing tests**

Write `tests/positions/parse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parsePositionsCsv } from "@/lib/positions/parse";

function fixture(name: string): string {
  return readFileSync(
    path.join(__dirname, "..", "fixtures", "positions", name),
    "utf8",
  );
}

describe("parsePositionsCsv", () => {
  const snap = parsePositionsCsv(
    fixture("positions-basic.csv"),
    "positions-basic.csv",
  );

  it("parses asOf from the header line", () => {
    expect(snap.asOf).toBe("2026-03-15T15:14");
  });

  it("parses cash from the Cash & Cash Investments row", () => {
    expect(snap.cash).toBe(10200);
  });

  it("parses total value from the Positions Total row", () => {
    expect(snap.totalValue).toBe(15000);
  });

  it("parses share lots", () => {
    expect(snap.shares).toEqual([
      {
        ticker: "ACME",
        quantity: 100,
        price: 50,
        marketValue: 5000,
        costBasis: 48,
      },
    ]);
  });

  it("parses short option contracts", () => {
    expect(snap.options).toHaveLength(2);
    const call = snap.options.find((o) => o.callPut === "C")!;
    expect(call).toMatchObject({
      underlying: "ACME",
      expiry: "2026-04-17",
      strike: 55,
      callPut: "C",
      quantity: -1,
      price: 1.2,
      marketValue: -120,
    });
    expect(call.delta).toBeCloseTo(0.35);
    expect(call.theta).toBeCloseTo(-0.02);
  });

  it("stores the source filename", () => {
    expect(snap.sourceFile).toBe("positions-basic.csv");
  });

  it("throws a clear error when the cash row is missing", () => {
    expect(() =>
      parsePositionsCsv(
        fixture("positions-missing-cash.csv"),
        "positions-missing-cash.csv",
      ),
    ).toThrow(/Cash & Cash Investments/);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run tests/positions/parse.test.ts`
Expected: FAIL with "Cannot find module '@/lib/positions/parse'"

- [ ] **Step 5: Implement the parser**

Write `lib/positions/parse.ts`:

```ts
import Papa from "papaparse";
import { parseCurrency } from "@/lib/util/money";
import type {
  PositionsSnapshot,
  SnapshotOption,
  SnapshotShare,
} from "@/lib/positions/types";

const OPTION_SYMBOL =
  /^([A-Z.]+)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+([0-9]+(?:\.[0-9]+)?)\s+([PC])$/;

const ASOF_REGEX =
  /as of (\d{1,2}):(\d{2}) (AM|PM) ET, (\d{4})\/(\d{2})\/(\d{2})/i;

function parseAsOf(headerLine: string): string {
  const m = headerLine.match(ASOF_REGEX);
  if (!m) {
    throw new Error(
      `parsePositionsCsv: cannot parse "as of" timestamp from header: ${headerLine}`,
    );
  }
  const [, hhRaw, mm, ampm, yyyy, mo, dd] = m;
  let hh = Number(hhRaw);
  if (ampm.toUpperCase() === "PM" && hh !== 12) hh += 12;
  if (ampm.toUpperCase() === "AM" && hh === 12) hh = 0;
  return `${yyyy}-${mo}-${dd}T${String(hh).padStart(2, "0")}:${mm}`;
}

function parseNumericCell(raw: string | undefined): number {
  if (raw === undefined || raw === "" || raw === "--" || raw === "N/A") return 0;
  if (raw.includes("$")) return parseCurrency(raw);
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) {
    throw new Error(`parsePositionsCsv: cannot parse numeric "${raw}"`);
  }
  return n;
}

function parseOptionSymbol(sym: string): {
  underlying: string;
  expiry: string;
  strike: number;
  callPut: "C" | "P";
} {
  const m = sym.match(OPTION_SYMBOL);
  if (!m) {
    throw new Error(`parsePositionsCsv: cannot parse option symbol "${sym}"`);
  }
  const [, underlying, mm, dd, yyyy, strike, pc] = m;
  return {
    underlying,
    expiry: `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`,
    strike: Number(strike),
    callPut: pc as "C" | "P",
  };
}

export function parsePositionsCsv(
  text: string,
  sourceFile: string,
): PositionsSnapshot {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length < 3) {
    throw new Error("parsePositionsCsv: file too short to be a Positions CSV");
  }

  const asOf = parseAsOf(lines[0]);

  // Re-join from line 2 onward (skip header line + blank line) for Papa.
  // Schwab's file has: [headerLine][blankLine][columnHeaders][data...][totalRow]
  const dataSection = lines.slice(2).join("\n");
  const result = Papa.parse<Record<string, string>>(dataSection.trim(), {
    header: true,
    skipEmptyLines: true,
  });
  if (result.errors.length > 0) {
    const first = result.errors[0];
    throw new Error(
      `parsePositionsCsv: CSV parse error at row ${first.row}: ${first.message}`,
    );
  }

  let cash: number | null = null;
  let totalValue: number | null = null;
  const shares: SnapshotShare[] = [];
  const options: SnapshotOption[] = [];

  for (const row of result.data) {
    const symbol = row["Symbol"] ?? "";
    const assetType = row["Asset Type"] ?? "";
    const mktVal = row["Mkt Val (Market Value)"];
    const qty = row["Qty (Quantity)"];

    if (symbol === "Cash & Cash Investments") {
      cash = parseNumericCell(mktVal);
      continue;
    }
    if (symbol === "Positions Total") {
      totalValue = parseNumericCell(mktVal);
      continue;
    }

    if (assetType === "Equity") {
      const quantity = parseNumericCell(qty);
      const marketValue = parseNumericCell(mktVal);
      const totalCost = parseNumericCell(row["Cost Basis"]);
      shares.push({
        ticker: symbol,
        quantity,
        price: parseNumericCell(row["Price"]),
        marketValue,
        costBasis: quantity === 0 ? 0 : totalCost / quantity,
      });
      continue;
    }

    if (assetType === "Option") {
      const parsed = parseOptionSymbol(symbol);
      const quantity = parseNumericCell(qty);
      const delta = parseDeltaTheta(row["Delta"]);
      const theta = parseDeltaTheta(row["Theta"]);
      const intrinsic = parseDeltaTheta(row["Intr Val (Intrinsic Value)"]);
      options.push({
        ...parsed,
        quantity,
        price: parseNumericCell(row["Price"]),
        marketValue: parseNumericCell(mktVal),
        delta,
        theta,
        intrinsicValue: intrinsic,
      });
      continue;
    }
    // Unknown asset types are ignored silently (e.g. Cash sub-rows Schwab might add).
  }

  if (cash === null) {
    throw new Error(
      'parsePositionsCsv: missing "Cash & Cash Investments" row',
    );
  }
  if (totalValue === null) {
    throw new Error('parsePositionsCsv: missing "Positions Total" row');
  }

  return { asOf, cash, totalValue, shares, options, sourceFile };
}

function parseDeltaTheta(raw: string | undefined): number | null {
  if (raw === undefined || raw === "" || raw === "--" || raw === "N/A") {
    return null;
  }
  if (raw.includes("$")) return parseCurrency(raw);
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/positions/parse.test.ts`
Expected: all 7 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/positions/parse.ts tests/positions/parse.test.ts tests/fixtures/positions/
git commit -m "Add Positions CSV parser

Parses Schwab Positions exports (header asOf, cash row, share lots,
option contracts with option-symbol decomposition). Throws with clear
message on missing cash row.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Positions multi-file loader

**Files:**
- Create: `lib/positions/load.ts`
- Create: `tests/positions/load.test.ts`
- Create: `tests/fixtures/positions/positions-day-1.csv`
- Create: `tests/fixtures/positions/positions-day-2.csv`

- [ ] **Step 1: Write day-1 fixture**

Write `tests/fixtures/positions/positions-day-1.csv`:

```csv
"Positions for account Demo ...999 as of 09:00 AM ET, 2026/03/10"

"Symbol","Description","Qty (Quantity)","Price","Price Chng % (Price Change %)","Price Chng $ (Price Change $)","Delta","ITM (In The Money)","Mkt Val (Market Value)","Theta","Day Chng % (Day Change %)","Day Chng $ (Day Change $)","Cost Basis","Gain $ (Gain/Loss $)","Gain % (Gain/Loss %)","Ratings","Reinvest?","Reinvest Capital Gains?","% of Acct (% of Account)","Intr Val (Intrinsic Value)","Asset Type",
"Cash & Cash Investments","--","--","--","--","--","--","--","$10,000.00","--","0.00%","$0.00","--","--","--","--","--","--","100.00%","--","Cash and Money Market",
"Positions Total","","--","--","--","--","--","--","$10,000.00","--","0.00%","$0.00","$0.00","$0.00","0.00%","--","--","--","--","--","--",
```

- [ ] **Step 2: Write day-2 fixture**

Write `tests/fixtures/positions/positions-day-2.csv`:

```csv
"Positions for account Demo ...999 as of 09:00 AM ET, 2026/03/11"

"Symbol","Description","Qty (Quantity)","Price","Price Chng % (Price Change %)","Price Chng $ (Price Change $)","Delta","ITM (In The Money)","Mkt Val (Market Value)","Theta","Day Chng % (Day Change %)","Day Chng $ (Day Change $)","Cost Basis","Gain $ (Gain/Loss $)","Gain % (Gain/Loss %)","Ratings","Reinvest?","Reinvest Capital Gains?","% of Acct (% of Account)","Intr Val (Intrinsic Value)","Asset Type",
"Cash & Cash Investments","--","--","--","--","--","--","--","$10,050.00","--","0.00%","$0.00","--","--","--","--","--","--","100.00%","--","Cash and Money Market",
"Positions Total","","--","--","--","--","--","--","$10,050.00","--","0.00%","$0.00","$0.00","$0.00","0.00%","--","--","--","--","--","--",
```

- [ ] **Step 3: Write the failing tests**

Write `tests/positions/load.test.ts`:

```ts
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
    // Write day-2 first to ensure filesystem order isn't what we rely on.
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
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run tests/positions/load.test.ts`
Expected: FAIL with "Cannot find module '@/lib/positions/load'"

- [ ] **Step 5: Implement the loader**

Write `lib/positions/load.ts`:

```ts
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parsePositionsCsv } from "@/lib/positions/parse";
import type { PositionsSnapshot } from "@/lib/positions/types";

// Schwab default: Demo-Positions-YYYY-MM-DD-HHMMSS.csv
const FILENAME_TIMESTAMP =
  /Demo-Positions-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.csv$/i;

function filenameTimestampMinutes(filename: string): number | null {
  const m = filename.match(FILENAME_TIMESTAMP);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)) / 60000;
}

function asOfMinutes(asOf: string): number {
  // asOf is YYYY-MM-DDTHH:MM (local ET minute precision, but compared in UTC
  // to filename timestamp below — both use the same frame of reference so
  // absolute offset cancels out).
  const [date, time] = asOf.split("T");
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return Date.UTC(y, mo - 1, d, h, mi) / 60000;
}

export function loadPositionsFromDir(dir: string): PositionsSnapshot[] {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) =>
    f.toLowerCase().endsWith(".csv"),
  );
  const snapshots: PositionsSnapshot[] = files.map((f) => {
    const text = readFileSync(path.join(dir, f), "utf8");
    const snap = parsePositionsCsv(text, f);

    // Cross-check filename timestamp vs parsed header asOf (only when the
    // filename follows the Schwab default pattern — renamed files skip this).
    const fileMin = filenameTimestampMinutes(f);
    if (fileMin !== null) {
      const headerMin = asOfMinutes(snap.asOf);
      if (Math.abs(fileMin - headerMin) > 1) {
        throw new Error(
          `loadPositionsFromDir: filename timestamp and header asOf disagree in ${f} (filename ~ ${fileMin}min, header ~ ${headerMin}min)`,
        );
      }
    }
    return snap;
  });

  snapshots.sort((a, b) => a.asOf.localeCompare(b.asOf));

  for (let i = 1; i < snapshots.length; i++) {
    if (snapshots[i].asOf === snapshots[i - 1].asOf) {
      throw new Error(
        `loadPositionsFromDir: duplicate asOf "${snapshots[i].asOf}" in files ${snapshots[i - 1].sourceFile} and ${snapshots[i].sourceFile}`,
      );
    }
  }
  return snapshots;
}

export function earliest(
  snapshots: PositionsSnapshot[],
): PositionsSnapshot | null {
  return snapshots.length > 0 ? snapshots[0] : null;
}

export function latest(
  snapshots: PositionsSnapshot[],
): PositionsSnapshot | null {
  return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
}
```

Also add a test for the filename cross-check. Append to `tests/positions/load.test.ts` inside the `describe` block:

```ts
  it("throws when filename timestamp disagrees with header asOf", () => {
    const dir = tmpDir();
    // Filename says 2026-03-20 but fixture header says 2026-03-10.
    writeFileSync(
      path.join(dir, "Demo-Positions-2026-03-20-090000.csv"),
      fixture("positions-day-1.csv"),
    );
    expect(() => loadPositionsFromDir(dir)).toThrow(/disagree/);
  });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/positions/load.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/positions/load.ts tests/positions/load.test.ts tests/fixtures/positions/positions-day-1.csv tests/fixtures/positions/positions-day-2.csv
git commit -m "Add multi-file Positions loader

Reads data/positions/*.csv, parses each, sorts by asOf, rejects
duplicate timestamps. Returns [] for missing/empty dirs so the
dashboard can boot without positions data.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Multi-file Transactions loader with dedup

**Files:**
- Create: `lib/csv/load.ts`
- Create: `tests/csv/load.test.ts`
- Create: `tests/fixtures/transactions-overlap/overlap-a.csv`
- Create: `tests/fixtures/transactions-overlap/overlap-b.csv`

- [ ] **Step 1: Write overlap-a fixture**

Write `tests/fixtures/transactions-overlap/overlap-a.csv`:

```csv
"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"
"02/10/2026","Sell to Open","ACME 02/20/2026 50.00 C","CALL ACME CORP $50 EXP 02/20/26","1","$1.00","$0.66","$99.34"
"02/05/2026","Qualified Dividend","ACME","ACME CORPORATION","","","","$2.00"
```

- [ ] **Step 2: Write overlap-b fixture (overlapping rows + new rows)**

Write `tests/fixtures/transactions-overlap/overlap-b.csv`:

```csv
"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"
"02/15/2026","Buy to Close","ACME 02/20/2026 50.00 C","CALL ACME CORP $50 EXP 02/20/26","1","$0.20","$0.66","-$20.66"
"02/10/2026","Sell to Open","ACME 02/20/2026 50.00 C","CALL ACME CORP $50 EXP 02/20/26","1","$1.00","$0.66","$99.34"
"02/05/2026","Qualified Dividend","ACME","ACME CORPORATION","","","","$2.00"
```

- [ ] **Step 3: Write the failing tests**

Write `tests/csv/load.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, copyFileSync } from "node:fs";
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
    // overlap-a: 2 rows. overlap-b: 3 rows. Union dedup: 3 unique rows.
    expect(txs).toHaveLength(3);

    // Sorted ascending by date.
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
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run tests/csv/load.test.ts`
Expected: FAIL with "Cannot find module '@/lib/csv/load'"

- [ ] **Step 5: Implement the loader**

Write `lib/csv/load.ts`:

```ts
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseSchwabCsv } from "@/lib/csv/parse";
import type { Transaction } from "@/lib/csv/types";

function dedupKey(t: Transaction): string {
  return [
    t.tradeDate,
    t.rawAction,
    t.raw.Symbol ?? "",
    t.raw.Quantity ?? "",
    t.raw.Amount ?? "",
  ].join("|");
}

export function loadTransactionsFromDir(dir: string): Transaction[] {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) =>
    f.toLowerCase().endsWith(".csv"),
  );

  const seen = new Map<string, Transaction>();
  for (const f of files) {
    const text = readFileSync(path.join(dir, f), "utf8");
    for (const t of parseSchwabCsv(text)) {
      const key = dedupKey(t);
      if (!seen.has(key)) seen.set(key, t);
    }
  }

  const all = Array.from(seen.values());
  all.sort((a, b) =>
    a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : 0,
  );
  return all;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/csv/load.test.ts`
Expected: all 3 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/csv/load.ts tests/csv/load.test.ts tests/fixtures/transactions-overlap/
git commit -m "Add multi-file transactions loader with dedup

Unions every CSV in data/transactions/ and dedupes by
(date, action, symbol, quantity, amount). Overlapping Schwab
exports are now idempotent.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Introduce Seed abstraction — cash ledger

**Files:**
- Modify: `lib/model/types.ts`
- Modify: `lib/model/cash.ts`
- Modify: `tests/model/cash.test.ts`

Context: `Seed` was declared in `lib/positions/types.ts` (Task 1). Re-export it from `lib/model/types.ts` for ergonomic imports, then thread it through `computeCashLedger`.

- [ ] **Step 1: Re-export `Seed` from model types**

Modify `lib/model/types.ts` — at the end of the file add:

```ts
export type { Seed } from "@/lib/positions/types";
```

Full file (replace contents):

```ts
import type { OptionLeg, Transaction } from "@/lib/csv/types";

export type Config = {
  seedDate: string;
  seedValue: number;
  marketData: { enabled: boolean };
};

export type CashPoint = { date: string; balance: number };
export type FlowPoint = { date: string; signedAmount: number };
export type NavPoint = { date: string; nav: number };
export type PremiumPoint = { date: string; netAmount: number };

export type OpenOption = {
  contract: OptionLeg;
  quantityOpen: number;
  netPremiumCollected: number;
  entries: { date: string; price: number; qty: number }[];
};

export type OpenShare = {
  ticker: string;
  shares: number;
  weightedCostBasis: number;
};

export type Warning =
  | { kind: "UnknownAction"; rawAction: string; count: number }
  | { kind: "CashDrift"; expected: number; actual: number }
  | { kind: "NegativeShareEndOfDay"; ticker: string; date: string; shares: number }
  | { kind: "UnpairedAssignment"; date: string; contractKey: string };

export type PortfolioState = {
  config: Config;
  transactions: Transaction[];
  cashLedger: CashPoint[];
  externalFlows: FlowPoint[];
  navSeries: NavPoint[];
  openOptionPositions: OpenOption[];
  openSharePositions: OpenShare[];
  premiumSeries: PremiumPoint[];
  premiumTotals: { gross: number; closed: number; net: number };
  warnings: Warning[];
};

export type { Seed } from "@/lib/positions/types";
```

- [ ] **Step 2: Update `computeCashLedger` to take `Seed`**

Replace `lib/model/cash.ts` contents:

```ts
import type { Transaction } from "@/lib/csv/types";
import type { CashPoint, FlowPoint, Seed } from "@/lib/model/types";

export function computeCashLedger(
  txs: Transaction[],
  seed: Seed,
): {
  cashLedger: CashPoint[];
  externalFlows: FlowPoint[];
  cumulativeExternal: number;
  finalCash: number;
} {
  const sorted = [...txs].sort((a, b) =>
    a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : 0,
  );

  const cashLedger: CashPoint[] = [
    { date: seed.asOf, balance: seed.cash },
  ];
  const externalFlows: FlowPoint[] = [];
  let balance = seed.cash;
  let cumulativeExternal = 0;

  let dayGroup: string | null = null;

  for (const t of sorted) {
    balance += t.amount;
    if (t.action === "Journal" || t.action === "WireSent") {
      externalFlows.push({ date: t.tradeDate, signedAmount: t.amount });
      cumulativeExternal += t.amount;
    }
    if (dayGroup !== t.tradeDate) {
      cashLedger.push({ date: t.tradeDate, balance });
      dayGroup = t.tradeDate;
    } else {
      cashLedger[cashLedger.length - 1] = {
        date: t.tradeDate,
        balance,
      };
    }
  }

  return {
    cashLedger,
    externalFlows,
    cumulativeExternal,
    finalCash: balance,
  };
}
```

- [ ] **Step 3: Update `tests/model/cash.test.ts` call sites**

Look for every `computeCashLedger(txs, config)` in this file and replace `config` with a synthesized seed. Example pattern:

```ts
// Before:
const result = computeCashLedger(txs, { seedDate: "2026-01-15", seedValue: 1000, marketData: { enabled: false } });

// After:
const result = computeCashLedger(txs, {
  asOf: "2026-01-15",
  cash: 1000,
  initialShares: [],
  initialOptions: [],
});
```

Read the file (`Read tests/model/cash.test.ts`) and apply this transformation everywhere `computeCashLedger` is invoked.

- [ ] **Step 4: Run cash tests**

Run: `npx vitest run tests/model/cash.test.ts`
Expected: all tests PASS (behavior unchanged; only parameter shape changed).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: will fail in `lib/model/portfolio.ts` because `buildPortfolio` still passes `config` to `computeCashLedger`. That's expected — next task fixes it. Do not commit yet.

- [ ] **Step 6: Do not commit yet**

This task's changes are partially broken until Task 6 lands. Keep them staged; Task 6 will include them in a single commit.

---

## Task 6: Thread `Seed` through NAV, positions, and portfolio builder

**Files:**
- Modify: `lib/model/metrics/nav.ts`
- Modify: `lib/model/metrics/positions.ts`
- Modify: `lib/model/portfolio.ts`
- Modify: `tests/model/metrics/nav.test.ts`
- Modify: `tests/model/metrics/positions.test.ts`
- Modify: `tests/model/portfolio.test.ts`

- [ ] **Step 1: Update `computeNavSeries` to take `Seed`**

Replace `lib/model/metrics/nav.ts` contents:

```ts
import type { Transaction } from "@/lib/csv/types";
import type { NavPoint, Seed } from "@/lib/model/types";

export function computeNavSeries(
  txs: Transaction[],
  seed: Seed,
): NavPoint[] {
  const sorted = [...txs].sort((a, b) =>
    a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : 0,
  );

  const shares = new Map<string, { qty: number; cost: number }>();
  for (const s of seed.initialShares) {
    shares.set(s.ticker, {
      qty: s.shares,
      cost: s.shares * s.costBasis,
    });
  }
  let cash = seed.cash;

  let initialSharesValue = 0;
  for (const s of shares.values()) {
    if (s.qty > 0) initialSharesValue += s.cost;
  }
  const series: NavPoint[] = [
    { date: seed.asOf, nav: cash + initialSharesValue },
  ];
  let currentDate: string | null = null;

  for (const t of sorted) {
    cash += t.amount;
    if ((t.action === "Buy" || t.action === "Sell") && t.ticker) {
      const s = shares.get(t.ticker) ?? { qty: 0, cost: 0 };
      const price = t.price ?? 0;
      if (t.action === "Buy") {
        s.qty += t.quantity;
        s.cost += t.quantity * price;
      } else {
        if (s.qty > 0) {
          const avg = s.cost / s.qty;
          s.cost -= t.quantity * avg;
        }
        s.qty -= t.quantity;
      }
      shares.set(t.ticker, s);
    }

    let sharesValue = 0;
    for (const s of shares.values()) {
      if (s.qty <= 0) continue;
      const avg = s.qty !== 0 ? s.cost / s.qty : 0;
      sharesValue += s.qty * avg;
    }
    const nav = cash + sharesValue;

    if (currentDate !== t.tradeDate) {
      series.push({ date: t.tradeDate, nav });
      currentDate = t.tradeDate;
    } else {
      series[series.length - 1] = { date: t.tradeDate, nav };
    }
  }

  return series;
}
```

- [ ] **Step 2: Update `lib/model/metrics/positions.ts` to accept `Seed`**

Replace `lib/model/metrics/positions.ts` contents:

```ts
import type { Transaction, OptionLeg } from "@/lib/csv/types";
import type { OpenOption, OpenShare, Seed, Warning } from "@/lib/model/types";

export function computeShareLedger(
  txs: Transaction[],
  seed: Seed,
): {
  openShares: OpenShare[];
  warnings: Warning[];
} {
  const state = new Map<string, { shares: number; cost: number }>();
  for (const s of seed.initialShares) {
    state.set(s.ticker, {
      shares: s.shares,
      cost: s.shares * s.costBasis,
    });
  }
  const warnings: Warning[] = [];

  const sorted = [...txs].sort((a, b) =>
    a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : 0,
  );

  for (const t of sorted) {
    if ((t.action !== "Buy" && t.action !== "Sell") || !t.ticker) continue;
    const s = state.get(t.ticker) ?? { shares: 0, cost: 0 };
    const price = t.price ?? 0;
    if (t.action === "Buy") {
      s.shares += t.quantity;
      s.cost += t.quantity * price;
    } else {
      if (s.shares > 0) {
        const avg = s.cost / s.shares;
        s.cost -= t.quantity * avg;
      }
      s.shares -= t.quantity;
    }
    state.set(t.ticker, s);
  }

  // End-of-day negativity check — seeded initial shares add a positive baseline.
  const running = new Map<string, number>();
  for (const s of seed.initialShares) {
    running.set(s.ticker, s.shares);
  }
  const perDate = new Map<string, Map<string, number>>();
  for (const t of sorted) {
    if ((t.action !== "Buy" && t.action !== "Sell") || !t.ticker) continue;
    const day = perDate.get(t.tradeDate) ?? new Map<string, number>();
    const delta = t.action === "Buy" ? t.quantity : -t.quantity;
    day.set(t.ticker, (day.get(t.ticker) ?? 0) + delta);
    perDate.set(t.tradeDate, day);
  }

  for (const [date, deltas] of [...perDate.entries()].sort()) {
    for (const [ticker, delta] of deltas) {
      const next = (running.get(ticker) ?? 0) + delta;
      running.set(ticker, next);
      if (next < 0) {
        warnings.push({
          kind: "NegativeShareEndOfDay",
          ticker,
          date,
          shares: next,
        });
      }
    }
  }

  const openShares: OpenShare[] = [];
  for (const [ticker, s] of state) {
    if (Math.abs(s.shares) < 0.5) continue;
    const avg = s.shares !== 0 ? s.cost / s.shares : 0;
    openShares.push({
      ticker,
      shares: Math.round(s.shares),
      weightedCostBasis: avg,
    });
  }
  openShares.sort((a, b) => a.ticker.localeCompare(b.ticker));

  return { openShares, warnings };
}

function contractKey(o: OptionLeg): string {
  return `${o.ticker}|${o.expiry}|${o.strike}|${o.type}`;
}

export function computeOpenOptions(
  txs: Transaction[],
  seed: Seed,
): OpenOption[] {
  const byKey = new Map<
    string,
    {
      contract: OptionLeg;
      quantityOpen: number;
      netPremiumCollected: number;
      entries: OpenOption["entries"];
    }
  >();

  for (const o of seed.initialOptions) {
    byKey.set(contractKey(o.contract), {
      contract: o.contract,
      quantityOpen: o.quantityOpen,
      netPremiumCollected: o.netPremiumCollected,
      entries: [...o.entries],
    });
  }

  const sorted = [...txs].sort((a, b) =>
    a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : 0,
  );

  for (const t of sorted) {
    if (!t.option) continue;
    const key = contractKey(t.option);
    const s =
      byKey.get(key) ?? {
        contract: t.option,
        quantityOpen: 0,
        netPremiumCollected: 0,
        entries: [] as OpenOption["entries"],
      };
    if (t.action === "SellToOpen") {
      s.quantityOpen += t.quantity;
      s.netPremiumCollected += t.amount;
      s.entries.push({
        date: t.tradeDate,
        price: t.price ?? 0,
        qty: t.quantity,
      });
    } else if (
      t.action === "BuyToClose" ||
      t.action === "Expired" ||
      t.action === "Assigned"
    ) {
      s.quantityOpen -= t.quantity;
      if (t.action === "BuyToClose") {
        s.netPremiumCollected += t.amount;
      }
    }
    byKey.set(key, s);
  }

  const open: OpenOption[] = [];
  for (const s of byKey.values()) {
    if (s.quantityOpen > 0) open.push(s);
  }
  open.sort((a, b) => a.contract.expiry.localeCompare(b.contract.expiry));
  return open;
}
```

- [ ] **Step 3: Update `buildPortfolio` to accept + thread `Seed`**

Replace `lib/model/portfolio.ts` contents:

```ts
import type { Transaction } from "@/lib/csv/types";
import type {
  Config,
  PortfolioState,
  Seed,
  Warning,
} from "@/lib/model/types";
import { computeCashLedger } from "@/lib/model/cash";
import {
  computeOpenOptions,
  computeShareLedger,
} from "@/lib/model/metrics/positions";
import { computeNavSeries } from "@/lib/model/metrics/nav";
import {
  computePremiumSeries,
  computePremiumTotals,
} from "@/lib/model/metrics/premiums";

const CASH_DRIFT_TOLERANCE = 0.01;

export function seedFromConfig(config: Config): Seed {
  return {
    asOf: config.seedDate,
    cash: config.seedValue,
    initialShares: [],
    initialOptions: [],
  };
}

export function buildPortfolio(
  transactions: Transaction[],
  config: Config,
  seed: Seed,
): PortfolioState {
  const warnings: Warning[] = [];

  // Drop transactions before the seed date — they predate our starting state.
  const txs = transactions.filter((t) => t.tradeDate >= seed.asOf);

  const cash = computeCashLedger(txs, seed);

  const expected = seed.cash + txs.reduce((acc, t) => acc + t.amount, 0);
  if (Math.abs(expected - cash.finalCash) > CASH_DRIFT_TOLERANCE) {
    warnings.push({
      kind: "CashDrift",
      expected,
      actual: cash.finalCash,
    });
  }

  const { openShares, warnings: shareWarnings } = computeShareLedger(txs, seed);
  warnings.push(...shareWarnings);
  const openOptions = computeOpenOptions(txs, seed);

  const navSeries = computeNavSeries(txs, seed);

  const premiumSeries = computePremiumSeries(txs);
  const premiumTotals = computePremiumTotals(txs);

  const unknownCounts = new Map<string, number>();
  for (const t of txs) {
    if (t.action === "Unknown") {
      unknownCounts.set(t.rawAction, (unknownCounts.get(t.rawAction) ?? 0) + 1);
    }
  }
  for (const [rawAction, count] of unknownCounts) {
    warnings.push({ kind: "UnknownAction", rawAction, count });
  }

  for (const t of txs) {
    if (t.action !== "Assigned" || !t.option) continue;
    const paired = txs.find(
      (o) =>
        o.tradeDate === t.tradeDate &&
        o.ticker === t.option!.ticker &&
        (o.action === "Buy" || o.action === "Sell") &&
        o.quantity === t.quantity * 100,
    );
    if (!paired) {
      warnings.push({
        kind: "UnpairedAssignment",
        date: t.tradeDate,
        contractKey: `${t.option.ticker}|${t.option.expiry}|${t.option.strike}|${t.option.type}`,
      });
    }
  }

  return {
    config,
    transactions: txs,
    cashLedger: cash.cashLedger,
    externalFlows: cash.externalFlows,
    navSeries,
    openOptionPositions: openOptions,
    openSharePositions: openShares,
    premiumSeries,
    premiumTotals,
    warnings,
  };
}
```

- [ ] **Step 4: Update call sites in affected tests**

Find every call to `computeNavSeries(txs, config)`, `computeShareLedger(txs)`, `computeOpenOptions(txs)`, and `buildPortfolio(txs, config)` in these files:
- `tests/model/metrics/nav.test.ts`
- `tests/model/metrics/positions.test.ts`
- `tests/model/portfolio.test.ts`

Update each to pass a `Seed` parameter. The canonical empty seed for pre-existing tests:

```ts
const seed: Seed = {
  asOf: "<previous-seedDate>",
  cash: <previous-seedValue>,
  initialShares: [],
  initialOptions: [],
};
```

For `buildPortfolio`, the new signature is `buildPortfolio(txs, config, seed)` — pass both.

Read each test file, find all invocations, and apply the update. Add `import type { Seed } from "@/lib/model/types";` where needed.

- [ ] **Step 5: Run model tests**

Run: `npx vitest run tests/model/`
Expected: all tests PASS.

- [ ] **Step 6: Run full typecheck + test suite**

Run: `npm run typecheck && npm test`
Expected: both exit 0.

- [ ] **Step 7: Commit (Tasks 5 + 6 together)**

```bash
git add lib/model/types.ts lib/model/cash.ts lib/model/metrics/nav.ts lib/model/metrics/positions.ts lib/model/portfolio.ts tests/model/
git commit -m "Thread Seed abstraction through portfolio pipeline

Portfolio builder now takes a Seed (asOf, cash, initialShares,
initialOptions) in addition to Config. Config-only callers use
seedFromConfig() for the current default. Transactions before
seed.asOf are dropped. Share ledger, NAV series, and open options
each seed their starting state from the Seed.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: Build a Seed from the earliest Positions snapshot

**Files:**
- Create: `lib/positions/seed.ts`
- Create: `tests/positions/seed.test.ts`

- [ ] **Step 1: Write the failing tests**

Write `tests/positions/seed.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSeedFromSnapshot } from "@/lib/positions/seed";
import type { PositionsSnapshot } from "@/lib/positions/types";

const snap: PositionsSnapshot = {
  asOf: "2026-03-10T09:00",
  cash: 10000,
  totalValue: 15000,
  shares: [
    { ticker: "ACME", quantity: 100, price: 50, marketValue: 5000, costBasis: 48 },
  ],
  options: [
    {
      underlying: "ACME",
      expiry: "2026-04-17",
      strike: 55,
      callPut: "C",
      quantity: -1,
      price: 1.2,
      marketValue: -120,
      delta: 0.35,
      theta: -0.02,
      intrinsicValue: -5,
    },
  ],
  sourceFile: "positions-basic.csv",
};

describe("buildSeedFromSnapshot", () => {
  it("uses the snapshot's date (YYYY-MM-DD) as seed.asOf", () => {
    const seed = buildSeedFromSnapshot(snap);
    expect(seed.asOf).toBe("2026-03-10");
  });

  it("uses snapshot.cash as seed.cash", () => {
    expect(buildSeedFromSnapshot(snap).cash).toBe(10000);
  });

  it("maps shares with positive quantity to initialShares", () => {
    const seed = buildSeedFromSnapshot(snap);
    expect(seed.initialShares).toEqual([
      { ticker: "ACME", shares: 100, costBasis: 48 },
    ]);
  });

  it("maps short option contracts to initialOptions (quantityOpen as absolute value)", () => {
    const seed = buildSeedFromSnapshot(snap);
    expect(seed.initialOptions).toHaveLength(1);
    const opt = seed.initialOptions[0];
    expect(opt.contract).toEqual({
      ticker: "ACME",
      expiry: "2026-04-17",
      strike: 55,
      type: "Call",
    });
    expect(opt.quantityOpen).toBe(1);
    expect(opt.netPremiumCollected).toBe(0);
    expect(opt.entries).toEqual([]);
  });

  it("skips long options (not the wheel strategy's concern)", () => {
    const withLong: PositionsSnapshot = {
      ...snap,
      options: [
        { ...snap.options[0], quantity: 1 }, // long
      ],
    };
    expect(buildSeedFromSnapshot(withLong).initialOptions).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/positions/seed.test.ts`
Expected: FAIL with "Cannot find module '@/lib/positions/seed'"

- [ ] **Step 3: Implement `buildSeedFromSnapshot`**

Write `lib/positions/seed.ts`:

```ts
import type { OpenOption, Seed } from "@/lib/model/types";
import type { PositionsSnapshot } from "@/lib/positions/types";

export function buildSeedFromSnapshot(snap: PositionsSnapshot): Seed {
  const date = snap.asOf.slice(0, 10); // YYYY-MM-DD

  const initialShares = snap.shares
    .filter((s) => s.quantity > 0)
    .map((s) => ({
      ticker: s.ticker,
      shares: s.quantity,
      costBasis: s.costBasis,
    }));

  const initialOptions: OpenOption[] = snap.options
    .filter((o) => o.quantity < 0)
    .map((o) => ({
      contract: {
        ticker: o.underlying,
        expiry: o.expiry,
        strike: o.strike,
        type: o.callPut === "C" ? "Call" : "Put",
      },
      quantityOpen: Math.abs(o.quantity),
      netPremiumCollected: 0,
      entries: [],
    }));

  return {
    asOf: date,
    cash: snap.cash,
    initialShares,
    initialOptions,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/positions/seed.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/positions/seed.ts tests/positions/seed.test.ts
git commit -m "Add buildSeedFromSnapshot

Maps a PositionsSnapshot (earliest drop) into a Seed: cash from the
Cash row, initialShares from positive-quantity Equity rows, and
initialOptions from short option rows (wheel strategy only).

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: Snapshot-aware MarkToMarket (prefer snapshot marks, add options rows)

**Files:**
- Modify: `lib/model/metrics/mark_to_market.ts`
- Modify: `tests/model/metrics/mark_to_market.test.ts`

- [ ] **Step 1: Write new failing tests for snapshot integration**

Append to `tests/model/metrics/mark_to_market.test.ts` (after the existing describe block):

```ts
import type { PositionsSnapshot } from "@/lib/positions/types";

describe("computeMarkToMarket — with snapshot", () => {
  const snapshot: PositionsSnapshot = {
    asOf: "2026-03-10T09:00",
    cash: 7777,
    totalValue: 12777,
    shares: [
      { ticker: "AAA", quantity: 100, price: 30, marketValue: 3000, costBasis: 20 },
    ],
    options: [
      {
        underlying: "AAA",
        expiry: "2026-04-17",
        strike: 35,
        callPut: "C",
        quantity: -1,
        price: 0.5,
        marketValue: -50,
        delta: 0.2,
        theta: -0.01,
        intrinsicValue: 0,
      },
    ],
    sourceFile: "t.csv",
  };

  it("prefers snapshot share price over yfinance quote", () => {
    const state = stateWith([{ ticker: "AAA", qty: 100, cost: 20 }]);
    const mtm = computeMarkToMarket(
      state,
      { AAA: { ticker: "AAA", price: 25, asOf: "2026-03-10T09:00:00Z" } },
      snapshot,
    );
    const row = mtm.rows.find((r) => r.ticker === "AAA")!;
    expect(row.marketPrice).toBe(30);          // snapshot wins over yfinance 25
    expect(row.marketValue).toBe(3000);
  });

  it("uses snapshot cash instead of cash ledger final when snapshot provided", () => {
    const state = stateWith([{ ticker: "AAA", qty: 100, cost: 20 }]);
    const mtm = computeMarkToMarket(
      state,
      { AAA: { ticker: "AAA", price: 25, asOf: "2026-03-10T09:00:00Z" } },
      snapshot,
    );
    expect(mtm.cash).toBe(7777);
  });

  it("exposes option rows from snapshot", () => {
    const state = stateWith([]);
    const mtm = computeMarkToMarket(state, {}, snapshot);
    expect(mtm.optionRows).toHaveLength(1);
    expect(mtm.optionRows![0]).toMatchObject({
      underlying: "AAA",
      strike: 35,
      callPut: "C",
      quantity: -1,
      price: 0.5,
      marketValue: -50,
    });
  });

  it("falls back to yfinance for shares missing from snapshot", () => {
    const state = stateWith([
      { ticker: "AAA", qty: 100, cost: 20 },
      { ticker: "BBB", qty: 50, cost: 40 },
    ]);
    const mtm = computeMarkToMarket(
      state,
      { BBB: { ticker: "BBB", price: 42, asOf: "2026-03-10T09:00:00Z" } },
      snapshot, // snapshot has AAA only
    );
    const bbb = mtm.rows.find((r) => r.ticker === "BBB")!;
    expect(bbb.marketPrice).toBe(42);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/model/metrics/mark_to_market.test.ts`
Expected: FAIL — `computeMarkToMarket` doesn't accept a 3rd argument yet.

- [ ] **Step 3: Implement snapshot-aware MarkToMarket**

Replace `lib/model/metrics/mark_to_market.ts` contents:

```ts
import type { PortfolioState } from "@/lib/model/types";
import type { Quote } from "@/lib/market/quotes";
import type { PositionsSnapshot } from "@/lib/positions/types";

export type MTMRow = {
  ticker: string;
  shares: number;
  costBasis: number;
  marketPrice: number | null;
  marketValue: number;
  unrealized: number;
  unrealizedPct: number;
  quoteAsOf: string | null;
  quoteStale: boolean;
};

export type OptionMTMRow = {
  underlying: string;
  expiry: string;
  strike: number;
  callPut: "C" | "P";
  quantity: number;
  price: number;
  marketValue: number;
  delta: number | null;
  theta: number | null;
  intrinsicValue: number | null;
};

export type MarkToMarket = {
  rows: MTMRow[];
  totalMarketValue: number;
  totalUnrealized: number;
  portfolioValue: number;
  optionsIncomeNav: number;
  cash: number;
  missingQuotes: string[];
  optionRows?: OptionMTMRow[];
};

export function computeMarkToMarket(
  state: PortfolioState,
  quotesByTicker: Record<string, Quote | null>,
  snapshot?: PositionsSnapshot,
): MarkToMarket {
  const snapSharePrice = new Map<string, number>();
  if (snapshot) {
    for (const s of snapshot.shares) snapSharePrice.set(s.ticker, s.price);
  }

  const cash = snapshot
    ? snapshot.cash
    : state.cashLedger.at(-1)?.balance ?? state.config.seedValue;

  const rows: MTMRow[] = [];
  const missingQuotes: string[] = [];

  for (const s of state.openSharePositions) {
    const snapPrice = snapSharePrice.get(s.ticker);
    const quote = quotesByTicker[s.ticker] ?? null;

    let marketPrice: number | null = null;
    let quoteAsOf: string | null = null;
    let quoteStale = false;

    if (snapPrice !== undefined) {
      marketPrice = snapPrice;
      quoteAsOf = snapshot?.asOf ?? null;
      quoteStale = false;
    } else if (quote) {
      marketPrice = quote.price;
      quoteAsOf = quote.asOf;
      quoteStale = quote.stale === true;
    } else {
      missingQuotes.push(s.ticker);
    }

    const priceForValue = marketPrice ?? s.weightedCostBasis;
    const costTotal = s.shares * s.weightedCostBasis;
    const marketValue = s.shares * priceForValue;
    const unrealized = marketValue - costTotal;
    const unrealizedPct = costTotal === 0 ? 0 : unrealized / costTotal;

    rows.push({
      ticker: s.ticker,
      shares: s.shares,
      costBasis: s.weightedCostBasis,
      marketPrice,
      marketValue,
      unrealized,
      unrealizedPct,
      quoteAsOf,
      quoteStale,
    });
  }

  const totalMarketValue = rows.reduce((a, r) => a + r.marketValue, 0);
  const totalCost = state.openSharePositions.reduce(
    (a, s) => a + s.shares * s.weightedCostBasis,
    0,
  );

  const optionRows: OptionMTMRow[] | undefined = snapshot
    ? snapshot.options.map((o) => ({
        underlying: o.underlying,
        expiry: o.expiry,
        strike: o.strike,
        callPut: o.callPut,
        quantity: o.quantity,
        price: o.price,
        marketValue: o.marketValue,
        delta: o.delta,
        theta: o.theta,
        intrinsicValue: o.intrinsicValue,
      }))
    : undefined;

  const optionMarketValue = optionRows
    ? optionRows.reduce((a, r) => a + r.marketValue, 0)
    : 0;

  return {
    rows,
    totalMarketValue,
    totalUnrealized: totalMarketValue - totalCost,
    portfolioValue: cash + totalMarketValue + optionMarketValue,
    optionsIncomeNav: cash + totalCost,
    cash,
    missingQuotes,
    optionRows,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/model/metrics/mark_to_market.test.ts`
Expected: all tests PASS (existing behavior unchanged when no snapshot passed; new tests pass).

- [ ] **Step 5: Full test suite + typecheck**

Run: `npm run typecheck && npm test`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/model/metrics/mark_to_market.ts tests/model/metrics/mark_to_market.test.ts
git commit -m "MarkToMarket prefers snapshot marks, exposes option rows

When a PositionsSnapshot is passed, cash and per-share prices come
from the snapshot (Schwab-authoritative). Shares missing from the
snapshot still fall back to yfinance. Option contracts in the
snapshot surface as optionRows for the dashboard card.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: Dashboard integration

**Files:**
- Modify: `lib/server/dashboard.ts`
- Create: `data/transactions/.gitkeep`
- Create: `data/positions/.gitkeep`

Note: `data/` is gitignored. `.gitkeep` files won't be tracked. They're created here so the directories exist before the first ingest. The ingest skill (Task 10) also `mkdir -p`s them — this step is belt-and-suspenders for local dev.

- [ ] **Step 1: Create the data subdirectories locally**

Run:
```bash
mkdir -p ~/Code/schwab-lens/data/transactions ~/Code/schwab-lens/data/positions
```

No commit — these are untracked (gitignored).

- [ ] **Step 2: Update the dashboard loader**

Replace `lib/server/dashboard.ts` contents:

```ts
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { loadTransactionsFromDir } from "@/lib/csv/load";
import { loadPositionsFromDir, latest, earliest } from "@/lib/positions/load";
import { buildSeedFromSnapshot } from "@/lib/positions/seed";
import { buildPortfolio, seedFromConfig } from "@/lib/model/portfolio";
import { readConfigFile } from "@/lib/config";
import { fetchQuotes, type Quote } from "@/lib/market/quotes";
import {
  computeMarkToMarket,
  type MarkToMarket,
} from "@/lib/model/metrics/mark_to_market";
import type { PortfolioState } from "@/lib/model/types";
import type { PositionsSnapshot } from "@/lib/positions/types";

export type DashboardData =
  | {
      kind: "ready";
      state: PortfolioState;
      sourceFiles: { transactions: string[]; positions: string[] };
      loadedAt: string;
      markToMarket: MarkToMarket | null;
      latestSnapshot: PositionsSnapshot | null;
    }
  | { kind: "no-csv"; dataDir: string }
  | { kind: "no-config"; dataDir: string }
  | { kind: "parse-error"; message: string };

export async function loadDashboard(): Promise<DashboardData> {
  const dataDir = path.join(process.cwd(), "data");
  const config = readConfigFile(dataDir);
  if (!config) return { kind: "no-config", dataDir };

  const transactionsDir = path.join(dataDir, "transactions");
  const positionsDir = path.join(dataDir, "positions");

  try {
    const transactions = loadTransactionsFromDir(transactionsDir);
    const snapshots = loadPositionsFromDir(positionsDir);

    if (transactions.length === 0 && snapshots.length === 0) {
      return { kind: "no-csv", dataDir };
    }

    const earliestSnap = earliest(snapshots);
    const latestSnap = latest(snapshots);
    const seed = earliestSnap
      ? buildSeedFromSnapshot(earliestSnap)
      : seedFromConfig(config);

    const state = buildPortfolio(transactions, config, seed);

    let markToMarket: MarkToMarket | null = null;
    if (
      config.marketData.enabled &&
      (state.openSharePositions.length > 0 || latestSnap !== null)
    ) {
      // Only fetch quotes for tickers the snapshot does NOT cover.
      const snapSymbols = new Set(
        (latestSnap?.shares ?? []).map((s) => s.ticker),
      );
      const missing = state.openSharePositions
        .map((s) => s.ticker)
        .filter((t) => !snapSymbols.has(t));

      const quoteMap: Record<string, Quote | null> = {};
      if (missing.length > 0) {
        const results = await fetchQuotes(missing);
        for (const r of results) {
          if (r.kind === "ok") quoteMap[r.quote.ticker] = r.quote;
        }
        for (const t of missing) if (!(t in quoteMap)) quoteMap[t] = null;
      }
      markToMarket = computeMarkToMarket(
        state,
        quoteMap,
        latestSnap ?? undefined,
      );
    }

    return {
      kind: "ready",
      state,
      sourceFiles: {
        transactions: listCsvFiles(transactionsDir),
        positions: snapshots.map((s) => s.sourceFile),
      },
      loadedAt: new Date().toISOString(),
      markToMarket,
      latestSnapshot: latestSnap,
    };
  } catch (err) {
    return {
      kind: "parse-error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

function listCsvFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .sort();
}
```

- [ ] **Step 3: Update `app/page.tsx` for the new `sourceFiles` shape**

Read `app/page.tsx`. Find the header that references `sourceFile` and change to show counts. Replace the block:

```tsx
const { state, sourceFile, loadedAt, markToMarket } = data;
```

with:

```tsx
const { state, sourceFiles, loadedAt, markToMarket } = data;
```

And replace:

```tsx
Source: <code className="bg-gray-100 dark:bg-neutral-800 px-1 rounded">{sourceFile}</code>
```

with:

```tsx
Source: <code className="bg-gray-100 dark:bg-neutral-800 px-1 rounded">{sourceFiles.transactions.length} transactions · {sourceFiles.positions.length} positions</code>
```

- [ ] **Step 4: Typecheck and smoke-test**

Run: `npm run typecheck`
Expected: exits 0.

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Migrate existing data (local only, no commit)**

If there is currently a CSV directly in `data/`, move it into the new subdir:

```bash
ls ~/Code/schwab-lens/data/
# If a Demo_*_Transactions_*.csv file is there:
mv ~/Code/schwab-lens/data/Demo_*_Transactions_*.csv ~/Code/schwab-lens/data/transactions/
```

- [ ] **Step 6: Manual smoke test**

Run: `npm run dev`
Visit: `http://localhost:3000`
Expected: dashboard renders. If no positions file exists, behavior is unchanged from before. If a positions file is added to `data/positions/`, cash + share marks come from the snapshot.

- [ ] **Step 7: Commit**

```bash
git add lib/server/dashboard.ts app/page.tsx
git commit -m "Wire positions loader into dashboard

Transactions now load from data/transactions/ (multi-file dedup).
Positions load from data/positions/ (sorted snapshots). Earliest
snapshot seeds the portfolio; latest snapshot anchors current cash,
share marks, and option marks in MarkToMarket. yfinance is only
called for share tickers absent from the latest snapshot.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 10: Render option rows in MarkToMarketCard

**Files:**
- Modify: `app/components/MarkToMarketCard.tsx`

- [ ] **Step 1: Read the current card to understand its structure**

Run: `Read ~/Code/schwab-lens/app/components/MarkToMarketCard.tsx`

Note the existing render pattern (table of share rows). You will add a second table underneath for options when `markToMarket.optionRows` is defined and non-empty.

- [ ] **Step 2: Add the options section**

Inside the component's returned JSX, after the existing shares table (before the closing wrapper), add:

```tsx
{markToMarket.optionRows && markToMarket.optionRows.length > 0 && (
  <div className="mt-4">
    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
      Open option contracts (Schwab marks)
    </div>
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
          <th className="py-1">Contract</th>
          <th className="py-1 text-right">Qty</th>
          <th className="py-1 text-right">Mark</th>
          <th className="py-1 text-right">Value</th>
          <th className="py-1 text-right">Δ</th>
          <th className="py-1 text-right">Θ</th>
        </tr>
      </thead>
      <tbody>
        {markToMarket.optionRows.map((o) => (
          <tr key={`${o.underlying}|${o.expiry}|${o.strike}|${o.callPut}`} className="border-t border-gray-100 dark:border-neutral-800">
            <td className="py-1">{o.underlying} {o.expiry} {o.strike} {o.callPut}</td>
            <td className="py-1 text-right">{o.quantity}</td>
            <td className="py-1 text-right">${o.price.toFixed(2)}</td>
            <td className="py-1 text-right">${o.marketValue.toFixed(2)}</td>
            <td className="py-1 text-right">{o.delta?.toFixed(2) ?? "—"}</td>
            <td className="py-1 text-right">{o.theta?.toFixed(2) ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}
```

Add the import at the top of the file:

```tsx
import type { MarkToMarket } from "@/lib/model/metrics/mark_to_market";
```

(Only if not already imported.)

- [ ] **Step 3: Typecheck + smoke test**

Run: `npm run typecheck`
Expected: exits 0.

Run: `npm run dev` (if not already running)
Visit the dashboard with a Positions CSV in `data/positions/`.
Expected: an "Open option contracts" table appears under the shares MTM table.

- [ ] **Step 4: Commit**

```bash
git add app/components/MarkToMarketCard.tsx
git commit -m "Render option marks in MarkToMarketCard

Surfaces the snapshot-derived option rows (Schwab mark price, market
value, delta, theta) below the shares table. Hidden when no snapshot
is loaded.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 11: The `/ingest` skill

**Files:**
- Create: `~/.claude/skills/ingest/SKILL.md`

- [ ] **Step 1: Confirm skills dir exists**

Run: `ls -d ~/.claude/skills 2>/dev/null || mkdir -p ~/.claude/skills`

- [ ] **Step 2: Create the skill**

Write `~/.claude/skills/ingest/SKILL.md`:

```markdown
---
name: ingest
description: Move Schwab Demo Transactions and Positions CSVs from ~/Downloads into the schwab-lens repo data/ subdirectories. Use when the user says "ingest my schwab-lens", "move schwab-lens downloads", invokes /ingest, or has just downloaded Schwab exports they want in the repo.
---

# Demo — ingest downloaded CSVs

Move any Schwab Demo CSVs sitting in `~/Downloads` into the correct subdirectory of the schwab-lens repo. Safe to re-run: uses `mv -n` (no-clobber) so nothing is overwritten.

**Target repo:** `~/Code/schwab-lens`

Execute these steps in order.

1. Ensure the destination dirs exist:

   ```bash
   mkdir -p ~/Code/schwab-lens/data/transactions ~/Code/schwab-lens/data/positions
   ```

2. Move Transactions CSVs:

   ```bash
   for f in ~/Downloads/Demo*Transactions*.csv; do
     [ -e "$f" ] || continue
     mv -n "$f" ~/Code/schwab-lens/data/transactions/
   done
   ```

3. Move Positions CSVs:

   ```bash
   for f in ~/Downloads/Demo*Positions*.csv; do
     [ -e "$f" ] || continue
     mv -n "$f" ~/Code/schwab-lens/data/positions/
   done
   ```

4. Report what moved and what stayed:

   ```bash
   echo "== data/transactions =="
   ls -1 ~/Code/schwab-lens/data/transactions/ || true
   echo "== data/positions =="
   ls -1 ~/Code/schwab-lens/data/positions/ || true
   echo "== ~/Downloads (remaining Demo files, if any, were kept because a same-name file already existed at the destination) =="
   ls -1 ~/Downloads/ 2>/dev/null | grep -E '^Demo' || echo "(none)"
   ```

Never commit or push — the user runs those manually. This skill only moves files on the local filesystem.
```

- [ ] **Step 3: Verify the skill loads**

In a fresh Claude Code session (or `/skills` listing), confirm `ingest` appears. Manual check: type `/ingest` and verify it runs the four steps above.

- [ ] **Step 4: No commit**

The skill lives in `~/.claude/skills/`, outside the repo. Nothing to commit.

---

## Final verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: End-to-end smoke test**

1. Drop a real Transactions CSV into `data/transactions/`.
2. Drop a real Positions CSV into `data/positions/`.
3. Run `npm run dev`.
4. Verify on `http://localhost:3000`:
   - Header reports `N transactions · M positions`.
   - "Cash" in the summary strip matches the Positions CSV "Cash & Cash Investments" value.
   - Share rows show snapshot prices (not yfinance).
   - A new "Open option contracts" table appears inside the MarkToMarket card.
5. Drop an **older** Positions CSV into `data/positions/` too. Reload. Verify nothing breaks (earliest snapshot now seeds; latest still anchors "now").
6. Run `/ingest` from a session with a fresh Demo CSV in `~/Downloads`. Verify it lands in the right subdir.

- [ ] **Step 5: Hygiene check before PR (if using PR flow)**

Run: `git status && git diff --cached`
Verify: no real financial data (no real CSVs, no personal account details in fixtures).

- [ ] **Step 6: Open PR (if using PR flow)**

```bash
git push -u origin fix/N-positions-csv-ingestion
gh pr create --title "Integrate Schwab Positions CSV" --body "$(cat <<'EOF'
## Summary
- Positions CSVs now live alongside Transactions in `data/positions/` and `data/transactions/`.
- Earliest Positions snapshot seeds the portfolio (replaces hardcoded config seed when present).
- Latest Positions snapshot anchors current cash, share marks, and option marks.
- MarkToMarket prefers Schwab's snapshot prices over yfinance; yfinance fills gaps.
- New `/ingest` skill (user-level) moves `~/Downloads/Demo*.csv` into the right subdir.

## Test plan
- [x] Vitest: parser, loaders, seed builder, portfolio, MTM — all pass
- [x] Typecheck + lint clean
- [ ] Manual smoke: dashboard renders with/without snapshot; option rows appear when snapshot present
- [ ] `/ingest` moves a fresh download correctly

*Co-authored by Claude*
EOF
)"
```
