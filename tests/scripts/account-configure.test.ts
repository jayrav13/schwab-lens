import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import path from "node:path";
import { runMigrations } from "@/lib/db/migrate";
import {
  upsertAccount,
  getAccountByExternalId,
} from "@/lib/db/repos/accounts";
import {
  parseFlags,
  configureNonInteractive,
} from "@/scripts/account-configure";

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

describe("parseFlags", () => {
  it("returns an empty object when no flags are passed", () => {
    expect(parseFlags([])).toEqual({});
  });

  it("parses --account, --seed-date, --seed-value, --benchmark", () => {
    const flags = parseFlags([
      "--account=520",
      "--seed-date=2026-01-15",
      "--seed-value=12345",
      "--benchmark=SPY",
    ]);
    expect(flags.account).toBe("520");
    expect(flags.seedDate).toEqual({ kind: "set", value: "2026-01-15" });
    expect(flags.seedValue).toEqual({ kind: "set", value: 12345 });
    expect(flags.benchmark).toEqual({ kind: "set", value: "SPY" });
  });

  it("treats --seed-date=- as a clear", () => {
    const flags = parseFlags(["--account=1", "--seed-date=-"]);
    expect(flags.seedDate).toEqual({ kind: "clear" });
  });

  it("rejects unknown flags", () => {
    expect(() => parseFlags(["--bogus=1"])).toThrow(/unknown flag/);
  });

  it("rejects malformed flags missing =", () => {
    expect(() => parseFlags(["--account"])).toThrow(/expected --key=value/);
  });

  it("rejects bad seed-date format", () => {
    expect(() => parseFlags(["--seed-date=01/15/2026"])).toThrow(
      /expected YYYY-MM-DD/,
    );
  });

  it("rejects negative seed-value", () => {
    expect(() => parseFlags(["--seed-value=-100"])).toThrow(
      /expected non-negative number/,
    );
  });
});

describe("configureNonInteractive", () => {
  it("requires --account", () => {
    const db = makeDb();
    expect(() =>
      configureNonInteractive({ seedDate: { kind: "set", value: "2026-01-01" } }, db),
    ).toThrow(/--account is required/);
  });

  it("requires at least one update flag", () => {
    const db = makeDb();
    expect(() => configureNonInteractive({ account: "100" }, db)).toThrow(
      /at least one of --seed-date, --seed-value, --benchmark/,
    );
  });

  it("errors clearly when the account is unknown", () => {
    const db = makeDb();
    expect(() =>
      configureNonInteractive(
        {
          account: "999",
          seedDate: { kind: "set", value: "2026-01-01" },
          seedValue: { kind: "set", value: 1000 },
        },
        db,
      ),
    ).toThrow(/external_id="999" not found/);
  });

  it("sets seed_date and seed_value on a known account", () => {
    const db = makeDb();
    upsertAccount(db, { externalId: "520", label: "Demo" });

    configureNonInteractive(
      {
        account: "520",
        seedDate: { kind: "set", value: "2026-01-15" },
        seedValue: { kind: "set", value: 12345 },
      },
      db,
    );

    const after = getAccountByExternalId(db, "520");
    expect(after?.seedDate).toBe("2026-01-15");
    expect(after?.seedValue).toBe(12345);
  });

  it("sets benchmark independently", () => {
    const db = makeDb();
    upsertAccount(db, { externalId: "520", label: "Demo" });

    configureNonInteractive(
      { account: "520", benchmark: { kind: "set", value: "SPY" } },
      db,
    );

    expect(getAccountByExternalId(db, "520")?.benchmark).toBe("SPY");
  });

  it("clears seed_date and seed_value when both are set to clear", () => {
    const db = makeDb();
    const account = upsertAccount(db, { externalId: "520", label: "Demo" });
    // Seed it first.
    configureNonInteractive(
      {
        account: "520",
        seedDate: { kind: "set", value: "2026-01-01" },
        seedValue: { kind: "set", value: 5000 },
      },
      db,
    );
    expect(getAccountByExternalId(db, "520")?.seedDate).toBe("2026-01-01");

    configureNonInteractive(
      {
        account: "520",
        seedDate: { kind: "clear" },
        seedValue: { kind: "clear" },
      },
      db,
    );

    const after = getAccountByExternalId(db, account.externalId);
    expect(after?.seedDate).toBeNull();
    expect(after?.seedValue).toBeNull();
  });

  it("only updates fields that are provided (preserves the rest)", () => {
    const db = makeDb();
    upsertAccount(db, { externalId: "520", label: "Demo" });
    configureNonInteractive(
      {
        account: "520",
        seedDate: { kind: "set", value: "2026-01-01" },
        seedValue: { kind: "set", value: 5000 },
        benchmark: { kind: "set", value: "SPY" },
      },
      db,
    );

    // Now only update the benchmark.
    configureNonInteractive(
      { account: "520", benchmark: { kind: "set", value: "QQQ" } },
      db,
    );

    const after = getAccountByExternalId(db, "520");
    expect(after?.seedDate).toBe("2026-01-01");
    expect(after?.seedValue).toBe(5000);
    expect(after?.benchmark).toBe("QQQ");
  });
});

describe("parseFlags — label", () => {
  it("parses --label", () => {
    const flags = parseFlags(["--account=1", "--label=My Account"]);
    expect(flags.label).toEqual({ kind: "set", value: "My Account" });
  });

  it("rejects empty --label", () => {
    expect(parseFlags(["--label="]).label).toEqual({ kind: "keep" });
  });

  it("rejects --label=-", () => {
    expect(() => parseFlags(["--label=-"])).toThrow(/label cannot be cleared/);
  });
});

describe("configureNonInteractive — label", () => {
  it("renames an account", () => {
    const db = makeDb();
    upsertAccount(db, { externalId: "100", label: "Old" });
    configureNonInteractive(
      { account: "100", label: { kind: "set", value: "New Label" } },
      db,
    );
    expect(getAccountByExternalId(db, "100")?.label).toBe("New Label");
  });
});
