import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let tempRoot: string;

const TX_CSV = readFileSync(
  path.join(__dirname, "fixtures", "fake-portfolio.csv"),
  "utf8",
);

const SHORT_TX_CSV = `"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"
"01/02/2026","Journal","","MoneyLink Deposit","","","","$10,000.00"
"01/03/2026","Sell to Open","FAKE 01/09/2026 10.00 P","PUT FAKE EXP 01/09/26","1","$1.00","$0.66","$99.34"
"01/04/2026","Buy","MADEUP","MADEUP INC","10","$50.00","$0.00","-$500.00"
`;

const SHORT_POS_CSV = `"Positions for account Demo ...999 as of 09:00 AM ET, 2026/01/05"

"Symbol","Description","Qty (Quantity)","Price","Mkt Val (Market Value)","Cost Basis","Asset Type"
"MADEUP","MADEUP INC","10","$55.00","$550.00","$500.00","Equity"
"FAKE 01/09/2026 10.00 P","PUT FAKE EXP 01/09/26","-1","$0.50","-$50.00","--","Option"
"Cash & Cash Investments","","","","$9,599.34","","Cash"
"Account Total","","","","$10,099.34","","--"
`;

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

beforeEach(() => {
  tempRoot = mkdtempSync(path.join(tmpdir(), "schwab-lens-int-"));
  mkdirSync(path.join(tempRoot, "data"));
});

function writeFixture(externalId: string, txContent: string, posContent?: string): void {
  const dataDir = path.join(tempRoot, "data");
  const txDir = path.join(dataDir, "schwab", externalId, "transactions");
  mkdirSync(txDir, { recursive: true });
  writeFileSync(
    path.join(txDir, `Demo_XXX${externalId}_Transactions_20260206-000000.csv`),
    txContent,
  );
  if (posContent) {
    const posDir = path.join(dataDir, "schwab", externalId, "positions");
    mkdirSync(posDir, { recursive: true });
    writeFileSync(
      path.join(posDir, "Demo-Positions-2026-01-05-090000.csv"),
      posContent,
    );
  }
}

describe("dashboard integration (DB-backed)", () => {
  it("renders a ready dashboard after ingest + configure", async () => {
    writeFixture("999", SHORT_TX_CSV, SHORT_POS_CSV);
    const { openDb } = await import("@/lib/db/connect");
    const { runIngest } = await import("@/lib/ingest/run");
    const { configureAccount } = await import("@/lib/scripts/accountConfigure");
    const { loadDashboard } = await import("@/lib/server/dashboard");

    const dataDir = path.join(tempRoot, "data");
    const dbPath = path.join(dataDir, "portfolio.db");
    const db = openDb(dbPath);
    try {
      runIngest(db, dataDir);
      configureAccount(db, {
        account: "schwab:999",
        primary: true,
        seedDate: "2026-01-02",
        seedValue: 10000,
        marketDataEnabled: false,
      });
    } finally {
      db.close();
    }

    const result = await loadDashboard({
      includeMarketData: false,
      dataDir,
      migrationsDir: MIGRATIONS_DIR,
    });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.state.config.seedDate).toBe("2026-01-02");
    expect(result.state.config.seedValue).toBe(10000);
    expect(result.state.cashLedger.length).toBeGreaterThan(0);
  });

  it("returns no-config when primary account is unset", async () => {
    writeFixture("999", SHORT_TX_CSV);
    const { openDb } = await import("@/lib/db/connect");
    const { runIngest } = await import("@/lib/ingest/run");
    const { loadDashboard } = await import("@/lib/server/dashboard");

    const dataDir = path.join(tempRoot, "data");
    const dbPath = path.join(dataDir, "portfolio.db");
    const db = openDb(dbPath);
    try {
      runIngest(db, dataDir);
    } finally {
      db.close();
    }

    const result = await loadDashboard({
      includeMarketData: false,
      dataDir,
      migrationsDir: MIGRATIONS_DIR,
    });
    expect(result.kind).toBe("no-config");
  });

  it("preserves the wheel-strategy math end-to-end", async () => {
    writeFixture("001", TX_CSV);
    const { openDb } = await import("@/lib/db/connect");
    const { runIngest } = await import("@/lib/ingest/run");
    const { configureAccount } = await import("@/lib/scripts/accountConfigure");
    const { loadDashboard } = await import("@/lib/server/dashboard");

    const dataDir = path.join(tempRoot, "data");
    const dbPath = path.join(dataDir, "portfolio.db");
    const db = openDb(dbPath);
    try {
      runIngest(db, dataDir);
      configureAccount(db, {
        account: "schwab:001",
        primary: true,
        seedDate: "2026-01-15",
        seedValue: 10000,
        marketDataEnabled: false,
      });
    } finally {
      db.close();
    }

    const result = await loadDashboard({
      includeMarketData: false,
      dataDir,
      migrationsDir: MIGRATIONS_DIR,
    });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    const state = result.state;

    expect(state.transactions.length).toBe(14);
    expect(state.navSeries.at(-1)!.nav).toBeCloseTo(10637.58, 2);
    expect(state.openOptionPositions).toEqual([]);
    expect(state.openSharePositions).toEqual([]);
    expect(state.premiumTotals.gross).toBeCloseTo(255.37, 2);
    expect(state.premiumTotals.closed).toBeCloseTo(20.02, 2);
    expect(state.premiumTotals.net).toBeCloseTo(235.35, 2);
    const cumulative = state.externalFlows.reduce(
      (a, f) => a + f.signedAmount,
      0,
    );
    expect(cumulative).toBe(0);
    expect(state.externalFlows).toHaveLength(2);
    expect(state.warnings).toEqual([]);
  });
});

