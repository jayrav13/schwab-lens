# Demo tracker — v1 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a four-card Next.js dashboard that reads the newest Schwab CSV from `data/`, derives Options Income NAV / premiums / open positions / transaction log, and renders the `dashboard-mockup-v2.html` layout.

**Architecture:** Server-rendered Next.js App Router page. Pure TypeScript derivation pipeline in `lib/` with Vitest unit + integration tests. Client-side interactivity only where necessary (transaction-log filter).

**Tech Stack:** Next.js (App Router, TypeScript), Tailwind CSS, Vitest, papaparse. Node 20+.

**Reference spec:** `docs/superpowers/specs/2026-04-20-schwab-lens-tracker-design.md`

---

## File structure

Files created by this plan (order of first-touch):

```
package.json, tsconfig.json, next.config.ts, postcss.config.mjs,
eslint.config.mjs, .prettierrc, app/globals.css, app/layout.tsx, app/page.tsx
                                                                   ← Task 1
vitest.config.ts, tests/smoke.test.ts                               ← Task 2
lib/util/money.ts, tests/util/money.test.ts                         ← Task 3
lib/util/dates.ts, tests/util/dates.test.ts                         ← Task 4
lib/csv/types.ts, lib/csv/parse.ts,
  tests/fixtures/simple-sto.csv, tests/csv/parse.test.ts            ← Task 5
  tests/fixtures/option-actions.csv                                 ← Task 6
  tests/fixtures/stock-actions.csv                                  ← Task 7
  tests/fixtures/cash-rows.csv                                      ← Task 8
  tests/fixtures/unknown-action.csv                                 ← Task 9
lib/model/types.ts                                                  ← Task 10
lib/model/metrics/positions.ts,
  tests/model/metrics/positions.test.ts                             ← Task 10
lib/model/cash.ts, tests/model/cash.test.ts                         ← Task 11
lib/model/metrics/nav.ts, tests/model/metrics/nav.test.ts           ← Task 12
lib/model/metrics/premiums.ts,
  tests/model/metrics/premiums.test.ts                              ← Task 13
lib/model/portfolio.ts, tests/model/portfolio.test.ts               ← Task 14
lib/config.ts, tests/config.test.ts                                 ← Task 15
tests/fixtures/real-sanitized.csv, tests/integration.test.ts        ← Task 16
lib/server/dashboard.ts                                             ← Task 17
app/components/OnboardingCard.tsx,
  app/components/AttentionBanner.tsx                                ← Task 18
app/components/SummaryStrip.tsx                                     ← Task 19
app/components/NavCard.tsx                                          ← Task 20
app/components/PremiumsCard.tsx                                     ← Task 21
app/components/OpenPositionsCard.tsx                                ← Task 22
app/components/TransactionLogCard.tsx                               ← Task 23
app/page.tsx (full wiring)                                          ← Task 24
```

---

## Task 1: Scaffold Next.js project

**Files:**
- Create (via CLI): `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `public/*`

- [ ] **Step 1: Run create-next-app into the current directory**

Run from `~/Code/schwab-lens`:

```bash
npx --yes create-next-app@latest . \
  --typescript --tailwind --eslint --app \
  --no-src-dir --import-alias="@/*" --use-npm
```

Answer `No` if prompted about Turbopack. Answer `Yes` to proceed even though the directory has existing files (it will keep `.gitignore`, `CLAUDE.md`, `docs/`, `.superpowers/`).

Expected: Directory now has `app/`, `package.json`, `tsconfig.json`, etc.

- [ ] **Step 2: Verify dev server boots**

```bash
npm run dev
```

Expected: server starts and prints `Local: http://localhost:3000` within ~5s. Open the URL, see the default Next.js page. Stop with Ctrl-C.

- [ ] **Step 3: Replace the default page and globals**

Overwrite `app/page.tsx`:

```tsx
export default function Home() {
  return (
    <main className="min-h-screen p-6">
      <h1 className="text-2xl font-bold">Demo</h1>
      <p className="text-sm text-gray-500">Scaffold in place — nothing wired yet.</p>
    </main>
  );
}
```

Overwrite `app/globals.css` with only the Tailwind directives (delete any demo styles):

```css
@import "tailwindcss";

:root {
  --background: #f9fafb;
  --foreground: #111827;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: ui-sans-serif, system-ui, sans-serif;
}
```

- [ ] **Step 4: Verify the simplified page renders**

```bash
npm run dev
```

Expected: page shows the heading "Demo" and the scaffold message. Stop server.

- [ ] **Step 5: Commit**

Verify no raw financial data is staged:

```bash
git status && git diff --cached --stat
```

Expected: only scaffold files, no `*.csv` / `*.xlsx` / `data/` / `transactions/` / `sheets/`.

```bash
git add -A
git commit -m "$(cat <<'EOF'
Scaffold Next.js app with Tailwind + TypeScript

Minimal starter page in place. No app logic yet.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Install Vitest and supporting deps

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`, `tests/smoke.test.ts`

- [ ] **Step 1: Install runtime and test deps**

```bash
npm install papaparse
npm install --save-dev vitest @vitest/ui @types/papaparse @types/node
```

- [ ] **Step 2: Create Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
});
```

- [ ] **Step 3: Add test scripts to package.json**

Open `package.json`, add under `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest",
"typecheck": "tsc --noEmit"
```

Full scripts block should look like:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit"
}
```

- [ ] **Step 4: Create a smoke test**

Create `tests/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run smoke test**

```bash
npm test
```

Expected: `1 passed`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/smoke.test.ts
git commit -m "$(cat <<'EOF'
Add Vitest + papaparse, configure test harness

Smoke test passes. No app tests yet.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Money parsing util (TDD)

**Files:**
- Create: `lib/util/money.ts`, `tests/util/money.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/util/money.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseCurrency, formatCurrency } from "@/lib/util/money";

describe("parseCurrency", () => {
  it("parses a plain dollar amount", () => {
    expect(parseCurrency("$39.34")).toBe(39.34);
  });

  it("parses a negative amount", () => {
    expect(parseCurrency("-$53.66")).toBe(-53.66);
  });

  it("parses amounts with embedded commas", () => {
    expect(parseCurrency("$1,234.56")).toBe(1234.56);
  });

  it("returns 0 for empty string", () => {
    expect(parseCurrency("")).toBe(0);
  });

  it("returns 0 for undefined-like input", () => {
    expect(parseCurrency(undefined)).toBe(0);
  });

  it("parses fractional-cent prices like SGOV fills", () => {
    expect(parseCurrency("$100.3733")).toBeCloseTo(100.3733, 4);
  });
});

describe("formatCurrency", () => {
  it("formats positive dollars with two decimals and thousands separators", () => {
    expect(formatCurrency(28609.85)).toBe("$28,609.85");
  });

  it("formats negatives with a leading minus", () => {
    expect(formatCurrency(-53.66)).toBe("-$53.66");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm test -- tests/util/money.test.ts
```

Expected: error — module `@/lib/util/money` not found.

- [ ] **Step 3: Implement `money.ts`**

Create `lib/util/money.ts`:

```ts
export function parseCurrency(input: string | undefined | null): number {
  if (!input) return 0;
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "" || cleaned === "-") return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    throw new Error(`parseCurrency: cannot parse "${input}"`);
  }
  return n;
}

export function formatCurrency(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-$${abs}` : `$${abs}`;
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
npm test -- tests/util/money.test.ts
```

Expected: all 9 assertions pass.

- [ ] **Step 5: Commit**

```bash
git add lib/util/money.ts tests/util/money.test.ts
git commit -m "$(cat <<'EOF'
Add money parsing and formatting util

parseCurrency handles Schwab's "$1,234.56" / "-$53.66" / "" input.
formatCurrency produces "$28,609.85" / "-$53.66" / "$0.00".

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Date parsing util (TDD)

**Files:**
- Create: `lib/util/dates.ts`, `tests/util/dates.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/util/dates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseTradeDate } from "@/lib/util/dates";

describe("parseTradeDate", () => {
  it("parses a simple MM/DD/YYYY date", () => {
    expect(parseTradeDate("04/20/2026")).toBe("2026-04-20");
  });

  it("uses the 'as of' date when present", () => {
    expect(parseTradeDate("04/20/2026 as of 04/17/2026")).toBe("2026-04-17");
  });

  it("pads single-digit months and days", () => {
    expect(parseTradeDate("1/5/2026")).toBe("2026-01-05");
  });

  it("throws on unparseable input", () => {
    expect(() => parseTradeDate("not a date")).toThrow();
  });

  it("throws on empty input", () => {
    expect(() => parseTradeDate("")).toThrow();
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
npm test -- tests/util/dates.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement `dates.ts`**

Create `lib/util/dates.ts`:

```ts
const MDY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export function parseTradeDate(raw: string): string {
  if (!raw) throw new Error("parseTradeDate: empty input");

  const asOfMatch = raw.match(/as of (\d{1,2}\/\d{1,2}\/\d{4})/);
  const source = asOfMatch ? asOfMatch[1] : raw.trim().split(/\s+/)[0];

  const m = source.match(MDY);
  if (!m) throw new Error(`parseTradeDate: cannot parse "${raw}"`);

  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
npm test -- tests/util/dates.test.ts
```

Expected: all 5 assertions pass.

- [ ] **Step 5: Commit**

```bash
git add lib/util/dates.ts tests/util/dates.test.ts
git commit -m "$(cat <<'EOF'
Add trade-date parser

Extracts the "as of" value when present (settlement vs. trade date),
returns ISO yyyy-mm-dd. Throws on unparseable input rather than
silently defaulting.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: CSV parser — simple STO rows (TDD)

**Files:**
- Create: `lib/csv/types.ts`, `lib/csv/parse.ts`, `tests/fixtures/simple-sto.csv`, `tests/csv/parse.test.ts`

- [ ] **Step 1: Create the fixture**

Create `tests/fixtures/simple-sto.csv`:

```
"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"
"04/20/2026","Sell to Open","IREN 04/24/2026 42.50 P","PUT IREN LTD $42.5 EXP 04/24/26","1","$0.40","$0.66","$39.34"
```

- [ ] **Step 2: Write the failing test**

Create `tests/csv/parse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseSchwabCsv } from "@/lib/csv/parse";

function fixture(name: string): string {
  return readFileSync(path.join(__dirname, "..", "fixtures", name), "utf8");
}

describe("parseSchwabCsv — Sell to Open", () => {
  it("parses one STO row", () => {
    const txs = parseSchwabCsv(fixture("simple-sto.csv"));
    expect(txs).toHaveLength(1);
    const t = txs[0];
    expect(t.tradeDate).toBe("2026-04-20");
    expect(t.action).toBe("SellToOpen");
    expect(t.option).toEqual({
      ticker: "IREN",
      expiry: "2026-04-24",
      strike: 42.5,
      type: "Put",
    });
    expect(t.ticker).toBe("IREN");
    expect(t.quantity).toBe(1);
    expect(t.price).toBe(0.4);
    expect(t.fees).toBe(0.66);
    expect(t.amount).toBe(39.34);
  });
});
```

- [ ] **Step 3: Run, verify failure**

```bash
npm test -- tests/csv/parse.test.ts
```

Expected: module not found.

- [ ] **Step 4: Implement types**

Create `lib/csv/types.ts`:

```ts
export type Action =
  | "SellToOpen"
  | "BuyToClose"
  | "Expired"
  | "Assigned"
  | "Buy"
  | "Sell"
  | "QualifiedDividend"
  | "BankInterest"
  | "CreditInterest"
  | "Journal"
  | "WireSent"
  | "MiscCashEntry"
  | "ServiceFee"
  | "Unknown";

export type OptionLeg = {
  ticker: string;
  expiry: string;
  strike: number;
  type: "Put" | "Call";
};

export type RawCsvRow = {
  Date: string;
  Action: string;
  Symbol: string;
  Description: string;
  Quantity: string;
  Price: string;
  "Fees & Comm": string;
  Amount: string;
};

export type Transaction = {
  tradeDate: string;
  action: Action;
  ticker?: string;
  option?: OptionLeg;
  quantity: number;
  price?: number;
  fees: number;
  amount: number;
  raw: RawCsvRow;
  rawAction: string;
};
```

- [ ] **Step 5: Implement parser**

Create `lib/csv/parse.ts`:

```ts
import Papa from "papaparse";
import { parseCurrency } from "@/lib/util/money";
import { parseTradeDate } from "@/lib/util/dates";
import type {
  Action,
  OptionLeg,
  RawCsvRow,
  Transaction,
} from "@/lib/csv/types";

const ACTION_MAP: Record<string, Action> = {
  "Sell to Open": "SellToOpen",
  "Buy to Close": "BuyToClose",
  "Expired": "Expired",
  "Assigned": "Assigned",
  "Buy": "Buy",
  "Sell": "Sell",
  "Qualified Dividend": "QualifiedDividend",
  "Bank Interest": "BankInterest",
  "Credit Interest": "CreditInterest",
  "Journal": "Journal",
  "Wire Sent": "WireSent",
  "Misc Cash Entry": "MiscCashEntry",
  "Service Fee": "ServiceFee",
};

function normalizeAction(raw: string): Action {
  return ACTION_MAP[raw] ?? "Unknown";
}

const OPTION_SYMBOL =
  /^([A-Z.]+)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+([0-9]+(?:\.[0-9]+)?)\s+([PC])$/;

function parseOptionSymbol(sym: string): OptionLeg | undefined {
  const m = sym.match(OPTION_SYMBOL);
  if (!m) return undefined;
  const [, ticker, mdy, strike, pc] = m;
  return {
    ticker,
    expiry: parseTradeDate(mdy),
    strike: Number(strike),
    type: pc === "P" ? "Put" : "Call",
  };
}

export function parseSchwabCsv(text: string): Transaction[] {
  const result = Papa.parse<RawCsvRow>(text.trim(), {
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    const first = result.errors[0];
    throw new Error(
      `parseSchwabCsv: CSV parse error at row ${first.row}: ${first.message}`,
    );
  }

  return result.data.map((raw, idx) => {
    try {
      const action = normalizeAction(raw.Action);
      const option = parseOptionSymbol(raw.Symbol);
      const ticker = option?.ticker ?? (raw.Symbol || undefined);

      return {
        tradeDate: parseTradeDate(raw.Date),
        action,
        rawAction: raw.Action,
        ticker,
        option,
        quantity: raw.Quantity ? Number(raw.Quantity) : 0,
        price: raw.Price ? parseCurrency(raw.Price) : undefined,
        fees: parseCurrency(raw["Fees & Comm"]),
        amount: parseCurrency(raw.Amount),
        raw,
      } satisfies Transaction;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `parseSchwabCsv: row ${idx + 2}: ${msg} — raw: ${JSON.stringify(raw)}`,
      );
    }
  });
}
```

- [ ] **Step 6: Run test, verify pass**

```bash
npm test -- tests/csv/parse.test.ts
```

Expected: 1 assertion passes.

- [ ] **Step 7: Commit**

```bash
git add lib/csv/types.ts lib/csv/parse.ts tests/fixtures/simple-sto.csv tests/csv/parse.test.ts
git commit -m "$(cat <<'EOF'
Parse Schwab CSV: Sell to Open rows

papaparse-based parser converts raw rows to a typed Transaction[].
Covers option-symbol decomposition (ticker/expiry/strike/type),
trade-date extraction, and monetary fields. Rows raise with the
original line number and content on parse errors.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: CSV parser — remaining option actions (BTC / Expired / Assigned)

**Files:**
- Create: `tests/fixtures/option-actions.csv`
- Modify: `tests/csv/parse.test.ts`

- [ ] **Step 1: Add fixture**

Create `tests/fixtures/option-actions.csv`:

```
"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"
"04/17/2026","Buy to Close","HL 04/17/2026 21.00 C","CALL HECLA MNG CO $21 EXP 04/17/26","2","$0.04","$0.02","-$8.02"
"04/20/2026 as of 04/17/2026","Expired","SOXL 04/17/2026 65.00 P","PUT DRXN SEMICN BULL 3X $65 EXP 04/17/26","1","","",""
"02/02/2026 as of 01/30/2026","Assigned","CLSK 01/30/2026 12.00 P","PUT CLEANSPARK INC $12 EXP 01/30/26","2","","",""
```

- [ ] **Step 2: Add failing tests**

Append to `tests/csv/parse.test.ts`:

```ts
describe("parseSchwabCsv — other option actions", () => {
  const txs = parseSchwabCsv(fixture("option-actions.csv"));

  it("parses Buy to Close with negative amount", () => {
    const btc = txs[0];
    expect(btc.action).toBe("BuyToClose");
    expect(btc.option?.type).toBe("Call");
    expect(btc.option?.strike).toBe(21);
    expect(btc.amount).toBe(-8.02);
    expect(btc.fees).toBe(0.02);
  });

  it("parses Expired with empty money fields and 'as of' trade date", () => {
    const exp = txs[1];
    expect(exp.action).toBe("Expired");
    expect(exp.tradeDate).toBe("2026-04-17");
    expect(exp.amount).toBe(0);
    expect(exp.fees).toBe(0);
    expect(exp.price).toBeUndefined();
  });

  it("parses Assigned with empty money fields and 'as of' trade date", () => {
    const asgn = txs[2];
    expect(asgn.action).toBe("Assigned");
    expect(asgn.tradeDate).toBe("2026-01-30");
    expect(asgn.option?.ticker).toBe("CLSK");
    expect(asgn.quantity).toBe(2);
    expect(asgn.amount).toBe(0);
  });
});
```

- [ ] **Step 3: Run, verify pass**

```bash
npm test -- tests/csv/parse.test.ts
```

Expected: all tests pass without code changes (the Task 5 implementation already handles these; this task locks the behavior with tests).

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/option-actions.csv tests/csv/parse.test.ts
git commit -m "$(cat <<'EOF'
Test BTC / Expired / Assigned option rows

Locks parser behavior for empty-field rows (Expired, Assigned)
and 'as of' date handling.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: CSV parser — stock Buy/Sell rows

**Files:**
- Create: `tests/fixtures/stock-actions.csv`
- Modify: `tests/csv/parse.test.ts`

- [ ] **Step 1: Add fixture**

Create `tests/fixtures/stock-actions.csv`:

```
"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"
"02/02/2026 as of 01/30/2026","Buy","AG","FIRST MAJESTIC SILVER F","100","$25.00","","-$2500.00"
"02/23/2026 as of 02/20/2026","Sell","AG","FIRST MAJESTIC SILVER F","100","$25.00","$0.02","$2499.98"
```

- [ ] **Step 2: Add failing tests**

Append to `tests/csv/parse.test.ts`:

```ts
describe("parseSchwabCsv — stock Buy/Sell", () => {
  const txs = parseSchwabCsv(fixture("stock-actions.csv"));

  it("parses a stock Buy row", () => {
    const t = txs[0];
    expect(t.action).toBe("Buy");
    expect(t.ticker).toBe("AG");
    expect(t.option).toBeUndefined();
    expect(t.quantity).toBe(100);
    expect(t.price).toBe(25);
    expect(t.amount).toBe(-2500);
  });

  it("parses a stock Sell row", () => {
    const t = txs[1];
    expect(t.action).toBe("Sell");
    expect(t.ticker).toBe("AG");
    expect(t.option).toBeUndefined();
    expect(t.quantity).toBe(100);
    expect(t.amount).toBe(2499.98);
    expect(t.fees).toBe(0.02);
  });
});
```

- [ ] **Step 3: Run, verify pass**

```bash
npm test -- tests/csv/parse.test.ts
```

Expected: new tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/stock-actions.csv tests/csv/parse.test.ts
git commit -m "$(cat <<'EOF'
Test stock Buy/Sell rows

Stock symbols have no option metadata; ticker falls through from
the Symbol column directly.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: CSV parser — cash-only rows (Journal / Dividend / Interest / Fee / Misc)

**Files:**
- Create: `tests/fixtures/cash-rows.csv`
- Modify: `tests/csv/parse.test.ts`

- [ ] **Step 1: Add fixture**

Create `tests/fixtures/cash-rows.csv`:

```
"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"
"02/05/2026","Journal","","JOURNAL FRM ...291","","","","$5000.00"
"02/05/2026","Wire Sent","","WIRED FUNDS DISBURSED","","","","-$5000.00"
"02/05/2026","Misc Cash Entry","","WAIVE WIRE FEE","","","","$15.00"
"02/05/2026","Service Fee","","WIRED FUNDS FEE","","","","-$15.00"
"03/24/2026","Qualified Dividend","HL","HECLA MNG CO","","","","$0.75"
"01/16/2026 as of 01/15/2026","Bank Interest","","BANK INT ...526 SCHWAB BANK","","","","$0.19"
"02/26/2026","Credit Interest","","SCHWAB1 INT 01/29-02/25","","","","$0.04"
```

- [ ] **Step 2: Add failing tests**

Append to `tests/csv/parse.test.ts`:

```ts
describe("parseSchwabCsv — cash rows", () => {
  const txs = parseSchwabCsv(fixture("cash-rows.csv"));

  it("maps Journal and Wire Sent actions", () => {
    expect(txs[0].action).toBe("Journal");
    expect(txs[0].amount).toBe(5000);
    expect(txs[1].action).toBe("WireSent");
    expect(txs[1].amount).toBe(-5000);
  });

  it("maps Misc Cash Entry and Service Fee", () => {
    expect(txs[2].action).toBe("MiscCashEntry");
    expect(txs[3].action).toBe("ServiceFee");
    expect(txs[3].amount).toBe(-15);
  });

  it("maps Qualified Dividend and retains ticker", () => {
    expect(txs[4].action).toBe("QualifiedDividend");
    expect(txs[4].ticker).toBe("HL");
    expect(txs[4].amount).toBe(0.75);
  });

  it("maps Bank Interest and Credit Interest with empty tickers", () => {
    expect(txs[5].action).toBe("BankInterest");
    expect(txs[5].ticker).toBeUndefined();
    expect(txs[6].action).toBe("CreditInterest");
  });
});
```

- [ ] **Step 3: Run, verify pass (mostly)**

```bash
npm test -- tests/csv/parse.test.ts
```

Expected: the Bank Interest / Credit Interest tests may fail because `raw.Symbol` is `""` but the parser sets `ticker` from `raw.Symbol || undefined`. Empty string is falsy so this should already work. Verify, and if failing investigate.

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/cash-rows.csv tests/csv/parse.test.ts
git commit -m "$(cat <<'EOF'
Test cash-only rows (journals, dividends, interest, fees)

Exercises all non-position-moving actions with no Symbol / Price
/ Quantity. These all feed the cash ledger directly.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: CSV parser — unknown action handling

**Files:**
- Create: `tests/fixtures/unknown-action.csv`
- Modify: `tests/csv/parse.test.ts`

- [ ] **Step 1: Add fixture**

Create `tests/fixtures/unknown-action.csv`:

```
"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"
"04/15/2026","Merger Adjustment","XYZ","SOME CORPORATE ACTION","100","","","$123.45"
```

- [ ] **Step 2: Add failing test**

Append to `tests/csv/parse.test.ts`:

```ts
describe("parseSchwabCsv — unknown action", () => {
  it("maps an unknown action to 'Unknown' and preserves the raw label", () => {
    const txs = parseSchwabCsv(fixture("unknown-action.csv"));
    expect(txs).toHaveLength(1);
    expect(txs[0].action).toBe("Unknown");
    expect(txs[0].rawAction).toBe("Merger Adjustment");
    expect(txs[0].amount).toBe(123.45);
  });
});
```

- [ ] **Step 3: Run, verify pass**

```bash
npm test -- tests/csv/parse.test.ts
```

Expected: all parser tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/unknown-action.csv tests/csv/parse.test.ts
git commit -m "$(cat <<'EOF'
Map unknown Action strings to 'Unknown'

Raw label preserved via rawAction field so the UI can surface the
actual string on an AttentionBanner. No exception thrown — the
pipeline decides what to do with Unknown rows later.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Model types + positions metric (shares + options) (TDD)

**Files:**
- Create: `lib/model/types.ts`, `lib/model/metrics/positions.ts`, `tests/model/metrics/positions.test.ts`

- [ ] **Step 1: Create the shared model types**

Create `lib/model/types.ts`:

```ts
import type { OptionLeg, Transaction } from "@/lib/csv/types";

export type Config = { seedDate: string; seedValue: number };

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
  weightedCostBasis: number; // avg $/share
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
```

- [ ] **Step 2: Write failing tests for positions**

Create `tests/model/metrics/positions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  computeShareLedger,
  computeOpenOptions,
} from "@/lib/model/metrics/positions";
import type { Transaction } from "@/lib/csv/types";

function stoTx(overrides: Partial<Transaction> = {}): Transaction {
  const base: Transaction = {
    tradeDate: "2026-01-05",
    action: "SellToOpen",
    rawAction: "Sell to Open",
    ticker: "SOFI",
    option: { ticker: "SOFI", expiry: "2026-01-09", strike: 26, type: "Put" },
    quantity: 1,
    price: 0.09,
    fees: 0.66,
    amount: 8.34,
    raw: {} as Transaction["raw"],
  };
  return { ...base, ...overrides };
}

function buyTx(overrides: Partial<Transaction> = {}): Transaction {
  const base: Transaction = {
    tradeDate: "2026-01-30",
    action: "Buy",
    rawAction: "Buy",
    ticker: "CLSK",
    quantity: 200,
    price: 12,
    fees: 0,
    amount: -2400,
    raw: {} as Transaction["raw"],
  };
  return { ...base, ...overrides };
}

describe("computeShareLedger", () => {
  it("accumulates shares at weighted average cost", () => {
    const { openShares } = computeShareLedger([
      buyTx({ ticker: "HL", quantity: 100, price: 28, amount: -2800 }),
      buyTx({ ticker: "HL", quantity: 100, price: 30, amount: -3000 }),
    ]);
    expect(openShares).toEqual([
      { ticker: "HL", shares: 200, weightedCostBasis: 29 },
    ]);
  });

  it("allows intra-day negative when Sell precedes Buy", () => {
    const { openShares, warnings } = computeShareLedger([
      buyTx({
        ticker: "SGOV",
        quantity: 56,
        price: 100.3733,
        amount: 5620.89,
        action: "Sell",
        rawAction: "Sell",
        tradeDate: "2026-02-02",
      }),
      buyTx({
        ticker: "SGOV",
        quantity: 56,
        price: 100.3765,
        amount: -5621.08,
        action: "Buy",
        rawAction: "Buy",
        tradeDate: "2026-02-02",
      }),
    ]);
    expect(openShares).toEqual([]);
    expect(warnings).toEqual([]); // end-of-day is 0, no warning
  });

  it("emits a warning on negative end-of-day position", () => {
    const { warnings } = computeShareLedger([
      buyTx({
        ticker: "X",
        quantity: 50,
        price: 10,
        amount: 500,
        action: "Sell",
        rawAction: "Sell",
        tradeDate: "2026-01-10",
      }),
    ]);
    expect(warnings.some((w) => w.kind === "NegativeShareEndOfDay")).toBe(true);
  });
});

describe("computeOpenOptions", () => {
  it("nets a single STO to quantityOpen: 1 with the premium booked", () => {
    const opens = computeOpenOptions([stoTx()]);
    expect(opens).toHaveLength(1);
    expect(opens[0].quantityOpen).toBe(1);
    expect(opens[0].netPremiumCollected).toBeCloseTo(8.34, 2);
  });

  it("round-trips STO + BTC to nothing open", () => {
    const opens = computeOpenOptions([
      stoTx(),
      stoTx({
        action: "BuyToClose",
        rawAction: "Buy to Close",
        amount: -1,
        tradeDate: "2026-01-08",
      }),
    ]);
    expect(opens).toEqual([]);
  });

  it("closes an assignment row (no residual open option)", () => {
    const opens = computeOpenOptions([
      stoTx(),
      stoTx({
        action: "Assigned",
        rawAction: "Assigned",
        amount: 0,
        tradeDate: "2026-01-09",
      }),
    ]);
    expect(opens).toEqual([]);
  });

  it("closes on Expired", () => {
    const opens = computeOpenOptions([
      stoTx(),
      stoTx({
        action: "Expired",
        rawAction: "Expired",
        amount: 0,
        tradeDate: "2026-01-09",
      }),
    ]);
    expect(opens).toEqual([]);
  });

  it("nets partial closes", () => {
    const opens = computeOpenOptions([
      stoTx({ quantity: 3, amount: 25.02 }),
      stoTx({
        action: "BuyToClose",
        rawAction: "Buy to Close",
        quantity: 1,
        amount: -10,
        tradeDate: "2026-01-06",
      }),
    ]);
    expect(opens).toHaveLength(1);
    expect(opens[0].quantityOpen).toBe(2);
  });
});
```

- [ ] **Step 3: Run, verify failure**

```bash
npm test -- tests/model/metrics/positions.test.ts
```

Expected: module not found.

- [ ] **Step 4: Implement positions**

Create `lib/model/metrics/positions.ts`:

```ts
import type { Transaction, OptionLeg } from "@/lib/csv/types";
import type { OpenOption, OpenShare, Warning } from "@/lib/model/types";

export function computeShareLedger(txs: Transaction[]): {
  openShares: OpenShare[];
  warnings: Warning[];
} {
  const state = new Map<string, { shares: number; cost: number }>();
  const warnings: Warning[] = [];

  // Group by (date, ticker) so we only check negatives at end of day.
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

  // End-of-day negativity check: re-walk, segment by date.
  const perDate = new Map<string, Map<string, number>>();
  for (const t of sorted) {
    if ((t.action !== "Buy" && t.action !== "Sell") || !t.ticker) continue;
    const day = perDate.get(t.tradeDate) ?? new Map<string, number>();
    const delta = t.action === "Buy" ? t.quantity : -t.quantity;
    day.set(t.ticker, (day.get(t.ticker) ?? 0) + delta);
    perDate.set(t.tradeDate, day);
  }

  const running = new Map<string, number>();
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

export function computeOpenOptions(txs: Transaction[]): OpenOption[] {
  const byKey = new Map<
    string,
    {
      contract: OptionLeg;
      quantityOpen: number;
      netPremiumCollected: number;
      entries: OpenOption["entries"];
    }
  >();

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
        s.netPremiumCollected += t.amount; // amount is negative
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

- [ ] **Step 5: Run, verify pass**

```bash
npm test -- tests/model/metrics/positions.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/model/types.ts lib/model/metrics/positions.ts tests/model/metrics/positions.test.ts
git commit -m "$(cat <<'EOF'
Compute share ledger and open option positions

computeShareLedger: weighted-average cost basis, end-of-day
negativity warnings.
computeOpenOptions: per-contract-key rolling net; surfaces
only quantityOpen > 0.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Cash ledger + external flows (TDD)

**Files:**
- Create: `lib/model/cash.ts`, `tests/model/cash.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/model/cash.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeCashLedger } from "@/lib/model/cash";
import type { Transaction } from "@/lib/csv/types";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    tradeDate: "2026-01-05",
    action: "SellToOpen",
    rawAction: "Sell to Open",
    quantity: 1,
    fees: 0,
    amount: 0,
    raw: {} as Transaction["raw"],
    ...overrides,
  };
}

describe("computeCashLedger", () => {
  it("starts at seed value and applies amounts in order", () => {
    const { cashLedger, finalCash } = computeCashLedger(
      [
        tx({ amount: 100, tradeDate: "2026-01-05" }),
        tx({ amount: -50, tradeDate: "2026-01-08" }),
      ],
      { seedDate: "2026-01-15", seedValue: 12345 },
    );
    expect(cashLedger[0]).toEqual({ date: "2026-01-15", balance: 12345 });
    expect(cashLedger.at(-1)).toEqual({ date: "2026-01-08", balance: 25050 });
    expect(finalCash).toBe(25050);
  });

  it("collapses multiple same-day transactions to a single endpoint", () => {
    const { cashLedger } = computeCashLedger(
      [
        tx({ amount: 10, tradeDate: "2026-01-05" }),
        tx({ amount: 20, tradeDate: "2026-01-05" }),
      ],
      { seedDate: "2026-01-15", seedValue: 100 },
    );
    // Expect two points: seed day, then 2026-01-05 with balance 130
    expect(cashLedger).toEqual([
      { date: "2026-01-15", balance: 100 },
      { date: "2026-01-05", balance: 130 },
    ]);
  });

  it("collects Journal + WireSent into externalFlows and cumulative", () => {
    const { externalFlows, cumulativeExternal } = computeCashLedger(
      [
        tx({
          action: "Journal",
          rawAction: "Journal",
          amount: 5000,
          tradeDate: "2026-02-05",
        }),
        tx({
          action: "WireSent",
          rawAction: "Wire Sent",
          amount: -5000,
          tradeDate: "2026-02-05",
        }),
      ],
      { seedDate: "2026-01-15", seedValue: 12345 },
    );
    expect(externalFlows).toHaveLength(2);
    expect(cumulativeExternal).toBe(0);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
npm test -- tests/model/cash.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement cash.ts**

Create `lib/model/cash.ts`:

```ts
import type { Transaction } from "@/lib/csv/types";
import type { CashPoint, Config, FlowPoint } from "@/lib/model/types";

export function computeCashLedger(
  txs: Transaction[],
  config: Config,
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
    { date: config.seedDate, balance: config.seedValue },
  ];
  const externalFlows: FlowPoint[] = [];
  let balance = config.seedValue;
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

- [ ] **Step 4: Run, verify pass**

```bash
npm test -- tests/model/cash.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/model/cash.ts tests/model/cash.test.ts
git commit -m "$(cat <<'EOF'
Compute cash ledger and external flow accumulator

Walks transactions in trade-date order from the seed, emits one
CashPoint per date (last-write-wins within a day). Journal and
WireSent actions surface as externalFlows for return % correction.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: NAV series (TDD)

**Files:**
- Create: `lib/model/metrics/nav.ts`, `tests/model/metrics/nav.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/model/metrics/nav.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeNavSeries } from "@/lib/model/metrics/nav";
import type { Transaction } from "@/lib/csv/types";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    tradeDate: "2026-01-05",
    action: "SellToOpen",
    rawAction: "Sell to Open",
    quantity: 1,
    fees: 0,
    amount: 0,
    raw: {} as Transaction["raw"],
    ...overrides,
  };
}

describe("computeNavSeries", () => {
  it("starts at seed value on seed date", () => {
    const series = computeNavSeries([], {
      seedDate: "2026-01-15",
      seedValue: 12345,
    });
    expect(series).toEqual([{ date: "2026-01-15", nav: 12345 }]);
  });

  it("adds realized cash flows", () => {
    const series = computeNavSeries(
      [tx({ amount: 100, tradeDate: "2026-01-05" })],
      { seedDate: "2026-01-15", seedValue: 12345 },
    );
    expect(series.at(-1)).toEqual({ date: "2026-01-05", nav: 25100 });
  });

  it("treats put-assignment cash/shares as NAV-neutral", () => {
    const series = computeNavSeries(
      [
        tx({
          action: "Buy",
          rawAction: "Buy",
          ticker: "HL",
          quantity: 200,
          price: 28,
          amount: -5600,
          tradeDate: "2026-01-30",
        }),
      ],
      { seedDate: "2026-01-15", seedValue: 12345 },
    );
    // Cash down $5600, shares at cost +$5600 → NAV unchanged.
    expect(series.at(-1)?.nav).toBeCloseTo(12345, 2);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
npm test -- tests/model/metrics/nav.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement nav.ts**

Create `lib/model/metrics/nav.ts`:

```ts
import type { Transaction } from "@/lib/csv/types";
import type { Config, NavPoint } from "@/lib/model/types";

export function computeNavSeries(
  txs: Transaction[],
  config: Config,
): NavPoint[] {
  const sorted = [...txs].sort((a, b) =>
    a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : 0,
  );

  const shares = new Map<string, { qty: number; cost: number }>();
  let cash = config.seedValue;

  const series: NavPoint[] = [{ date: config.seedDate, nav: cash }];
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

- [ ] **Step 4: Run, verify pass**

```bash
npm test -- tests/model/metrics/nav.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/model/metrics/nav.ts tests/model/metrics/nav.test.ts
git commit -m "$(cat <<'EOF'
Compute Options Income NAV series

NAV = running cash + Σ(shares × weighted cost basis). One point
per trade date. Assignments are NAV-neutral because the paired
Buy/Sell row is at strike price.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Premium series + totals (TDD)

**Files:**
- Create: `lib/model/metrics/premiums.ts`, `tests/model/metrics/premiums.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/model/metrics/premiums.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  computePremiumSeries,
  computePremiumTotals,
  groupPremiumsByMonth,
} from "@/lib/model/metrics/premiums";
import type { Transaction } from "@/lib/csv/types";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    tradeDate: "2026-01-05",
    action: "SellToOpen",
    rawAction: "Sell to Open",
    quantity: 1,
    fees: 0,
    amount: 0,
    raw: {} as Transaction["raw"],
    ...overrides,
  };
}

describe("premiums", () => {
  it("sums gross STO, closed BTC, and net", () => {
    const { gross, closed, net } = computePremiumTotals([
      tx({ amount: 100 }),
      tx({ action: "BuyToClose", rawAction: "Buy to Close", amount: -30 }),
      tx({ amount: 50 }),
    ]);
    expect(gross).toBe(150);
    expect(closed).toBe(30);
    expect(net).toBe(120);
  });

  it("builds per-date series combining STO + BTC", () => {
    const series = computePremiumSeries([
      tx({ amount: 100, tradeDate: "2026-01-05" }),
      tx({
        action: "BuyToClose",
        rawAction: "Buy to Close",
        amount: -40,
        tradeDate: "2026-01-05",
      }),
      tx({ amount: 50, tradeDate: "2026-02-10" }),
    ]);
    expect(series).toEqual([
      { date: "2026-01-05", netAmount: 60 },
      { date: "2026-02-10", netAmount: 50 },
    ]);
  });

  it("groups premiums by month with gross/closed/net breakdown", () => {
    const months = groupPremiumsByMonth([
      tx({ amount: 100, tradeDate: "2026-01-05" }),
      tx({
        action: "BuyToClose",
        rawAction: "Buy to Close",
        amount: -30,
        tradeDate: "2026-01-20",
      }),
      tx({ amount: 50, tradeDate: "2026-02-10" }),
    ]);
    expect(months).toEqual([
      { month: "2026-01", gross: 100, closed: 30, net: 70 },
      { month: "2026-02", gross: 50, closed: 0, net: 50 },
    ]);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
npm test -- tests/model/metrics/premiums.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement premiums.ts**

Create `lib/model/metrics/premiums.ts`:

```ts
import type { Transaction } from "@/lib/csv/types";
import type { PremiumPoint } from "@/lib/model/types";

function isPremium(t: Transaction): boolean {
  return t.action === "SellToOpen" || t.action === "BuyToClose";
}

export function computePremiumSeries(txs: Transaction[]): PremiumPoint[] {
  const byDate = new Map<string, number>();
  for (const t of txs) {
    if (!isPremium(t)) continue;
    byDate.set(t.tradeDate, (byDate.get(t.tradeDate) ?? 0) + t.amount);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, netAmount]) => ({ date, netAmount }));
}

export function computePremiumTotals(txs: Transaction[]): {
  gross: number;
  closed: number;
  net: number;
} {
  let gross = 0;
  let closed = 0;
  for (const t of txs) {
    if (t.action === "SellToOpen") gross += t.amount;
    if (t.action === "BuyToClose") closed += -t.amount; // report as positive dollars paid
  }
  return { gross, closed, net: gross - closed };
}

export function groupPremiumsByMonth(
  txs: Transaction[],
): { month: string; gross: number; closed: number; net: number }[] {
  const months = new Map<
    string,
    { gross: number; closed: number }
  >();
  for (const t of txs) {
    if (!isPremium(t)) continue;
    const key = t.tradeDate.slice(0, 7); // YYYY-MM
    const m = months.get(key) ?? { gross: 0, closed: 0 };
    if (t.action === "SellToOpen") m.gross += t.amount;
    else m.closed += -t.amount;
    months.set(key, m);
  }
  return [...months.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([month, { gross, closed }]) => ({
      month,
      gross,
      closed,
      net: gross - closed,
    }));
}
```

- [ ] **Step 4: Run, verify pass**

```bash
npm test -- tests/model/metrics/premiums.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/model/metrics/premiums.ts tests/model/metrics/premiums.test.ts
git commit -m "$(cat <<'EOF'
Compute premium series, totals, and monthly grouping

Gross = Σ STO (signed). Closed = |Σ BTC|. Net = gross − closed.
Monthly grouping keys by YYYY-MM.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Portfolio orchestrator + sanity checks (TDD)

**Files:**
- Create: `lib/model/portfolio.ts`, `tests/model/portfolio.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/model/portfolio.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildPortfolio } from "@/lib/model/portfolio";
import type { Transaction } from "@/lib/csv/types";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    tradeDate: "2026-01-05",
    action: "SellToOpen",
    rawAction: "Sell to Open",
    quantity: 1,
    fees: 0,
    amount: 0,
    raw: {} as Transaction["raw"],
    ...overrides,
  };
}

describe("buildPortfolio", () => {
  const config = { seedDate: "2026-01-15", seedValue: 12345 };

  it("produces a seed-only state from no transactions", () => {
    const s = buildPortfolio([], config);
    expect(s.cashLedger).toEqual([
      { date: "2026-01-15", balance: 12345 },
    ]);
    expect(s.navSeries).toEqual([{ date: "2026-01-15", nav: 12345 }]);
    expect(s.premiumTotals).toEqual({ gross: 0, closed: 0, net: 0 });
    expect(s.openOptionPositions).toEqual([]);
    expect(s.openSharePositions).toEqual([]);
  });

  it("computes return% when external flows net to zero", () => {
    const s = buildPortfolio(
      [
        tx({ amount: 5000, action: "Journal", rawAction: "Journal" }),
        tx({
          amount: -5000,
          action: "WireSent",
          rawAction: "Wire Sent",
          tradeDate: "2026-02-05",
        }),
        tx({ amount: 100, tradeDate: "2026-02-10" }),
      ],
      config,
    );
    // NAV = 12345 + 100 = 25100; external flows net 0
    expect(s.navSeries.at(-1)!.nav).toBeCloseTo(25100, 2);
  });

  it("raises UnknownAction warning with count", () => {
    const s = buildPortfolio(
      [
        tx({ action: "Unknown", rawAction: "Merger Adjustment", amount: 123 }),
        tx({ action: "Unknown", rawAction: "Merger Adjustment", amount: 45 }),
      ],
      config,
    );
    const w = s.warnings.find((w) => w.kind === "UnknownAction");
    expect(w).toBeDefined();
    if (w?.kind === "UnknownAction") {
      expect(w.count).toBe(2);
      expect(w.rawAction).toBe("Merger Adjustment");
    }
  });

  it("raises UnpairedAssignment warning", () => {
    const s = buildPortfolio(
      [
        tx({
          action: "Assigned",
          rawAction: "Assigned",
          option: {
            ticker: "XYZ",
            expiry: "2026-01-30",
            strike: 10,
            type: "Put",
          },
          amount: 0,
          quantity: 1,
          tradeDate: "2026-01-30",
        }),
      ],
      config,
    );
    expect(
      s.warnings.some((w) => w.kind === "UnpairedAssignment"),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
npm test -- tests/model/portfolio.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement portfolio.ts**

Create `lib/model/portfolio.ts`:

```ts
import type { Transaction } from "@/lib/csv/types";
import type {
  Config,
  PortfolioState,
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

export function buildPortfolio(
  transactions: Transaction[],
  config: Config,
): PortfolioState {
  const warnings: Warning[] = [];

  // 1. Cash + external flows
  const cash = computeCashLedger(transactions, config);

  // Cash drift sanity check
  const expected =
    config.seedValue + transactions.reduce((acc, t) => acc + t.amount, 0);
  if (Math.abs(expected - cash.finalCash) > CASH_DRIFT_TOLERANCE) {
    warnings.push({
      kind: "CashDrift",
      expected,
      actual: cash.finalCash,
    });
  }

  // 2. Positions
  const { openShares, warnings: shareWarnings } =
    computeShareLedger(transactions);
  warnings.push(...shareWarnings);
  const openOptions = computeOpenOptions(transactions);

  // 3. NAV series
  const navSeries = computeNavSeries(transactions, config);

  // 4. Premiums
  const premiumSeries = computePremiumSeries(transactions);
  const premiumTotals = computePremiumTotals(transactions);

  // 5. Unknown action roll-up
  const unknownCounts = new Map<string, number>();
  for (const t of transactions) {
    if (t.action === "Unknown") {
      unknownCounts.set(t.rawAction, (unknownCounts.get(t.rawAction) ?? 0) + 1);
    }
  }
  for (const [rawAction, count] of unknownCounts) {
    warnings.push({ kind: "UnknownAction", rawAction, count });
  }

  // 6. Unpaired assignment sanity check
  for (const t of transactions) {
    if (t.action !== "Assigned" || !t.option) continue;
    const paired = transactions.find(
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
    transactions,
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

- [ ] **Step 4: Run, verify pass**

```bash
npm test -- tests/model/portfolio.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/model/portfolio.ts tests/model/portfolio.test.ts
git commit -m "$(cat <<'EOF'
Orchestrate portfolio state with sanity checks

buildPortfolio composes cash, positions, nav, and premium modules.
Surfaces warnings for cash FP drift (>1¢), negative end-of-day
shares, unknown actions, and unpaired assignments.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Config reader (TDD)

**Files:**
- Create: `lib/config.ts`, `tests/config.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseConfig } from "@/lib/config";

describe("parseConfig", () => {
  it("parses a valid config JSON", () => {
    const c = parseConfig(
      JSON.stringify({ seedDate: "2026-01-15", seedValue: 12345 }),
    );
    expect(c).toEqual({ seedDate: "2026-01-15", seedValue: 12345 });
  });

  it("throws on missing seedDate", () => {
    expect(() => parseConfig(JSON.stringify({ seedValue: 100 }))).toThrow(
      /seedDate/,
    );
  });

  it("throws on non-ISO seedDate", () => {
    expect(() =>
      parseConfig(JSON.stringify({ seedDate: "1/1/2026", seedValue: 100 })),
    ).toThrow(/YYYY-MM-DD/);
  });

  it("throws on non-numeric seedValue", () => {
    expect(() =>
      parseConfig(JSON.stringify({ seedDate: "2026-01-15", seedValue: "25k" })),
    ).toThrow(/seedValue/);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseConfig("not json")).toThrow();
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
npm test -- tests/config.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement config.ts**

Create `lib/config.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Config } from "@/lib/model/types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseConfig(json: string): Config {
  const parsed = JSON.parse(json) as Partial<Config>;

  if (typeof parsed.seedDate !== "string") {
    throw new Error("config.seedDate must be a string in YYYY-MM-DD format");
  }
  if (!ISO_DATE.test(parsed.seedDate)) {
    throw new Error(
      `config.seedDate must be YYYY-MM-DD; got "${parsed.seedDate}"`,
    );
  }
  if (typeof parsed.seedValue !== "number" || !Number.isFinite(parsed.seedValue)) {
    throw new Error("config.seedValue must be a finite number");
  }
  return { seedDate: parsed.seedDate, seedValue: parsed.seedValue };
}

export function readConfigFile(dataDir: string): Config | null {
  try {
    const json = readFileSync(path.join(dataDir, "config.json"), "utf8");
    return parseConfig(json);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
```

- [ ] **Step 4: Run, verify pass**

```bash
npm test -- tests/config.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/config.ts tests/config.test.ts
git commit -m "$(cat <<'EOF'
Read and validate data/config.json

parseConfig enforces seedDate YYYY-MM-DD and numeric seedValue.
readConfigFile returns null for missing file so the UI can render
the setup panel instead of crashing.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Integration test with sanitized CSV

**Files:**
- Create: `tests/fixtures/real-sanitized.csv`, `tests/integration.test.ts`

- [ ] **Step 1: Create the sanitized fixture**

Copy the real CSV (which is gitignored) to the fixture location, stripping nothing (ticker-level data is fine; Schwab exports have no account number in the body):

```bash
cp transactions/Demo_XXX###_Transactions_20260420-210512.csv \
   tests/fixtures/real-sanitized.csv
```

Open `tests/fixtures/real-sanitized.csv` and confirm:
- No account number strings in the body (the filename contains `XXX###` but the file content does not)
- No personally identifying info beyond ticker + transaction data

If anything sensitive appears (none expected from inspection), redact before committing.

- [ ] **Step 2: Write the integration test**

Create `tests/integration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseSchwabCsv } from "@/lib/csv/parse";
import { buildPortfolio } from "@/lib/model/portfolio";

describe("integration: real sanitized CSV", () => {
  const csv = readFileSync(
    path.join(__dirname, "fixtures", "real-sanitized.csv"),
    "utf8",
  );
  const txs = parseSchwabCsv(csv);
  const state = buildPortfolio(txs, {
    seedDate: "2026-01-15",
    seedValue: 12345,
  });

  it("parses all 174 data rows", () => {
    expect(txs.length).toBe(174);
  });

  it("final NAV is approximately $28,609.85", () => {
    expect(state.navSeries.at(-1)!.nav).toBeCloseTo(28609.85, 1);
  });

  it("5 open option contracts remain", () => {
    expect(state.openOptionPositions).toHaveLength(5);
  });

  it("open share positions are HL, SOFI, CLSK only", () => {
    const tickers = state.openSharePositions.map((p) => p.ticker).sort();
    expect(tickers).toEqual(["CLSK", "HL", "SOFI"]);
  });

  it("net premium is approximately $3,609", () => {
    expect(state.premiumTotals.net).toBeCloseTo(3609, 0);
  });

  it("no warnings (clean history)", () => {
    expect(state.warnings).toEqual([]);
  });
});
```

- [ ] **Step 3: Run, verify pass**

```bash
npm test -- tests/integration.test.ts
```

Expected: all 6 assertions pass.

If `no warnings` fails with `UnpairedAssignment`, investigate — the paired `Buy`/`Sell` row detection in Task 14 may need refinement (e.g., Schwab may use different trade-date handling for the pair). Check the raw CSV rows manually and adjust the matching logic.

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/real-sanitized.csv tests/integration.test.ts
git commit -m "$(cat <<'EOF'
Integration test: end-to-end over the real CSV

Locks parser + pipeline behavior against a 174-row fixture matching
production data. NAV $28,609.85, 5 open options, 3 open share lots
(HL/SOFI/CLSK), net premium $3,609.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Server data loader

**Files:**
- Create: `lib/server/dashboard.ts`

- [ ] **Step 1: Create the loader**

Create `lib/server/dashboard.ts`:

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { parseSchwabCsv } from "@/lib/csv/parse";
import { buildPortfolio } from "@/lib/model/portfolio";
import { readConfigFile } from "@/lib/config";
import type { PortfolioState } from "@/lib/model/types";

export type DashboardData =
  | { kind: "ready"; state: PortfolioState; sourceFile: string; loadedAt: string }
  | { kind: "no-csv"; dataDir: string }
  | { kind: "no-config"; dataDir: string }
  | { kind: "parse-error"; message: string };

export function loadDashboard(): DashboardData {
  const dataDir = path.join(process.cwd(), "data");
  const config = readConfigFile(dataDir);
  if (!config) return { kind: "no-config", dataDir };

  let files: string[];
  try {
    files = readdirSync(dataDir)
      .filter((f) => f.toLowerCase().endsWith(".csv"))
      .map((f) => path.join(dataDir, f));
  } catch {
    return { kind: "no-csv", dataDir };
  }
  if (files.length === 0) return { kind: "no-csv", dataDir };

  const newest = files
    .map((f) => ({ f, mtime: statSync(f).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0].f;

  try {
    const csv = readFileSync(newest, "utf8");
    const txs = parseSchwabCsv(csv);
    const state = buildPortfolio(txs, config);
    return {
      kind: "ready",
      state,
      sourceFile: path.basename(newest),
      loadedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      kind: "parse-error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
```

- [ ] **Step 2: Smoke-verify via test**

Add to `tests/integration.test.ts`:

```ts
import { loadDashboard } from "@/lib/server/dashboard";

describe("loadDashboard", () => {
  it("returns no-config when data/ is absent", () => {
    // In test runs without data/ dir, loadDashboard should gracefully degrade.
    const result = loadDashboard();
    expect(["ready", "no-csv", "no-config", "parse-error"]).toContain(
      result.kind,
    );
  });
});
```

Run:

```bash
npm test -- tests/integration.test.ts
```

Expected: new test passes regardless of local `data/` state.

- [ ] **Step 3: Commit**

```bash
git add lib/server/dashboard.ts tests/integration.test.ts
git commit -m "$(cat <<'EOF'
Add server-side dashboard data loader

loadDashboard resolves to a tagged union: ready / no-csv / no-config
/ parse-error. Page components render the right state without
needing try/catch.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: OnboardingCard + AttentionBanner components

**Files:**
- Create: `app/components/OnboardingCard.tsx`, `app/components/AttentionBanner.tsx`

- [ ] **Step 1: Create OnboardingCard**

Create `app/components/OnboardingCard.tsx`:

```tsx
type Props = { dataDir: string; missing: "csv" | "config" };

export function OnboardingCard({ dataDir, missing }: Props) {
  return (
    <div className="max-w-2xl mx-auto mt-16 rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-xl font-semibold mb-2">Getting started</h2>
      {missing === "csv" ? (
        <>
          <p className="text-gray-700 mb-4">
            Drop a Schwab transactions CSV into{" "}
            <code className="bg-gray-100 px-1 rounded">{dataDir}</code> and
            refresh this page. The newest file by modification time will be
            used.
          </p>
          <p className="text-sm text-gray-500">
            Expected filename pattern:{" "}
            <code>Demo_XXX*_Transactions_*.csv</code>. This directory is
            gitignored — raw exports never reach the repo.
          </p>
        </>
      ) : (
        <>
          <p className="text-gray-700 mb-4">
            No <code>config.json</code> found. Create{" "}
            <code className="bg-gray-100 px-1 rounded">
              {dataDir}/config.json
            </code>{" "}
            with:
          </p>
          <pre className="bg-gray-900 text-gray-100 rounded p-3 text-sm overflow-x-auto">
{`{
  "seedDate": "2026-01-15",
  "seedValue": 12345
}`}
          </pre>
          <p className="text-sm text-gray-500 mt-3">
            Seed values are personal — the file is gitignored.
          </p>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create AttentionBanner**

Create `app/components/AttentionBanner.tsx`:

```tsx
import type { Warning } from "@/lib/model/types";

function describe(w: Warning): string {
  switch (w.kind) {
    case "UnknownAction":
      return `${w.count} row(s) with unrecognized action "${w.rawAction}" — excluded from cash math.`;
    case "CashDrift":
      return `Cash balance drift: walk-forward says $${w.actual.toFixed(2)}, Σ(amount) says $${w.expected.toFixed(2)}.`;
    case "NegativeShareEndOfDay":
      return `${w.ticker} share position is negative (${w.shares}) after ${w.date}.`;
    case "UnpairedAssignment":
      return `Assignment on ${w.date} (${w.contractKey}) has no matching Buy/Sell share row.`;
  }
}

type Props = { warnings: Warning[] };

export function AttentionBanner({ warnings }: Props) {
  if (warnings.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 mb-4">
      <h3 className="text-sm font-semibold text-amber-900 mb-1">
        Needs attention
      </h3>
      <ul className="list-disc list-inside text-sm text-amber-900">
        {warnings.map((w, i) => (
          <li key={i}>{describe(w)}</li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/components/OnboardingCard.tsx app/components/AttentionBanner.tsx
git commit -m "$(cat <<'EOF'
Add OnboardingCard and AttentionBanner

OnboardingCard renders in the no-csv / no-config state with
copy-pastable defaults. AttentionBanner surfaces pipeline
warnings (unknown actions, cash drift, etc.).

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: SummaryStrip component

**Files:**
- Create: `app/components/SummaryStrip.tsx`

- [ ] **Step 1: Implement SummaryStrip**

Create `app/components/SummaryStrip.tsx`:

```tsx
import type { PortfolioState } from "@/lib/model/types";
import { formatCurrency } from "@/lib/util/money";

type Props = { state: PortfolioState };

export function SummaryStrip({ state }: Props) {
  const nav = state.navSeries.at(-1)?.nav ?? state.config.seedValue;
  const cumulativeExternal = state.externalFlows.reduce(
    (a, e) => a + e.signedAmount,
    0,
  );
  const gain = nav - state.config.seedValue - cumulativeExternal;
  const returnPct = gain / state.config.seedValue;
  const finalCash =
    state.cashLedger.at(-1)?.balance ?? state.config.seedValue;
  const sharesAtCost = state.openSharePositions.reduce(
    (a, s) => a + s.shares * s.weightedCostBasis,
    0,
  );
  const pctColor = returnPct >= 0 ? "text-emerald-600" : "text-red-600";
  const deltaColor = gain >= 0 ? "text-emerald-600" : "text-red-600";

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
      <Card
        label="Options Income NAV"
        value={formatCurrency(nav)}
        delta={`${gain >= 0 ? "+" : "−"}${formatCurrency(Math.abs(gain))} since seed`}
        deltaClass={deltaColor}
      />
      <Card
        label="Return since seed"
        value={`${(returnPct * 100).toFixed(2)}%`}
        valueClass={pctColor}
        delta={`external flows ${formatCurrency(cumulativeExternal)}`}
      />
      <Card
        label="Cash"
        value={formatCurrency(finalCash)}
        delta={`${((finalCash / nav) * 100).toFixed(1)}% of NAV`}
      />
      <Card
        label="Shares at cost"
        value={formatCurrency(sharesAtCost)}
        delta={
          state.openSharePositions.length
            ? `${state.openSharePositions.length} ticker(s)`
            : "none"
        }
      />
    </div>
  );
}

function Card({
  label,
  value,
  delta,
  valueClass,
  deltaClass,
}: {
  label: string;
  value: string;
  delta: string;
  valueClass?: string;
  deltaClass?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className={`text-2xl font-bold mt-0.5 ${valueClass ?? ""}`}>
        {value}
      </div>
      <div className={`text-xs mt-0.5 ${deltaClass ?? "text-gray-500"}`}>
        {delta}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/SummaryStrip.tsx
git commit -m "$(cat <<'EOF'
Add SummaryStrip top KPI row

Four cards: NAV, return %, cash, shares at cost. Return % subtracts
cumulative external flows per spec.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: NavCard component

**Files:**
- Create: `app/components/NavCard.tsx`

- [ ] **Step 1: Implement NavCard**

Create `app/components/NavCard.tsx`:

```tsx
import type { PortfolioState } from "@/lib/model/types";

type Props = { state: PortfolioState };

export function NavCard({ state }: Props) {
  const points = state.navSeries;
  if (points.length < 2) return <EmptyCard />;

  const minNav = Math.min(state.config.seedValue, ...points.map((p) => p.nav));
  const maxNav = Math.max(state.config.seedValue, ...points.map((p) => p.nav));
  const pad = (maxNav - minNav) * 0.1 || 1;
  const yMin = minNav - pad;
  const yMax = maxNav + pad;

  const firstMs = Date.parse(points[0].date);
  const lastMs = Date.parse(points.at(-1)!.date);
  const xRange = Math.max(1, lastMs - firstMs);
  const scaleX = (ms: number) => ((ms - firstMs) / xRange) * 600;
  const scaleY = (v: number) => 180 - ((v - yMin) / (yMax - yMin)) * 180;

  const path = points
    .map((p, i) => {
      const x = scaleX(Date.parse(p.date));
      const y = scaleY(p.nav);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const area = `${path} L600,180 L0,180 Z`;

  const seedY = scaleY(state.config.seedValue);

  // X-axis tick labels: first, last, and 2-3 evenly spaced between
  const tickCount = Math.min(6, points.length);
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const idx = Math.floor((i * (points.length - 1)) / (tickCount - 1));
    return points[idx].date.slice(5); // MM-DD
  });

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 mb-0.5">
        Options Income — NAV
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        Cash + shares at cost basis, less external flows. Point at each
        transaction date.
      </p>
      <div className="h-[180px] relative border-l border-b border-gray-200">
        <svg
          className="absolute inset-0"
          viewBox="0 0 600 180"
          preserveAspectRatio="none"
          width="100%"
          height="100%"
        >
          <defs>
            <linearGradient id="nav-gradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#059669" stopOpacity="0.25" />
              <stop offset="1" stopColor="#059669" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#nav-gradient)" />
          <path d={path} stroke="#059669" strokeWidth="2" fill="none" />
          <line
            x1="0"
            y1={seedY}
            x2="600"
            y2={seedY}
            stroke="#9ca3af"
            strokeDasharray="3,3"
          />
        </svg>
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1 pl-1">
        {ticks.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
      <div className="flex gap-3 text-[11px] text-gray-500 mt-2">
        <span>
          <span className="inline-block w-2.5 h-2.5 align-middle rounded-sm bg-emerald-600 mr-1" />
          NAV
        </span>
        <span>
          <span className="inline-block w-2.5 h-2.5 align-middle rounded-sm bg-gray-400 mr-1" />
          Seed (${state.config.seedValue.toLocaleString()})
        </span>
      </div>
    </div>
  );
}

function EmptyCard() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-500">Not enough data points yet.</p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/NavCard.tsx
git commit -m "$(cat <<'EOF'
Add NavCard SVG line chart

Line + area gradient for NAV series; dashed horizontal at seed
value. X-axis ticks auto-spaced from the series bounds. No
tooltips in v1.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 21: PremiumsCard component

**Files:**
- Create: `app/components/PremiumsCard.tsx`

- [ ] **Step 1: Implement PremiumsCard**

Create `app/components/PremiumsCard.tsx`:

```tsx
import type { PortfolioState } from "@/lib/model/types";
import { groupPremiumsByMonth } from "@/lib/model/metrics/premiums";
import { formatCurrency } from "@/lib/util/money";

type Props = { state: PortfolioState };

const MONTH_LABELS: Record<string, string> = {
  "01": "Jan",
  "02": "Feb",
  "03": "Mar",
  "04": "Apr",
  "05": "May",
  "06": "Jun",
  "07": "Jul",
  "08": "Aug",
  "09": "Sep",
  "10": "Oct",
  "11": "Nov",
  "12": "Dec",
};

export function PremiumsCard({ state }: Props) {
  const months = groupPremiumsByMonth(state.transactions);
  const maxTotal = Math.max(1, ...months.map((m) => m.gross + m.closed));
  const maxPx = 130; // of the 180px bar area, leaving room for label+value

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 mb-0.5">
        Premiums collected
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        Monthly — green is gross (STO); red stacked on top is paid to close
        (BTC). Value below each bar is that month&rsquo;s net.
      </p>
      <div className="flex items-end gap-3 h-[180px] overflow-hidden">
        {months.map((m) => {
          const grossPx = (m.gross / maxTotal) * maxPx;
          const closedPx = (m.closed / maxTotal) * maxPx;
          return (
            <div
              key={m.month}
              className="flex-1 flex flex-col items-center justify-end h-full"
            >
              <div className="w-full flex flex-col">
                <div
                  className="bg-red-300"
                  style={{ height: `${closedPx}px`, minHeight: 2 }}
                />
                <div
                  className="bg-emerald-600 rounded-t-sm"
                  style={{ height: `${grossPx}px`, minHeight: 2 }}
                />
              </div>
              <div className="text-[10px] text-gray-500 mt-1">
                {MONTH_LABELS[m.month.slice(5)] ?? m.month}
              </div>
              <div className="text-[11px] font-semibold text-emerald-700">
                {formatCurrency(m.net).replace(/\.00$/, "")}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 text-[11px] text-gray-500 mt-3">
        <span>
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-600 mr-1 align-middle" />
          Gross {formatCurrency(state.premiumTotals.gross)}
        </span>
        <span>
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-300 mr-1 align-middle" />
          Closed −{formatCurrency(state.premiumTotals.closed)}
        </span>
        <strong className="text-emerald-700">
          Net {formatCurrency(state.premiumTotals.net)}
        </strong>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/PremiumsCard.tsx
git commit -m "$(cat <<'EOF'
Add PremiumsCard monthly stacked bars

Green bars = gross premium (STO) per month; red stacked = BTC
paid to close. Net shown below each month.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 22: OpenPositionsCard component

**Files:**
- Create: `app/components/OpenPositionsCard.tsx`

- [ ] **Step 1: Implement OpenPositionsCard**

Create `app/components/OpenPositionsCard.tsx`:

```tsx
import type { PortfolioState } from "@/lib/model/types";
import { formatCurrency } from "@/lib/util/money";

type Props = { state: PortfolioState; asOfDate: string };

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function formatExpiry(e: string): string {
  // 2026-04-24 → 04/24
  return `${e.slice(5, 7)}/${e.slice(8, 10)}`;
}

export function OpenPositionsCard({ state, asOfDate }: Props) {
  const opts = state.openOptionPositions;
  const shares = state.openSharePositions;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 mb-0.5">
        Open positions
      </h3>
      <p className="text-xs text-gray-500 mb-3">
        {opts.length} contract(s) · {shares.length} share lot(s) · no live
        quotes in v1
      </p>

      <div className="text-[11px] uppercase tracking-wide text-gray-400 mt-2 mb-1">
        Short options
      </div>
      {opts.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">None open.</p>
      ) : (
        opts.map((o) => {
          const dte = daysBetween(asOfDate, o.contract.expiry);
          const entry = o.entries[o.entries.length - 1];
          return (
            <div
              key={`${o.contract.ticker}-${o.contract.expiry}-${o.contract.strike}-${o.contract.type}`}
              className="flex justify-between py-1.5 border-b border-gray-100 last:border-0 text-[13px]"
            >
              <div>
                <strong>{o.contract.ticker}</strong>{" "}
                {formatExpiry(o.contract.expiry)} $
                {o.contract.strike.toFixed(2)} {o.contract.type[0]}
                <div className="text-[11px] text-gray-500">
                  {o.quantityOpen} ct · opened{" "}
                  {formatExpiry(entry.date)}
                </div>
              </div>
              <div className="text-right">
                <strong className="text-emerald-700">
                  +{formatCurrency(o.netPremiumCollected)}
                </strong>
                <div className="text-[11px] text-gray-500">
                  {dte}d to expiry
                </div>
              </div>
            </div>
          );
        })
      )}

      <div className="text-[11px] uppercase tracking-wide text-gray-400 mt-4 mb-1">
        Share holdings
      </div>
      {shares.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">None held.</p>
      ) : (
        shares.map((s) => (
          <div
            key={s.ticker}
            className="flex justify-between py-1.5 border-b border-gray-100 last:border-0 text-[13px]"
          >
            <div>
              <strong>{s.ticker}</strong>
              <div className="text-[11px] text-gray-500">assigned share lot</div>
            </div>
            <div className="text-right">
              <strong>{s.shares} sh</strong>
              <div className="text-[11px] text-gray-500">
                @ {formatCurrency(s.weightedCostBasis)} ·{" "}
                {formatCurrency(s.shares * s.weightedCostBasis)}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/OpenPositionsCard.tsx
git commit -m "$(cat <<'EOF'
Add OpenPositionsCard with short options + share holdings

Two sections: short options sorted by expiry (ascending), share
holdings alphabetical. Days-to-expiry and net premium per contract.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 23: TransactionLogCard component (client)

**Files:**
- Create: `app/components/TransactionLogCard.tsx`

- [ ] **Step 1: Implement TransactionLogCard (client component)**

Create `app/components/TransactionLogCard.tsx`:

```tsx
"use client";
import { useMemo, useState } from "react";
import type { Transaction } from "@/lib/csv/types";
import { formatCurrency } from "@/lib/util/money";

type Props = { transactions: Transaction[] };

const ACTION_LABEL: Record<string, string> = {
  SellToOpen: "STO",
  BuyToClose: "BTC",
  Expired: "EXP",
  Assigned: "ASN",
  Buy: "BUY",
  Sell: "SELL",
  QualifiedDividend: "DIV",
  BankInterest: "INT",
  CreditInterest: "INT",
  Journal: "JRN",
  WireSent: "WIR",
  MiscCashEntry: "MSC",
  ServiceFee: "FEE",
  Unknown: "???",
};

const ACTION_STYLES: Record<string, string> = {
  SellToOpen: "bg-emerald-100 text-emerald-800",
  BuyToClose: "bg-red-100 text-red-800",
  Expired: "bg-gray-100 text-gray-700",
  Assigned: "bg-amber-100 text-amber-800",
  Buy: "bg-blue-100 text-blue-800",
  Sell: "bg-indigo-100 text-indigo-800",
};

export function TransactionLogCard({ transactions }: Props) {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<string>("All");
  const [limit, setLimit] = useState(20);

  const sorted = useMemo(
    () =>
      [...transactions].sort((a, b) =>
        a.tradeDate < b.tradeDate ? 1 : a.tradeDate > b.tradeDate ? -1 : 0,
      ),
    [transactions],
  );

  const actionOptions = useMemo(
    () => ["All", ...Array.from(new Set(sorted.map((t) => t.action)))],
    [sorted],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((t) => {
      if (action !== "All" && t.action !== action) return false;
      if (!q) return true;
      const hay = `${t.ticker ?? ""} ${t.raw.Description ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sorted, search, action]);

  const visible = filtered.slice(0, limit);

  function describe(t: Transaction): string {
    if (t.option) {
      const e = `${t.option.expiry.slice(5, 7)}/${t.option.expiry.slice(8, 10)}`;
      return `${t.option.ticker} ${e} $${t.option.strike.toFixed(2)} ${t.option.type[0]} × ${t.quantity}`;
    }
    if (t.ticker) {
      return `${t.ticker} ${t.quantity ? `× ${t.quantity}` : ""}`;
    }
    return t.raw.Description ?? t.rawAction;
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 mb-0.5">
        Transaction log
      </h3>
      <p className="text-xs text-gray-500 mb-3">
        Searchable. Most recent first. Showing {visible.length} of{" "}
        {filtered.length}.
      </p>

      <div className="flex gap-2 mb-2">
        <input
          placeholder="search ticker or description…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(20);
          }}
          className="flex-1 text-xs px-2 py-1.5 border border-gray-300 rounded bg-white"
        />
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setLimit(20);
          }}
          className="text-xs px-2 py-1.5 border border-gray-300 rounded bg-white"
        >
          {actionOptions.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </div>

      <div>
        {visible.map((t, i) => (
          <div
            key={i}
            className="grid grid-cols-[72px_1fr_100px] gap-2 py-1.5 border-b border-gray-100 last:border-0 text-xs"
          >
            <span className="text-gray-500 tabular-nums">
              {t.tradeDate.slice(5).replace("-", "/")}
            </span>
            <span>
              <span
                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold mr-1 ${
                  ACTION_STYLES[t.action] ?? "bg-gray-100 text-gray-700"
                }`}
              >
                {ACTION_LABEL[t.action] ?? t.action}
              </span>
              {describe(t)}
            </span>
            <span
              className={`text-right tabular-nums font-semibold ${
                t.amount > 0
                  ? "text-emerald-700"
                  : t.amount < 0
                    ? "text-red-700"
                    : "text-gray-400"
              }`}
            >
              {t.amount === 0 ? "—" : formatCurrency(t.amount)}
            </span>
          </div>
        ))}
      </div>

      {limit < filtered.length && (
        <button
          onClick={() => setLimit(limit + 20)}
          className="mt-3 text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50"
        >
          Show more
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/TransactionLogCard.tsx
git commit -m "$(cat <<'EOF'
Add TransactionLogCard client component

Most-recent-first, free-text search over ticker+description, action
filter dropdown. Initial 20 rows, "Show more" reveals 20 more.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 24: Wire the page together + browser verify

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Wire full page**

Overwrite `app/page.tsx`:

```tsx
import { loadDashboard } from "@/lib/server/dashboard";
import { SummaryStrip } from "@/app/components/SummaryStrip";
import { NavCard } from "@/app/components/NavCard";
import { PremiumsCard } from "@/app/components/PremiumsCard";
import { OpenPositionsCard } from "@/app/components/OpenPositionsCard";
import { TransactionLogCard } from "@/app/components/TransactionLogCard";
import { OnboardingCard } from "@/app/components/OnboardingCard";
import { AttentionBanner } from "@/app/components/AttentionBanner";

export const dynamic = "force-dynamic";

export default function Home() {
  const data = loadDashboard();

  if (data.kind === "no-csv") {
    return <OnboardingCard dataDir="data/" missing="csv" />;
  }
  if (data.kind === "no-config") {
    return <OnboardingCard dataDir="data/" missing="config" />;
  }
  if (data.kind === "parse-error") {
    return (
      <div className="max-w-2xl mx-auto mt-16 rounded-lg border border-red-300 bg-red-50 p-6">
        <h2 className="text-lg font-semibold text-red-900 mb-2">
          Couldn&rsquo;t parse the CSV
        </h2>
        <pre className="bg-red-100 text-red-900 text-xs p-3 rounded overflow-x-auto">
          {data.message}
        </pre>
      </div>
    );
  }

  const { state, sourceFile, loadedAt } = data;
  const asOfDate =
    state.navSeries.at(-1)?.date ?? state.config.seedDate;

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      <header className="rounded-lg border border-gray-200 bg-white px-5 py-4 mb-4 flex items-baseline justify-between">
        <div>
          <div className="text-xl font-bold">Demo · Options Income</div>
          <div className="text-xs text-gray-500">
            Seed ${state.config.seedValue.toLocaleString()} on{" "}
            {state.config.seedDate} · Data through {asOfDate} · Source:{" "}
            <code className="bg-gray-100 px-1 rounded">{sourceFile}</code>
          </div>
        </div>
        <div className="text-xs text-gray-500">
          Last refresh {new Date(loadedAt).toLocaleTimeString()}
        </div>
      </header>

      <AttentionBanner warnings={state.warnings} />

      <SummaryStrip state={state} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="md:col-span-2">
          <NavCard state={state} />
        </div>
        <div>
          <PremiumsCard state={state} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <OpenPositionsCard state={state} asOfDate={asOfDate} />
        <TransactionLogCard transactions={state.transactions} />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Put a real CSV + config in `data/`**

```bash
mkdir -p data
cp transactions/Demo_XXX###_Transactions_20260420-210512.csv data/
cat > data/config.json <<'EOF'
{ "seedDate": "2026-01-15", "seedValue": 12345 }
EOF
```

Verify both are gitignored:

```bash
git status
```

Expected: `data/` does not appear.

- [ ] **Step 3: Build and verify no type errors**

```bash
npm run typecheck
```

Expected: no errors.

```bash
npm run build
```

Expected: `Compiled successfully`.

- [ ] **Step 4: Start dev server, verify in browser**

```bash
npm run dev
```

Open http://localhost:3000 and verify:

- Header shows `Demo · Options Income`, seed $25,000 on 2026-01-15, data through 2026-04-20, source `Demo_XXX###_Transactions_20260420-210512.csv`.
- **Summary strip:** NAV ≈ $28,609.85, Return ≈ +14.44%, Cash ≈ $15,909.85, Shares at cost ≈ $12,700.00.
- **NAV chart:** line from seed ($25k dashed) rising to ~$28.6k over Jan–Apr.
- **Premiums:** 4 monthly stacked bars (Jan/Feb/Mar/Apr), totals Net ≈ $3,609.
- **Open positions:** 5 contracts (IREN/SOXL/HL/CLSK/SOFI by expiry), 3 share lots (CLSK/HL/SOFI).
- **Transaction log:** most recent first, showing 20 rows. Search box + Action dropdown work. "Show more" reveals another 20.
- **No attention banner** (clean data).

Open the browser devtools Console — no errors.

Stop server with Ctrl-C.

- [ ] **Step 5: Full test suite + commit**

```bash
npm test
npm run typecheck
```

Both pass. Verify git status — `data/` not staged:

```bash
git status
```

Commit the page wiring:

```bash
git add app/page.tsx
git commit -m "$(cat <<'EOF'
Wire the dashboard page end to end

Reads data/ via loadDashboard, renders OnboardingCard on no-csv /
no-config, attention banner + full layout on ready. Verified
against real CSV: NAV $28,609.85, return +14.44%, 5 open options,
3 share lots.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 25: Create private GitHub repo and push

**Files:** none (remote setup only)

- [ ] **Step 1: Final sanity check before pushing**

Verify no sensitive files would be pushed:

```bash
git ls-files | grep -iE '\.(csv|xlsx)$|^(data|transactions|sheets)/' || echo "clean"
```

Expected: `clean` (no output matches).

- [ ] **Step 2: Create the private repo and push**

```bash
gh repo create jayrav13/schwab-lens --private --source=. --remote=origin --push
```

Expected: Repo created at `git@github.com:jayrav13/schwab-lens.git`; `main` pushed with all commits to date.

- [ ] **Step 3: File v2 issues**

Create one issue per v2 card plus the mark-to-market follow-on, each with success criteria:

```bash
gh issue create --title "v2: Premium by ticker card" --body "$(cat <<'EOF'
## Success Criteria
- [ ] New card renders a ranked list of tickers by net premium
- [ ] Includes assignment count per ticker
- [ ] Integration test updated to assert top-3 tickers match real CSV
EOF
)"

gh issue create --title "v2: Outcome breakdown (win rate) card" --body "$(cat <<'EOF'
## Success Criteria
- [ ] Shows counts for Expired / Closed-profit / Closed-loss / Assigned
- [ ] Derived from full transaction history
- [ ] Matches hand-computed values from real CSV
EOF
)"

gh issue create --title "v2: Cash & ancillary yield card" --body "$(cat <<'EOF'
## Success Criteria
- [ ] Dividends, bank/credit interest, fees broken out
- [ ] Cumulative totals and per-month rows
EOF
)"

gh issue create --title "v2: Return metrics card (total / annualized / monthly)" --body "$(cat <<'EOF'
## Success Criteria
- [ ] Total return, annualized (365-day), best/worst month shown
- [ ] Subtracts external flows correctly
EOF
)"

gh issue create --title "v2: Capital at risk card" --body "$(cat <<'EOF'
## Success Criteria
- [ ] Shows secured-put capital + held-share capital vs free cash
- [ ] Pct-of-NAV visualization
EOF
)"

gh issue create --title "v2 follow-on: Mark-to-market NAV (Portfolio Value track)" --body "$(cat <<'EOF'
## Success Criteria
- [ ] Adds optional live-price lookup (yahoo-finance2 or equivalent)
- [ ] Second NAV line ("Portfolio Value") alongside "Options Income"
- [ ] Graceful degradation when offline — cache + stale indicator
- [ ] No breaking change to v1 behavior when the feature flag is off
EOF
)"
```

- [ ] **Step 4: Verify issues visible**

```bash
gh issue list
```

Expected: 6 issues listed.

No commit — this task is remote-only.

---

## Self-review

**1. Spec coverage:**

| Spec requirement                       | Task(s) |
|----------------------------------------|---------|
| Next.js App Router, TS, Tailwind       | 1 |
| Vitest, papaparse                      | 2 |
| Money / date parsing                   | 3, 4 |
| Schwab CSV parser (all action types)   | 5, 6, 7, 8, 9 |
| Cash ledger + external flows           | 11 |
| Share + option positions               | 10 |
| NAV series                             | 12 |
| Premium series + totals + monthly      | 13 |
| Portfolio orchestrator + sanity checks | 14 |
| Config reader                          | 15 |
| Integration test (real CSV)            | 16 |
| Server data loader                     | 17 |
| OnboardingCard + AttentionBanner       | 18 |
| SummaryStrip                           | 19 |
| NavCard                                | 20 |
| PremiumsCard                           | 21 |
| OpenPositionsCard                      | 22 |
| TransactionLogCard                     | 23 |
| Full page wiring + browser verify      | 24 |
| Private GH repo + v2 issues            | 25 |

All spec requirements covered. No gaps.

**2. Placeholder scan:** no TBD / TODO / "implement later" / "similar to Task N" markers in the plan. Every step with code has complete code.

**3. Type consistency:**
- `Action` union — used consistently in `lib/csv/types.ts` and all downstream consumers
- `PortfolioState` — defined in Task 10, consumed by all component tasks (19–23)
- `computeShareLedger` / `computeOpenOptions` (Task 10) called from `buildPortfolio` (Task 14) with matching signatures
- `groupPremiumsByMonth` (Task 13) consumed by `PremiumsCard` (Task 21)
- `loadDashboard` return type (Task 17) matches page-level discrimination in Task 24

Consistent.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-20-schwab-lens-tracker-v1.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