describe("dashboard projection (DB-backed)", () => {
  it("exposes a 'computed' projection when account has rate + target", async () => {
    writeFixture("999", SHORT_TX_CSV, SHORT_POS_CSV);
    const { openDb } = await import("@/lib/db/connect");
    const { runIngest } = await import("@/lib/ingest/run");
    const { configureAccount } = await import("@/lib/scripts/accountConfigure");
    const { loadDashboard } = await import("@/lib/server/dashboard");

    const dataDir = path.join(tempRoot, "data");
    const dbPath = path.join(dataDir, "portfolio.db");
    const db = openDb(dbPath);
    try {
      runIngest(db, dataDir);
      configureAccount(db, {
        account: "schwab:999",
        primary: true,
        seedDate: "2026-01-02",
        seedValue: 10000,
        marketDataEnabled: false,
        expectedRealReturn: 0.07,
        targetValue: 100_000,
      });
    } finally {
      db.close();
    }

    const result = await loadDashboard({
      includeMarketData: false,
      dataDir,
      migrationsDir: MIGRATIONS_DIR,
    });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.projection.kind).toBe("computed");
    if (result.projection.kind !== "computed") return;
    expect(result.projection.rate).toBe(0.07);
    expect(result.projection.years).toBeGreaterThan(0);
    expect(result.projection.targetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("exposes 'unconfigured' projection when account has no rate or target", async () => {
    writeFixture("999", SHORT_TX_CSV, SHORT_POS_CSV);
    const { openDb } = await import("@/lib/db/connect");
    const { runIngest } = await import("@/lib/ingest/run");
    const { configureAccount } = await import("@/lib/scripts/accountConfigure");
    const { loadDashboard } = await import("@/lib/server/dashboard");

    const dataDir = path.join(tempRoot, "data");
    const dbPath = path.join(dataDir, "portfolio.db");
    const db = openDb(dbPath);
    try {
      runIngest(db, dataDir);
      configureAccount(db, {
        account: "schwab:999",
        primary: true,
        seedDate: "2026-01-02",
        seedValue: 10000,
        marketDataEnabled: false,
      });
    } finally {
      db.close();
    }

    const result = await loadDashboard({
      includeMarketData: false,
      dataDir,
      migrationsDir: MIGRATIONS_DIR,
    });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.projection.kind).toBe("unconfigured");
  });
});
